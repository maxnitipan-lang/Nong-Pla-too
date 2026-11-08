// Voice for the "น้องปลาทู" assistant, via the same Gemini key as the chat.
//
//   POST /api/voice/tts   { text }            → audio/wav (natural Thai voice)
//   POST /api/voice/stt   body = audio/wav    → { text } (Thai transcription)
//
// The browser prefers its own speech engines when they're good enough (Chrome's
// live recognition, an installed Thai voice) and falls back to these routes
// otherwise, so voice works on any kiosk/phone browser. Both routes are rate
// limited per IP to protect the free-tier quota.
//
//   GEMINI_API_KEY / CHAT_API_KEY   same key as the chatbot
//   TTS_MODEL   default "gemini-3.8-flash-tts"     (Thai-capable; the -lite TTS is not)
//   TTS_VOICE   default "Puck" (upbeat)  — see https://ai.google.dev/gemini-api/docs/speech-generation
//   STT_MODEL   default = CHAT_MODEL or "gemini-3.1-flash-lite"

import express from "express";

const API_KEY = process.env.GEMINI_API_KEY || process.env.CHAT_API_KEY || "";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TTS_MODEL = process.env.TTS_MODEL || "gemini-3.8-flash-tts";
const TTS_VOICE = process.env.TTS_VOICE || "Puck";
const STT_MODEL = process.env.STT_MODEL || process.env.CHAT_MODEL || "gemini-3.1-flash-lite";

const MAX_TTS_CHARS = 1200;
const MAX_STT_BYTES = 6 * 1024 * 1024; // ~3 min of 16 kHz mono WAV

export const isVoiceConfigured = () => API_KEY.length > 0;

// ---------------------------------------------------------------------------
// Rate limiting (per IP, sliding minute)
// ---------------------------------------------------------------------------

const hits = new Map();
function allow(req, bucket, perMinute) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(t => now - t < 60_000);
  if (recent.length >= perMinute) return false;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
  return true;
}

// ---------------------------------------------------------------------------
// WAV helpers
// ---------------------------------------------------------------------------

/** Wrap raw 16-bit little-endian mono PCM in a WAV header. */
export function pcmToWav(pcm, sampleRate = 24_000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Audio from the API may be a full WAV or headerless PCM ("audio/l16;rate=24000"). */
function toWav(data, mimeType = "") {
  if (data.subarray(0, 4).toString("ascii") === "RIFF") return data;
  const rate = Number(/rate=(\d+)/i.exec(mimeType)?.[1]) || 24_000;
  return pcmToWav(data, rate);
}

/** Find the first base64 audio blob anywhere in a response (both API shapes). */
function findAudio(node) {
  if (!node || typeof node !== "object") return null;
  const part = node;
  const inline = part.inlineData ?? part.inline_data;
  if (inline?.data) return { data: inline.data, mimeType: inline.mimeType ?? inline.mime_type ?? "" };
  const mime = part.mime_type ?? part.mimeType ?? "";
  if (typeof part.data === "string" && part.data.length > 100 && (mime.startsWith("audio") || !mime)) {
    return { data: part.data, mimeType: mime };
  }
  for (const value of Object.values(node)) {
    const found = findAudio(value);
    if (found) return found;
  }
  return null;
}

async function postJson(url, body, timeoutMs) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res.json();
}

/** Which TTS API answered last (0 = Interactions, 1 = generateContent). */
let preferredTts = 0;

const ttsCache = new Map();
const TTS_CACHE_MAX = 300;

export async function synthesizeSpeech(text) {
  const cached = ttsCache.get(text);
  if (cached) return cached;

  let audio = null;
  let lastError;
  // Current Interactions API first, then the older generateContent shape.
  const attempts = [
    () =>
      postJson(
        `${API_BASE}/interactions`,
        {
          model: TTS_MODEL,
          input: [
            {
              type: "user_input",
              // Only the words to say: a style instruction in the text gets read out loud.
              content: [{ type: "text", text }],
            },
          ],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice: TTS_VOICE }] },
        },
        15_000
      ),
    () =>
      postJson(
        `${API_BASE}/models/${TTS_MODEL}:generateContent`,
        {
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
          },
        },
        15_000
      ),
  ];
  // Try the API that worked last time first: when the first one is failing, waiting for it on
  // every sentence made replies take 30 s.
  const order = preferredTts === 1 ? [1, 0] : [0, 1];
  for (const i of order) {
    try {
      audio = findAudio(await attempts[i]());
      if (audio) {
        preferredTts = i;
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (!audio) throw lastError instanceof Error ? lastError : new Error("ไม่ได้รับเสียงจาก AI");

  const wav = toWav(Buffer.from(audio.data, "base64"), audio.mimeType);
  if (ttsCache.size >= TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value);
  ttsCache.set(text, wav);
  return wav;
}

// ---------------------------------------------------------------------------
// Speech to text (fallback for browsers without live recognition)
// ---------------------------------------------------------------------------

export async function transcribeSpeech(wav) {
  const json = await postJson(
    `${API_BASE}/models/${STT_MODEL}:generateContent`,
    {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: "audio/wav", data: wav.toString("base64") } },
            {
              text:
                "ถอดความเสียงพูดในไฟล์นี้เป็นข้อความภาษาไทยตามที่พูดจริงทุกคำ " +
                "ตอบเฉพาะข้อความที่ถอดได้ ไม่ต้องอธิบาย ไม่ต้องใส่เวลา (timestamp) หรือคำบรรยายเสียง " +
                "ถ้าไม่มีเสียงคนพูด ให้ตอบว่างเปล่า",
            },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    },
    30_000
  );
  const text = json.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("") ?? "";
  return cleanTranscript(text);
}

/**
 * The model sometimes "transcribes" silence or noise as a timestamp ("00:00"),
 * a sound tag ("[เสียงลม]", "(silence)") or punctuation. Those are not questions —
 * return "" so the app says it did not hear anything instead of asking the bot "00:00".
 */
export function cleanTranscript(raw) {
  const text = raw
    .replace(/^["'“”\s]+|["'“”\s]+$/g, "")
    .replace(/\[[^\]]*\]|\([^)]*(silence|noise|music|เสียง|เงียบ)[^)]*\)/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return "";
  if (/^[\d\s:.,\-–—]+$/.test(text)) return ""; // "00:00", "0:01 - 0:03"
  if (!/[\p{L}]/u.test(text)) return ""; // only punctuation / symbols
  if (/^(no speech|silence|inaudible|ไม่มีเสียง(พูด)?|ไม่ได้ยิน)$/i.test(text)) return "";
  return text;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerVoiceRoutes(app) {
  // Make the common phrases' voice in the background shortly after start-up (not in tests).
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) setTimeout(() => void warmVoiceCache().catch(() => undefined), 15_000).unref?.();
  app.get("/api/voice/status", (_req, res) => {
    res.json({ ai: isVoiceConfigured() });
  });

  app.post("/api/voice/tts", async (req, res) => {
    if (!isVoiceConfigured()) return res.status(503).json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" });
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, MAX_TTS_CHARS) : "";
    if (!text) return res.status(400).json({ error: "ไม่มีข้อความ" });
    // Replies are spoken a sentence at a time (~3–5 requests per reply).
    if (!allow(req, "tts", 90)) return res.status(429).json({ error: "ขอเสียงบ่อยเกินไป" });
    try {
      const wav = await synthesizeSpeech(text);
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(wav);
    } catch (error) {
      console.warn("[Voice] TTS failed:", error instanceof Error ? error.message : error);
      res.status(502).json({ error: "สร้างเสียงไม่สำเร็จ" });
    }
  });

  app.post(
    "/api/voice/stt",
    express.raw({ type: ["audio/wav", "audio/x-wav", "application/octet-stream"], limit: MAX_STT_BYTES }),
    async (req, res) => {
      if (!isVoiceConfigured()) return res.status(503).json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" });
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 1000 || body.subarray(0, 4).toString("ascii") !== "RIFF") {
        return res.status(400).json({ error: "ไฟล์เสียงไม่ถูกต้อง" });
      }
      if (!allow(req, "stt", 20)) return res.status(429).json({ error: "พูดถามบ่อยเกินไป — รอสักครู่" });
      try {
        res.json({ text: await transcribeSpeech(body) });
      } catch (error) {
        console.warn("[Voice] STT failed:", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "ฟังเสียงไม่สำเร็จ" });
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Voice made in advance
// ---------------------------------------------------------------------------

/**
 * Google takes ~6 s to make any sentence, however short. Make the voice for the
 * greeting and the most-asked ready-made answers once at start-up, so those
 * play instantly. Pieces are cut exactly like the browser cuts them (shared/speechText.js),
 * otherwise the cache would never match. One request every 2 s; stops on quota errors.
 */
export async function warmVoiceCache({ gapMs = 2000, limit = 45 } = {}) {
  if (!API_KEY) return { made: 0 };
  const [{ cleanForSpeech, speechPieces, GREETING_PHRASE }, { readyAnswerTexts }, { getCampusSettings }] =
    await Promise.all([import("../shared/speechText.js"), import("./chatFaq.js"), import("./db.js")]);
  const settings = await getCampusSettings().catch(() => null);
  const texts = [GREETING_PHRASE, ...(settings ? readyAnswerTexts(settings) : [])];
  const pieces = [...new Set(texts.flatMap(t => speechPieces(cleanForSpeech(t))))].slice(0, limit);
  let made = 0;
  for (const piece of pieces) {
    if (ttsCache.has(piece)) continue;
    try {
      await synthesizeSpeech(piece);
      made++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Voice] pre-made voice stopped after ${made}: ${message.slice(0, 120)}`);
      if (/429|quota|exhausted/i.test(message)) break;
    }
    await new Promise(r => setTimeout(r, gapMs));
  }
  console.log(`[Voice] pre-made voice for ${made} of ${pieces.length} phrases`);
  return { made, total: pieces.length };
}
