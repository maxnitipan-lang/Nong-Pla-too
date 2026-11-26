// Nong Platoo's voice clips kept in the database, so a sentence is paid for once.
//
//   tts_audio  one row per (voice, sentence): the WAV (base64), how often it was played, when last
//
// The memory cache in voice.js is wiped whenever Render sleeps or restarts; this table is not.
// Created on first use (nothing to migrate). Every function swallows database errors: without a
// database, or if it is down, the voice works exactly as before (just made again each time).

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db.js";

/** Most clips kept (~150–400 KB each). The least recently played go first. */
const STORE_MAX = Math.max(10, Number(process.env.TTS_STORE_MAX) || 1500);
/** A clip larger than this (base64) is not stored: one database row must stay small. */
const MAX_STORED_CHARS = 5_000_000;
/** Check the size limit every this many new clips (not on every save). */
const TRIM_EVERY = 20;

let ready = null;
async function db() {
  const database = await getDb().catch(() => null);
  if (!database) return null;
  ready ??= database
    .execute(
      sql.raw(
        "CREATE TABLE IF NOT EXISTS `tts_audio` (" +
          "`key` char(64) NOT NULL, `voice` varchar(120) NOT NULL, `text` text NOT NULL, `wav` mediumtext NOT NULL, " +
          "`uses` int NOT NULL DEFAULT 0, `createdAt` timestamp NOT NULL DEFAULT (now()), " +
          "`lastUsedAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `tts_audio_key` PRIMARY KEY(`key`))"
      )
    )
    .catch((error) => {
      ready = null;
      throw error;
    });
  try {
    await ready;
    return database;
  } catch (error) {
    console.warn("[ttsStore] table not ready:", error instanceof Error ? error.message : error);
    return null;
  }
}

const rowsOf = (result) => (Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : result?.rows ?? []);

/** One key per voice and sentence: another voice (or model) never plays an old clip. */
export const clipKey = (voice, text) => createHash("sha256").update(`${voice}\n${text}`).digest("hex");

/** The stored clip for this voice and sentence, or null. */
export async function loadSpeech(voice, text) {
  try {
    const database = await db();
    if (!database) return null;
    const key = clipKey(voice, text);
    const row = rowsOf(await database.execute(sql`SELECT wav FROM tts_audio WHERE \`key\` = ${key} LIMIT 1`))[0];
    if (!row?.wav) return null;
    void database.execute(sql`UPDATE tts_audio SET uses = uses + 1, lastUsedAt = now() WHERE \`key\` = ${key}`).catch(() => undefined);
    return Buffer.from(String(row.wav), "base64");
  } catch {
    return null;
  }
}

let savedSinceTrim = 0;

/** Keep a newly made clip. */
export async function saveSpeech(voice, text, wav) {
  try {
    const base64 = Buffer.from(wav).toString("base64");
    if (base64.length > MAX_STORED_CHARS) return;
    const database = await db();
    if (!database) return;
    await database.execute(
      sql`INSERT INTO tts_audio (\`key\`, voice, text, wav, uses, createdAt, lastUsedAt)
          VALUES (${clipKey(voice, text)}, ${voice.slice(0, 120)}, ${text}, ${base64}, 1, now(), now())
          ON DUPLICATE KEY UPDATE wav = VALUES(wav), lastUsedAt = now()`
    );
    if (++savedSinceTrim >= TRIM_EVERY) {
      savedSinceTrim = 0;
      await trimStore(database);
    }
  } catch {
    /* only a saving */
  }
}

/** Over the limit → forget the clips that have not been played for the longest time. */
async function trimStore(database) {
  const count = Number(rowsOf(await database.execute(sql.raw("SELECT COUNT(*) AS n FROM `tts_audio`")))[0]?.n ?? 0);
  const extra = count - STORE_MAX;
  if (extra > 0) await database.execute(sql`DELETE FROM tts_audio ORDER BY lastUsedAt ASC LIMIT ${extra}`);
}
