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

import express, { type Express, type Request } from "express";

const API_KEY = process.env.GEMINI_API_KEY || process.env.CHAT_API_KEY || "";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TTS_MODEL = process.env.TTS_MODEL || "gemini-3.8-flash-tts";
const TTS_VOICE = process.env.TTS_VOICE || "Puck";
const STT_MODEL = process.env.STT_MODEL || process.env.CHAT_MODEL || "gemini-3.1-flash-lite";
const TTS_STYLE = "น้ำเสียงผู้ชายวัยรุ่น เป็นมิตร สดใส สุภาพ พูดชัดเจน ความเร็วปกติ";

const MAX_TTS_CHARS = 1200;
const MAX_STT_BYTES = 6 * 1024 * 1024; // ~3 min of 16 kHz mono WAV

export const isVoiceConfigured = (): boolean => API_KEY.length > 0;

// ---------------------------------------------------------------------------
// Rate limiting (per IP, sliding minute)
// ---------------------------------------------------------------------------

const hits = new Map<string, number[]>();
function allow(req: Request, bucket: string, perMinute: number): boolean {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
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
export function pcmToWav(pcm: Buffer, sampleRate = 24_000): Buffer {
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
function toWav(data: Buffer, mimeType = ""): Buffer {
  if (data.subarray(0, 4).toString("ascii") === "RIFF") return data;
  const rate = Number(/rate=(\d+)/i.exec(mimeType)?.[1]) || 24_000;
  return pcmToWav(data, rate);
}

// ---------------------------------------------------------------------------
// Text to speech
// ---------------------------------------------------------------------------

type AudioPart = { data?: string; mime_type?: string; mimeType?: string; inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } };

/** Find the first base64 audio blob anywhere in a response (both API shapes). */
function findAudio(node: unknown): { data: string; mimeType: string } | null {
  if (!node || typeof node !== "object") return null;
  const part = node as AudioPart;
  const inline = part.inlineData ?? part.inline_data;
  if (inline?.data) return { data: inline.data, mimeType: (inline as { mimeType?: string }).mimeType ?? (inline as { mime_type?: string }).mime_type ?? "" };
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

async function postJson(url: string, body: unknown, timeoutMs: number) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res.json() as Promise<unknown>;
}

const ttsCache = new Map<string, Buffer>();
const TTS_CACHE_MAX = 300;

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const cached = ttsCache.get(text);
  if (cached) return cached;

  let audio: { data: string; mimeType: string } | null = null;
  let lastError: unknown;
  // Current Interactions API first, then the older generateContent shape.
  const attempts = [
    () =>
      postJson(
        `${API_BASE}/interactions`,
        {
          model: TTS_MODEL,
          input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: TTS_STYLE }] }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice: TTS_VOICE }] },
        },
        25_000,
      ),
    () =>
      postJson(
        `${API_BASE}/models/${TTS_MODEL}:generateContent`,
        {
          contents: [{ parts: [{ text: `พูดด้วย${TTS_STYLE}: ${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
          },
        },
        25_000,
      ),
  ];
  for (const attempt of attempts) {
    try {
      audio = findAudio(await attempt());
      if (audio) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!audio) throw lastError instanceof Error ? lastError : new Error("ไม่ได้รับเสียงจาก AI");

  const wav = toWav(Buffer.from(audio.data, "base64"), audio.mimeType);
  if (ttsCache.size >= TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value!);
  ttsCache.set(text, wav);
  return wav;
}

// ---------------------------------------------------------------------------
// Speech to text (fallback for browsers without live recognition)
// ---------------------------------------------------------------------------

export async function transcribeSpeech(wav: Buffer): Promise<string> {
  const json = (await postJson(
    `${API_BASE}/models/${STT_MODEL}:generateContent`,
    {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: "audio/wav", data: wav.toString("base64") } },
            {
              text:
                "ถอดความเสียงพูดในไฟล์นี้เป็นข้อความภาษาไทยตามที่พูดจริงทุกคำ " +
                "ตอบเฉพาะข้อความที่ถอดได้ ไม่ต้องอธิบาย ถ้าไม่มีเสียงพูดให้ตอบว่างเปล่า",
            },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    },
    30_000,
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return text.replace(/^["'“”\s]+|["'“”\s]+$/g, "").trim();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerVoiceRoutes(app: Express): void {
  app.get("/api/voice/status", (_req, res) => {
    res.json({ ai: isVoiceConfigured() });
  });

  app.post("/api/voice/tts", async (req, res) => {
    if (!isVoiceConfigured()) return res.status(503).json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" });
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, MAX_TTS_CHARS) : "";
    if (!text) return res.status(400).json({ error: "ไม่มีข้อความ" });
    if (!allow(req, "tts", 30)) return res.status(429).json({ error: "ขอเสียงบ่อยเกินไป" });
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
      const body = req.body as Buffer | undefined;
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
    },
  );
}
