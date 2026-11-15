// What people ask Nong Platoo, and what Nong Platoo learns from it.
//
// Every question is recorded in the database (table chat_learned), grouped by topic:
//   building  ตึกและสถานที่   news  ข่าวสาร   program  สาขาและการเรียน   offtopic  นอกเรื่อง   other  อื่น ๆ
// with how often it was asked, how it was answered (ready answer, AI, learned, news, failed),
// whether that answer was unsure, and whether someone said it was wrong ("ไม่ใช่", "ผิด").
// Admins see it all in /admin/learned ("คำถามจาก AI") and write the answer for a question.
//
// Approved answers are used two ways:
//   - the same question again → the approved answer, instantly, with no AI tokens,
//   - similar questions → the AI gets the approved answers as checked knowledge (adminNotes).
//
// Safety rules (so a wrong or personal answer does not spread):
//   - nothing is reused until an admin approves it,
//   - each new AI answer is checked by asking the AI a second time: if the two answers name
//     different buildings, floors, numbers or routes, it is marked "ไม่ตรงกัน" (don't trust),
//   - questions with phone numbers, emails, ID numbers or crisis talk are never stored,
//   - follow-ups ("แล้วอันนั้นล่ะ"), time-sensitive and kiosk-relative questions are counted
//     but their answers are not offered for reuse.

import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "./db.js";
import { normalizeQuestion, similarity } from "./chatFaq.js";

/** How close a new question must be to a learned one. */
const MATCH = 0.9;
/** Reload the approved answers from the database at most this often. */
const RELOAD_MS = 5 * 60 * 1000;

const FOLLOW_UP = /^(แล้ว|และ|ส่วน)|ล่ะ|อันนั้น|อันนี้|ที่ว่า|ข้างบน|เมื่อกี้|มันคือ|^(and|what about|how about)\b|\b(that|it|this one)\b\??$/i;
const TIME_SENSITIVE = /วันนี้|พรุ่งนี้|เมื่อวาน|ตอนนี้|ล่าสุด|ข่าว|ประกาศ|อากาศ|ฝนตก|กี่โมงแล้ว|today|tomorrow|yesterday|right now|latest|news|weather/i;
const KIOSK_RELATIVE = /ใกล้|ไกล|ตรงนี้|จากนี่|จากที่นี่|ข้างๆ|near|far|from here|close to me/i;
const PERSONAL = /\d{3}[-\s]?\d{3}[-\s]?\d{3,4}|\d{13}|@[\w-]+\.|รหัสผ่าน|password|เลขบัตร/i;
const CRISIS = /ฆ่าตัว|อยากตาย|ทำร้ายตัวเอง|ไม่อยากอยู่|suicide|kill myself|hurt myself/i;

/** "ไม่ใช่", "ผิดแล้ว", "that's wrong": the visitor says the last answer was wrong. */
export const CORRECTION = /^(ไม่ใช่|ไม่ช่าย|ผิด|ตอบผิด|มั่ว|ไม่ถูก|เปล่า)|ไม่ใช่(นะ|ครับ|ค่ะ|คะ|อันนี้|ตึกนี้|ที่นี่|แบบนั้น)|ผิดแล้ว|ข้อมูลผิด|ไม่ถูกต้อง|^no\b|\b(wrong|incorrect|not right|not correct|that's not)\b/i;

/** May this question be stored at all? (Never personal data or crisis talk.) */
export function isRecordable(question) {
  const q = String(question ?? "").trim();
  return q.length >= 2 && q.length <= 300 && !PERSONAL.test(q) && !CRISIS.test(q);
}

/** Could this question and AI answer be offered for reuse (after admin approval)? */
export function isLearnable(question, answer) {
  const q = String(question ?? "").trim();
  if (q.length < 4 || q.length > 200) return false;
  if (!answer || answer.source !== "ai" || !answer.reply) return false;
  return ![FOLLOW_UP, TIME_SENSITIVE, KIOSK_RELATIVE, PERSONAL, CRISIS, CORRECTION].some((re) => re.test(q));
}

const NEWS = /ข่าว|ประกาศ|กิจกรรม|งานวัน|เปิดบ้าน|ปฏิทิน|วันหยุด|สอบ.*วันไหน|news|event|announcement|calendar/i;
const BUILDING = /อยู่ไหน|อยู่ที่ไหน|ที่ไหน|ตรงไหน|ทางไป|ไปยังไง|ไปทางไหน|ตึก|อาคาร|ห้อง|ชั้น|โรงอาหาร|ห้องน้ำ|สุขา|ประตู|ที่จอด|แผนที่|นำทาง|where|building|room|floor|toilet|canteen|gate|parking|map|directions/i;
const PROGRAM = /สาขา|เรียน|หลักสูตร|ปวช|ปวส|ปริญญา|สมัคร|ค่าเทอม|ทุน|กยศ|ฝึกงาน|ทวิภาคี|จบแล้ว|อาชีพ|ครู|อาจารย์|เกรด|program|study|course|apply|admission|tuition|scholarship|teacher|career|internship/i;
const CAMPUS = /วิทยาลัย|น้องปลาทู|ผอ|ผู้อำนวยการ|นักเรียน|นักศึกษา|เทคนิค|college|campus|student|director/i;
const OFFTOPIC_FAQ = /^(off-|chat-|local-|greeting|thanks|bye|who-are-you|what-can-you-do|are-you-ai|en-(hello|thanks|bye|how-are-you|ai|who|joke|sing|weather|time|homework|politics|personal|compliment|sorry|ok|confused|bored|stress|travel|souvenir|province))/;

/** Topic group of a question (and its answer). */
export function classifyQuestion(question, answer = {}) {
  const q = String(question ?? "");
  if (answer.faqId && OFFTOPIC_FAQ.test(answer.faqId)) return "offtopic";
  if (answer.source === "news" || NEWS.test(q)) return "news";
  if (answer.routeToBuildingId || BUILDING.test(q)) return "building";
  if (PROGRAM.test(q)) return "program";
  if (!CAMPUS.test(q) && answer.source !== "faq") return "offtopic";
  return "other";
}

const UNSURE = /ไม่มีข้อมูล|ยังไม่มีข้อมูล|ไม่แน่ใจ|ยังไม่ทราบ|ไม่ทราบ|ตอบไม่ได้|ไม่สามารถ|ช่วยไม่ได้|ไม่พบข้อมูล|don't have (any )?information|not sure|can't answer|cannot answer|i don't know|no information/i;

/** Did Nong Platoo fail to answer, or say it doesn't know? */
export function isUnsure(answer = {}) {
  if (answer.source === "fallback" || answer.source === "faq-close") return true;
  return UNSURE.test(String(answer.reply ?? ""));
}

const idOf = (lang, key) => createHash("sha256").update(`${lang}|${key}`).digest("hex").slice(0, 32);
const digitsOf = (key) => key.match(/\d+/g)?.join(",") ?? "";

const COLUMNS = [
  "`verified` varchar(12) NOT NULL DEFAULT 'pending'",
  "`category` varchar(16) NOT NULL DEFAULT 'other'",
  "`lastSource` varchar(16) NOT NULL DEFAULT 'ai'",
  "`unsure` tinyint NOT NULL DEFAULT 0",
  "`reusable` tinyint NOT NULL DEFAULT 1",
  "`disputes` int NOT NULL DEFAULT 0",
  "`disputeNote` text NULL",
];

let tableReady = null;
async function ensureTable() {
  const db = await getDb();
  if (!db) return null;
  tableReady ??= db
    .execute(
      sql.raw(
        "CREATE TABLE IF NOT EXISTS `chat_learned` (" +
          "`id` varchar(40) NOT NULL, `lang` varchar(4) NOT NULL DEFAULT 'th', `question` text NOT NULL, `normalized` varchar(255) NOT NULL, " +
          "`answer` text NOT NULL, `routeTo` varchar(64) NULL, `action` varchar(32) NULL, `askCount` int NOT NULL DEFAULT 1, " +
          "`status` varchar(12) NOT NULL DEFAULT 'new', " +
          COLUMNS.join(", ") +
          ", `createdAt` timestamp NOT NULL DEFAULT (now()), " +
          "`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(), CONSTRAINT `chat_learned_id` PRIMARY KEY(`id`))"
      )
    )
    // Tables made by an older version get the newer columns (an error = it is already there).
    .then(async () => {
      for (const column of COLUMNS) await db.execute(sql.raw(`ALTER TABLE \`chat_learned\` ADD COLUMN ${column}`)).catch(() => undefined);
    })
    .catch((error) => {
      tableReady = null;
      throw error;
    });
  await tableReady;
  return db;
}

const rowsOf = (result) => (Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : result?.rows ?? []);

// ---------------------------------------------------------------- approved answers (in memory)

let memory = [];
let loadedAt = 0;
let loading = null;

async function load(force = false) {
  if (!force && Date.now() - loadedAt < RELOAD_MS) return memory;
  loading ??= (async () => {
    try {
      const db = await ensureTable();
      if (!db) return memory;
      const rows = rowsOf(await db.execute(sql`SELECT * FROM chat_learned WHERE status = 'approved' ORDER BY askCount DESC`));
      memory = rows.map((r) => ({ ...r, askCount: Number(r.askCount), digits: digitsOf(r.normalized) }));
      loadedAt = Date.now();
    } catch (error) {
      console.warn("[Learn] load failed:", error instanceof Error ? error.message : error);
      loadedAt = Date.now(); // don't hammer a broken database
    } finally {
      loading = null;
    }
    return memory;
  })();
  return loading;
}

/** After an admin edit: read the table again on the next question. */
export function forgetLearnedCache() {
  loadedAt = 0;
}

/** An approved answer for this question, or null. */
export async function learnedAnswer(question, lang = "th") {
  const key = normalizeQuestion(question);
  if (!key) return null;
  const rows = await load();
  const digits = digitsOf(key);
  let best = null;
  let bestScore = 0;
  for (const r of rows) {
    if (r.lang !== lang || r.digits !== digits) continue;
    const score = r.normalized === key ? 1 : similarity(r.normalized, key);
    if (score >= MATCH && score > bestScore) [best, bestScore] = [r, score];
  }
  if (!best) return null;
  return { reply: best.answer, routeToBuildingId: best.routeTo || null, action: best.action || null, source: "learned", learnedId: best.id };
}

/**
 * Approved answers as checked knowledge for the AI, so it can answer questions that are
 * similar but not word-for-word the same. Most-asked first, about `maxChars` long.
 */
export async function adminNotes(lang = "th", maxChars = 3000) {
  const rows = (await load().catch(() => [])).filter((r) => r.lang === lang);
  const lines = [];
  let size = 0;
  for (const r of rows) {
    const line = `- ถาม: ${r.question.replace(/\s+/g, " ").slice(0, 160)}\n  ตอบ: ${r.answer.replace(/\s+/g, " ").slice(0, 400)}`;
    if (size + line.length > maxChars) break;
    lines.push(line);
    size += line.length;
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- recording questions

/**
 * Record a question and how it was answered (or count it again). Never throws.
 * `askAgain` (optional) asks the AI the same question once more; used only for a new
 * reusable AI answer, to check it (see factsAgree).
 */
export async function recordQuestion(question, answer, lang = "th", askAgain = null) {
  try {
    if (!isRecordable(question) || !answer?.reply) return;
    const key = normalizeQuestion(question).slice(0, 250);
    if (!key) return;
    const db = await ensureTable();
    if (!db) return;
    const id = idOf(lang, key);
    const reusable = isLearnable(question, answer) ? 1 : 0;
    const category = classifyQuestion(question, answer);
    const unsure = isUnsure(answer) ? 1 : 0;
    const source = String(answer.source ?? "ai").replace("ai-cache", "ai").slice(0, 16);
    // A reusable AI answer is kept as it was first given (that is the one being checked);
    // anything else shows the latest answer, so the admin sees what people get now.
    const result = await db.execute(sql`
      INSERT INTO chat_learned (id, lang, question, normalized, answer, routeTo, action, category, lastSource, unsure, reusable)
      VALUES (${id}, ${lang}, ${String(question).trim().slice(0, 500)}, ${key}, ${answer.reply}, ${answer.routeToBuildingId ?? null},
              ${answer.action ?? null}, ${category}, ${source}, ${unsure}, ${reusable})
      ON DUPLICATE KEY UPDATE
        askCount = askCount + 1,
        lastSource = VALUES(lastSource),
        unsure = IF(status = 'approved', 0, VALUES(unsure)),
        answer = IF(status = 'new' AND (reusable = 0 OR VALUES(reusable) = 0 OR lastSource <> 'ai'), VALUES(answer), answer)`);
    const header = Array.isArray(result) ? result[0] : result;
    const isNew = Number(header?.affectedRows ?? 0) === 1;
    if (isNew && reusable && askAgain) await verify(id, answer, askAgain);
  } catch (error) {
    console.warn("[Learn] save failed:", error instanceof Error ? error.message : error);
  }
}

/** Kept for older callers. */
export const rememberQuestion = recordQuestion;

/** Someone said the answer to `question` was wrong: flag it for the admin, with what they said. */
export async function markDisputed(question, lang = "th", note = "") {
  try {
    if (!isRecordable(question)) return;
    const key = normalizeQuestion(question).slice(0, 250);
    const db = await ensureTable();
    if (!db || !key) return;
    const text = isRecordable(note) ? String(note).trim().slice(0, 300) : "";
    await db.execute(sql`UPDATE chat_learned SET disputes = disputes + 1, unsure = 1, disputeNote = ${text} WHERE id = ${idOf(lang, key)}`);
  } catch (error) {
    console.warn("[Learn] dispute failed:", error instanceof Error ? error.message : error);
  }
}

/** The facts in an answer that must not change between two answers to the same question. */
export function answerFacts(reply, routeTo = null) {
  const t = String(reply ?? "");
  const facts = new Set();
  for (const m of t.matchAll(/(?:อาคาร|ตึก|building)\s*(\d+)/gi)) facts.add(`b${m[1]}`);
  for (const m of t.matchAll(/(?:ชั้น|floor)\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*floor/gi)) facts.add(`f${m[1] ?? m[2]}`);
  for (const m of t.matchAll(/\d[\d,.-]*\d|\d/g)) facts.add(`n${m[0].replace(/,/g, "")}`);
  if (routeTo) facts.add(`r${routeTo}`);
  return facts;
}

/**
 * Do two AI answers say the same thing? Same route, same buildings and floors, and most of
 * the same numbers. (The wording may differ; the facts may not.)
 */
export function factsAgree(a, b) {
  const fa = answerFacts(a.reply, a.routeToBuildingId);
  const fb = answerFacts(b.reply, b.routeToBuildingId);
  const pick = (set, p) => [...set].filter((x) => x.startsWith(p)).sort().join("|");
  for (const p of ["r", "b", "f"]) if (pick(fa, p) !== pick(fb, p)) return false;
  const na = [...fa].filter((x) => x.startsWith("n"));
  const nb = new Set([...fb].filter((x) => x.startsWith("n")));
  if (!na.length && !nb.size) return true;
  const shared = na.filter((x) => nb.has(x)).length;
  return shared / Math.max(na.length, nb.size) >= 0.6;
}

async function verify(id, first, askAgain) {
  let verdict = "pending";
  try {
    const second = await askAgain();
    if (second?.source === "ai" && second.reply) verdict = factsAgree(first, second) ? "agree" : "mismatch";
  } catch {
    /* the AI is busy: stays "pending" (the admin can still judge it) */
  }
  try {
    const db = await ensureTable();
    await db?.execute(sql`UPDATE chat_learned SET verified = ${verdict}, unsure = IF(${verdict} = 'mismatch', 1, unsure) WHERE id = ${id}`);
  } catch {
    /* best effort */
  }
}

// ---------------------------------------------------------------- admin

export async function listLearned() {
  const db = await ensureTable();
  if (!db) return [];
  const rows = rowsOf(await db.execute(sql`SELECT * FROM chat_learned ORDER BY askCount DESC, updatedAt DESC LIMIT 1000`));
  return rows.map((r) => ({
    ...r,
    askCount: Number(r.askCount),
    disputes: Number(r.disputes ?? 0),
    unsure: Number(r.unsure ?? 0) === 1,
    reusable: Number(r.reusable ?? 1) === 1,
    updatedAt: new Date(r.updatedAt).getTime(),
    verified: r.verified ?? "pending",
    category: r.category ?? "other",
    inUse: r.status === "approved",
  }));
}

export async function updateLearned({ id, answer, status, category }) {
  const db = await ensureTable();
  if (!db) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  // An answer written by the admin is approved and clears "unsure" and the disputes.
  if (answer !== undefined)
    await db.execute(sql`UPDATE chat_learned SET answer = ${answer}, status = 'approved', unsure = 0, disputes = 0, disputeNote = NULL WHERE id = ${id}`);
  if (status !== undefined) await db.execute(sql`UPDATE chat_learned SET status = ${status} WHERE id = ${id}`);
  if (category !== undefined) await db.execute(sql`UPDATE chat_learned SET category = ${category} WHERE id = ${id}`);
  forgetLearnedCache();
  return { ok: true };
}

/** Approve every waiting AI answer that was given the same way twice (and nobody disputed). */
export async function approveAgreed() {
  const db = await ensureTable();
  if (!db) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  await db.execute(sql`UPDATE chat_learned SET status = 'approved' WHERE status = 'new' AND verified = 'agree' AND reusable = 1 AND disputes = 0`);
  forgetLearnedCache();
  return { ok: true };
}

export async function getLearned(id) {
  const db = await ensureTable();
  if (!db) return null;
  return rowsOf(await db.execute(sql`SELECT * FROM chat_learned WHERE id = ${id} LIMIT 1`))[0] ?? null;
}

export async function deleteLearned(id) {
  const db = await ensureTable();
  if (!db) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  await db.execute(sql`DELETE FROM chat_learned WHERE id = ${id}`);
  forgetLearnedCache();
  return { ok: true };
}
