// AI answers and AI usage kept in the database, so they survive a restart of the server.
//
//   ai_answer_cache  the AI's answer to a question (same question again → same answer, no AI call)
//   ai_usage_daily   per day: AI calls, answers, "busy / out of quota" (429), average time
//
// Both tables are new and only used here (created on first use, nothing else changes).
// Every function swallows database errors: without a database, or if it is down, the chat
// still works exactly as before (just without these extras).

import { sql } from "drizzle-orm";
import { getDb } from "./db.js";

/** A stored answer is used for this long (the memory cache in chat.js uses the same). */
export const STORED_ANSWER_MS = 6 * 60 * 60 * 1000;

let ready = null;
async function db() {
  const database = await getDb().catch(() => null);
  if (!database) return null;
  ready ??= (async () => {
    await database.execute(
      sql.raw(
        "CREATE TABLE IF NOT EXISTS `ai_answer_cache` (" +
          "`key` varchar(255) NOT NULL, `question` text NOT NULL, `answer` text NOT NULL, " +
          "`createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `ai_answer_cache_key` PRIMARY KEY(`key`))"
      )
    );
    await database.execute(
      sql.raw(
        "CREATE TABLE IF NOT EXISTS `ai_usage_daily` (" +
          "`day` varchar(10) NOT NULL, `calls` int NOT NULL DEFAULT 0, `answered` int NOT NULL DEFAULT 0, " +
          "`busy` int NOT NULL DEFAULT 0, `failed` int NOT NULL DEFAULT 0, `totalMs` bigint NOT NULL DEFAULT 0, " +
          "`cacheHits` int NOT NULL DEFAULT 0, CONSTRAINT `ai_usage_daily_day` PRIMARY KEY(`day`))"
      )
    );
  })().catch((error) => {
    ready = null;
    throw error;
  });
  try {
    await ready;
    return database;
  } catch (error) {
    console.warn("[aiStore] tables not ready:", error instanceof Error ? error.message : error);
    return null;
  }
}

const rowsOf = (result) => (Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : result?.rows ?? []);

/** Today in Thailand, "2026-11-18". */
export const thaiDay = (now = Date.now()) => new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- answers

/** The stored answer for a cache key (or null). */
export async function getStoredAnswer(key) {
  if (!key) return null;
  try {
    const database = await db();
    if (!database) return null;
    // The age comes from the database itself: its times have no time zone, so reading
    // createdAt here would be off by the server's offset (7 hours in Thailand).
    const rows = rowsOf(
      await database.execute(sql`SELECT answer, TIMESTAMPDIFF(SECOND, createdAt, NOW()) AS age FROM ai_answer_cache WHERE \`key\` = ${key.slice(0, 255)} LIMIT 1`)
    );
    const row = rows[0];
    if (!row) return null;
    const ageMs = Number(row.age) * 1000;
    if (!(ageMs >= 0 && ageMs < STORED_ANSWER_MS)) return null;
    const at = Date.now() - ageMs;
    return { answer: JSON.parse(row.answer), at };
  } catch {
    return null;
  }
}

/** Keep an AI answer for the same question later. */
export async function storeAnswer(key, question, answer) {
  if (!key) return;
  try {
    const database = await db();
    if (!database) return;
    const json = JSON.stringify(answer);
    await database.execute(
      sql`INSERT INTO ai_answer_cache (\`key\`, question, answer, createdAt) VALUES (${key.slice(0, 255)}, ${question}, ${json}, now())
          ON DUPLICATE KEY UPDATE question = VALUES(question), answer = VALUES(answer), createdAt = now()`
    );
  } catch {
    /* only a speed-up */
  }
}

/** Forget every stored answer (buildings, news or settings changed). */
export async function clearStoredAnswers() {
  try {
    const database = await db();
    if (database) await database.execute(sql.raw("DELETE FROM `ai_answer_cache`"));
  } catch {
    /* only a speed-up */
  }
}

// ---------------------------------------------------------------- usage

/**
 * Count one AI attempt: "answered" (ok, with ms), "busy" (429 / 503), "failed" (anything else),
 * or "cache" (a repeat question answered from the stored answers, no AI call).
 */
export async function countAiUse(kind, ms = 0) {
  try {
    const database = await db();
    if (!database) return;
    const day = thaiDay();
    const answered = kind === "answered" ? 1 : 0;
    const busy = kind === "busy" ? 1 : 0;
    const failed = kind === "failed" ? 1 : 0;
    const cacheHits = kind === "cache" ? 1 : 0;
    const calls = kind === "cache" ? 0 : 1;
    const totalMs = answered ? Math.round(ms) : 0;
    await database.execute(
      sql`INSERT INTO ai_usage_daily (day, calls, answered, busy, failed, totalMs, cacheHits)
          VALUES (${day}, ${calls}, ${answered}, ${busy}, ${failed}, ${totalMs}, ${cacheHits})
          ON DUPLICATE KEY UPDATE calls = calls + ${calls}, answered = answered + ${answered}, busy = busy + ${busy},
            failed = failed + ${failed}, totalMs = totalMs + ${totalMs}, cacheHits = cacheHits + ${cacheHits}`
    );
  } catch {
    /* counting must never break the chat */
  }
}

/** The last `days` days, newest first: { day, calls, answered, busy, failed, cacheHits, avgMs }. */
export async function aiUsage(days = 7) {
  try {
    const database = await db();
    if (!database) return [];
    const rows = rowsOf(
      await database.execute(sql`SELECT day, calls, answered, busy, failed, totalMs, cacheHits FROM ai_usage_daily ORDER BY day DESC LIMIT ${days}`)
    );
    return rows.map((r) => ({
      day: String(r.day),
      calls: Number(r.calls),
      answered: Number(r.answered),
      busy: Number(r.busy),
      failed: Number(r.failed),
      cacheHits: Number(r.cacheHits),
      avgMs: Number(r.answered) ? Math.round(Number(r.totalMs) / Number(r.answered)) : 0,
    }));
  } catch {
    return [];
  }
}
