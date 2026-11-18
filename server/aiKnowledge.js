// "ความรู้ของ AI": facts teachers type (or read from a PDF) in /admin/knowledge, for the AI only.
//
// Table ai_knowledge (new, created on first use). Each item has a title, the facts, a category,
// and optional dates: before validFrom or after validUntil the AI does not see it, so an old
// announcement stops being used on its own. The first time the table is made it gets the
// 2570 quota announcement (until now built into the code, shared/data/admission2570.js).
//
// Without a database (or if it is down) the AI uses the built-in announcement as before.

import { sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { ADMISSION_2570_SOURCE, admissionLines } from "../shared/data/admission2570.js";
import { apiKeysFrom } from "./chat.js";
import { thaiDay } from "./aiStore.js";

export const KNOWLEDGE_CATEGORIES = ["รับสมัคร", "การเรียน", "กิจกรรม", "บริการ", "ทั่วไป"];
/** The whole prompt stays small: items past this many characters are cut (the admin sees a warning). */
export const MAX_CONTENT = 20_000;

let ready = null;
async function db() {
  const database = await getDb().catch(() => null);
  if (!database) return null;
  ready ??= (async () => {
    await database.execute(
      sql.raw(
        "CREATE TABLE IF NOT EXISTS `ai_knowledge` (" +
          "`id` varchar(40) NOT NULL, `title` varchar(255) NOT NULL, `content` mediumtext NOT NULL, " +
          "`category` varchar(32) NOT NULL DEFAULT 'ทั่วไป', `validFrom` varchar(10) NOT NULL DEFAULT '', " +
          "`validUntil` varchar(10) NOT NULL DEFAULT '', `enabled` tinyint NOT NULL DEFAULT 1, `updatedBy` varchar(128) NOT NULL DEFAULT '', " +
          "`createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(), " +
          "CONSTRAINT `ai_knowledge_id` PRIMARY KEY(`id`))"
      )
    );
    // First time only: start with the announcement that used to be built into the code.
    const rows = rowsOf(await database.execute(sql.raw("SELECT COUNT(*) AS n FROM `ai_knowledge`")));
    if (Number(rows[0]?.n ?? 0) === 0) {
      await database.execute(
        sql`INSERT INTO ai_knowledge (id, title, content, category, updatedBy)
            VALUES ('admission-2570-quota', ${ADMISSION_2570_SOURCE}, ${admissionLines().slice(1).join("\n")}, 'รับสมัคร', 'ระบบ')`
      );
    }
  })().catch((error) => {
    ready = null;
    throw error;
  });
  await ready;
  return database;
}

const rowsOf = (result) => (Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : result?.rows ?? []);

const toItem = (r) => ({
  id: String(r.id),
  title: String(r.title),
  content: String(r.content),
  category: String(r.category),
  validFrom: String(r.validFrom ?? ""),
  validUntil: String(r.validUntil ?? ""),
  enabled: Boolean(Number(r.enabled)),
  updatedBy: String(r.updatedBy ?? ""),
  updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : "",
});

/** Whether an item is used today (enabled, and today is within its dates). */
export function isActive(item, today = thaiDay()) {
  if (!item.enabled) return false;
  if (item.validFrom && today < item.validFrom) return false;
  if (item.validUntil && today > item.validUntil) return false;
  return true;
}

/** All items for the admin page (newest first). */
export async function listKnowledge() {
  const database = await db();
  if (!database) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  const rows = rowsOf(await database.execute(sql.raw("SELECT * FROM `ai_knowledge` ORDER BY `updatedAt` DESC")));
  return rows.map(toItem);
}

export async function saveKnowledge(input, by = "") {
  const database = await db();
  if (!database) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  const id = input.id || `k-${Date.now().toString(36)}`;
  await database.execute(
    sql`INSERT INTO ai_knowledge (id, title, content, category, validFrom, validUntil, enabled, updatedBy)
        VALUES (${id}, ${input.title}, ${input.content.slice(0, MAX_CONTENT)}, ${input.category}, ${input.validFrom}, ${input.validUntil}, ${input.enabled ? 1 : 0}, ${by})
        ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), category = VALUES(category),
          validFrom = VALUES(validFrom), validUntil = VALUES(validUntil), enabled = VALUES(enabled), updatedBy = VALUES(updatedBy)`
  );
  forget();
  return { id };
}

export async function deleteKnowledge(id) {
  const database = await db();
  if (!database) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล");
  await database.execute(sql`DELETE FROM ai_knowledge WHERE id = ${id}`);
  forget();
}

// ---------------------------------------------------------------- for the AI's prompt

let cached = null; // { at, lines }
const CACHE_MS = 60_000;
const forget = () => {
  cached = null;
};

/**
 * Lines for the AI's prompt from today's items, or null when there is no database
 * (then the prompt keeps the built-in announcement).
 */
export async function knowledgeLines() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.lines;
  try {
    const database = await db();
    if (!database) return null;
    const rows = rowsOf(await database.execute(sql.raw("SELECT * FROM `ai_knowledge` WHERE `enabled` = 1 ORDER BY `category`, `updatedAt` DESC")));
    const today = thaiDay();
    const lines = rows
      .map(toItem)
      .filter((item) => isActive(item, today))
      .flatMap((item) => [
        `== ${item.title} (หมวด ${item.category}${item.validUntil ? ` · ใช้ได้ถึง ${item.validUntil}` : ""}) ==`,
        item.content.trim(),
        "",
      ]);
    cached = { at: Date.now(), lines };
    return lines;
  } catch (error) {
    console.warn("[knowledge] not loaded:", error instanceof Error ? error.message : error);
    return null;
  }
}

// ---------------------------------------------------------------- PDF → facts (for the admin to check)

const PDF_PROMPT = [
  "อ่านเอกสาร PDF นี้ (ประกาศหรือเอกสารของวิทยาลัยเทคนิคสมุทรสงคราม) แล้วเขียนเป็นข้อเท็จจริงสำหรับให้ AI ใช้ตอบคำถาม",
  "กฎ: ใช้เฉพาะข้อมูลที่อยู่ในเอกสารเท่านั้น ห้ามแต่งหรือเดาเพิ่ม · ถ้าอ่านตัวเลขหรือวันที่ไม่ชัด ให้เขียน [อ่านไม่ชัด]",
  "เขียนเป็นภาษาไทย ทีละบรรทัด สั้น กระชับ ครบทุกตัวเลข วันที่ เวลา จำนวน และเงื่อนไข · ตารางให้เขียนเป็นบรรทัดละแถว",
  'ตอบเป็น JSON เท่านั้น: {"title": "ชื่อเรื่องของเอกสาร", "category": "หนึ่งใน ' + KNOWLEDGE_CATEGORIES.join("/") + '", "validUntil": "YYYY-MM-DD (ค.ศ.) วันสุดท้ายที่ข้อมูลยังใช้ได้ ถ้าไม่รู้ให้เป็น \\"\\"", "content": "ข้อเท็จจริง"}',
].join("\n");

/** Ask Gemini to read a PDF. Returns a draft the admin checks before saving (never saved here). */
export async function readPdf(base64, model = process.env.CHAT_MODEL || "gemini-3.5-flash-lite") {
  const keys = apiKeysFrom();
  if (!keys.length) throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY");
  let lastError = "";
  for (const key of keys) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: "application/pdf", data: base64 } }, { text: PDF_PROMPT }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(120_000),
    }).catch((error) => ({ ok: false, status: 0, text: async () => String(error?.message ?? error) }));
    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      let draft;
      try {
        draft = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        draft = { title: "", content: text };
      }
      return {
        title: String(draft.title ?? "").slice(0, 255),
        category: KNOWLEDGE_CATEGORIES.includes(draft.category) ? draft.category : "ทั่วไป",
        validUntil: /^\d{4}-\d{2}-\d{2}$/.test(draft.validUntil ?? "") ? draft.validUntil : "",
        content: String(draft.content ?? "").slice(0, MAX_CONTENT),
      };
    }
    lastError = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (res.status !== 429 && res.status !== 503) break; // another key will not help
  }
  throw new Error(`AI อ่าน PDF ไม่สำเร็จ (${lastError})`);
}
