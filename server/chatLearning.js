// Nong Platoo learns from real questions.
//
// Every question the AI had to answer itself is kept in the database (table chat_learned)
// with its answer. Once an admin approves it in /admin/learned, the next person who asks
// gets that answer instantly, without spending AI tokens.
//
// Safety rules (so a wrong or personal answer does not spread):
//   - nothing is reused until an admin approves it (approve, edit, hide or delete),
//   - each new answer is checked by asking the AI a second time: if the two answers name
//     different buildings, floors, numbers or routes, it is marked "ไม่ตรงกัน" (don't trust),
//   - only single questions that make sense on their own (no "แล้วอันนั้นล่ะ" follow-ups),
//   - nothing time-sensitive (วันนี้ / ล่าสุด / ข่าว / weather), nothing about where the kiosk is
//     ("ใกล้ไหม", "near here"), nothing with phone numbers, emails or ID numbers, no crisis talk.

import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "./db.js";
import { normalizeQuestion, similarity } from "./chatFaq.js";

/** How close a new question must be to a learned one. */
const MATCH = 0.9;
/** Reload the learned answers from the database at most this often. */
const RELOAD_MS = 5 * 60 * 1000;

const FOLLOW_UP = /^(แล้ว|และ|ส่วน)|ล่ะ|อันนั้น|อันนี้|ที่ว่า|ข้างบน|เมื่อกี้|มันคือ|^(and|what about|how about)\b|\b(that|it|this one)\b\??$/i;
const TIME_SENSITIVE = /วันนี้|พรุ่งนี้|เมื่อวาน|ตอนนี้|ล่าสุด|ข่าว|ประกาศ|อากาศ|ฝนตก|กี่โมงแล้ว|today|tomorrow|yesterday|right now|latest|news|weather/i;
const KIOSK_RELATIVE = /ใกล้|ไกล|ตรงนี้|จากนี่|จากที่นี่|ข้างๆ|near|far|from here|close to me/i;
const PERSONAL = /\d{3}[-\s]?\d{3}[-\s]?\d{3,4}|\d{13}|@[\w-]+\.|รหัสผ่าน|password|เลขบัตร/i;
const CRISIS = /ฆ่าตัว|อยากตาย|ทำร้ายตัวเอง|ไม่อยากอยู่|suicide|kill myself|hurt myself/i;

/** Could this question and answer be reused for other people? */
export function isLearnable(question, answer) {
  const q = String(question ?? "").trim();
  if (q.length < 4 || q.length > 200) return false;
  if (!answer || answer.source !== "ai" || !answer.reply) return false;
  return ![FOLLOW_UP, TIME_SENSITIVE, KIOSK_RELATIVE, PERSONAL, CRISIS].some((re) => re.test(q));
}

const idOf = (lang, key) => createHash("sha256").update(`${lang}|${key}`).digest("hex").slice(0, 32);
const digitsOf = (key) => key.match(/\d+/g)?.join(",") ?? "";

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
          "`status` varchar(12) NOT NULL DEFAULT 'new', `verified` varchar(12) NOT NULL DEFAULT 'pending', " +
          "`createdAt` timestamp NOT NULL DEFAULT (now()), " +
          "`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(), CONSTRAINT `chat_learned_id` PRIMARY KEY(`id`))"
      )
    )
    // Tables made before the check existed get the column now (an error = it is already there).
    .then(() => db.execute(sql.raw("ALTER TABLE `chat_learned` ADD COLUMN `verified` varchar(12) NOT NULL DEFAULT 'pending'")).catch(() => undefined))
    .then(() => undefined)
    .catch((error) => {
      tableReady = null;
      throw error;
    });
  await tableReady;
  return db;
}

const rowsOf = (result) => (Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : result?.rows ?? []);

// ---------------------------------------------------------------- in-memory copy (approved only)

let memory = [];
let loadedAt = 0;
let loading = null;

async function load(force = false) {
  if (!force && Date.now() - loadedAt < RELOAD_MS) return memory;
  loading ??= (async () => {
    try {
      const db = await ensureTable();
      if (!db) return memory;
      const rows = rowsOf(await db.execute(sql`SELECT * FROM chat_learned WHERE status = 'approved'`));
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

/** Only answers an admin approved are given to visitors. */
const usable = (r) => r.status === "approved";

/** An approved learned answer for this question, or null. */
export async function learnedAnswer(question, lang = "th") {
  const key = normalizeQuestion(question);
  if (!key) return null;
  const rows = await load();
  const digits = digitsOf(key);
  let best = null;
  let bestScore = 0;
  for (const r of rows) {
    if (r.lang !== lang || r.digits !== digits || !usable(r)) continue;
    const score = r.normalized === key ? 1 : similarity(r.normalized, key);
    if (score >= MATCH && score > bestScore) [best, bestScore] = [r, score];
  }
  if (!best) return null;
  void bump(best.id); // count the reuse
  return { reply: best.answer, routeToBuildingId: best.routeTo || null, action: best.action || null, source: "learned", learnedId: best.id };
}

async function bump(id) {
  try {
    const db = await ensureTable();
    if (!db) return;
    await db.execute(sql`UPDATE chat_learned SET askCount = askCount + 1 WHERE id = ${id}`);
    const r = memory.find((x) => x.id === id);
    if (r) r.askCount += 1;
  } catch {
    /* counting is best effort */
  }
}

/**
 * Remember a question the AI answered (or count it again). Never throws.
 * `askAgain` (optional) asks the AI the same question once more; used only for a new
 * question, to check the first answer (see factsAgree).
 */
export async function rememberQuestion(question, answer, lang = "th", askAgain = null) {
  try {
    if (!isLearnable(question, answer)) return;
    const key = normalizeQuestion(question).slice(0, 250);
    if (!key) return;
    const db = await ensureTable();
    if (!db) return;
    const id = idOf(lang, key);
    // The first answer is kept (it is the one being checked); asking again only counts.
    const result = await db.execute(sql`
      INSERT INTO chat_learned (id, lang, question, normalized, answer, routeTo, action)
      VALUES (${id}, ${lang}, ${String(question).trim().slice(0, 500)}, ${key}, ${answer.reply}, ${answer.routeToBuildingId ?? null}, ${answer.action ?? null})
      ON DUPLICATE KEY UPDATE askCount = askCount + 1`);
    const header = Array.isArray(result) ? result[0] : result;
    const isNew = Number(header?.affectedRows ?? 0) === 1;
    if (isNew && askAgain) await verify(id, answer, askAgain);
  } catch (error) {
    console.warn("[Learn] save failed:", error instanceof Error ? error.message : error);
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
    await db?.execute(sql`UPDATE chat_learned SET verified = ${verdict} WHERE id = ${id}`);
  } catch {
    /* best effort */
  }
}

// ---------------------------------------------------------------- admin

export async function listLearned() {
  const db = await ensureTable();
  if (!db) return [];
  const rows = rowsOf(await db.execute(sql`SELECT * FROM chat_learned ORDER BY askCount DESC, updatedAt DESC LIMIT 500`));
  return rows.map((r) => {
    const row = { ...r, askCount: Number(r.askCount), updatedAt: new Date(r.updatedAt).getTime(), verified: r.verified ?? "pending" };
    return { ...row, inUse: usable(row) };
  });
}

export async function updateLearned({ id, answer, status }) {
  const db = await ensureTable();
  if (!db) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  if (answer !== undefined) await db.execute(sql`UPDATE chat_learned SET answer = ${answer}, status = 'approved' WHERE id = ${id}`);
  if (status !== undefined) await db.execute(sql`UPDATE chat_learned SET status = ${status} WHERE id = ${id}`);
  forgetLearnedCache();
  return { ok: true };
}

/** Approve every waiting answer the AI gave the same way twice. */
export async function approveAgreed() {
  const db = await ensureTable();
  if (!db) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  await db.execute(sql`UPDATE chat_learned SET status = 'approved' WHERE status = 'new' AND verified = 'agree'`);
  forgetLearnedCache();
  return { ok: true };
}

export async function deleteLearned(id) {
  const db = await ensureTable();
  if (!db) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  await db.execute(sql`DELETE FROM chat_learned WHERE id = ${id}`);
  forgetLearnedCache();
  return { ok: true };
}
