// (Converted from client/src/lib/voice.ts — same behaviour.)
// Voice in / voice out for the น้องปลาทู assistant.
//
// Listening
//   • "browser": the Web Speech API (Chrome, Edge, Android, newer Safari) — live
//     captions while you talk, ends by itself when you stop.
//   • "server":  record the mic ourselves (16 kHz WAV), stop on silence, and let
//     the server transcribe it with Gemini — for browsers without the API
//     (Firefox) or when the browser's recogniser fails.
// Speaking
//   • "ai":      natural Thai voice from the server (Gemini TTS, /api/voice/tts)
//   • "device":  the browser's own speechSynthesis with the best Thai voice found
// Every path falls back to the next one, so the kiosk never goes silent.

function recognitionCtor() {
  if (typeof window === "undefined") return undefined;
  const w = window;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const hasBrowserRecognition = () => Boolean(recognitionCtor());

const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);
/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS = () =>
  /iPhone|iPad|iPod/i.test(ua()) ||
  (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(ua()) || isIOS();
/** LINE / Facebook / Instagram in-app browsers usually can't use the microphone. */
export const inAppBrowser = () =>
  /\bLine\//i.test(ua()) ? "line" : /FBAN|FBAV|Instagram|MicroMessenger|TikTok/i.test(ua()) ? "other" : null;

// Phones only let a page make sound / use the mic's audio graph if it was started
// from a tap. Everything is "unlocked" once, during the first tap, and reused.
let sharedCtx = null;
let player = null;
let ttsUnlocked = false;
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

function audioContext() {
  if (!sharedCtx || sharedCtx.state === "closed") {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    sharedCtx = new Ctx();
  }
  if (sharedCtx.state === "suspended") void sharedCtx.resume().catch(() => undefined);
  return sharedCtx;
}

function audioPlayer() {
  player ??= new Audio();
  return player;
}

/**
 * Call synchronously inside every tap that may lead to listening or speaking
 * (mic button, send, quick question…). On iOS/Android this is what allows the
 * reply to be played several seconds later and the recorder to hear the mic.
 */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    audioContext();
    const p = audioPlayer();
    if (!p.src || p.src === SILENT_WAV || p.ended || p.paused) {
      p.src = SILENT_WAV;
      void p.play().catch(() => undefined);
    }
    if (!ttsUnlocked && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
      ttsUnlocked = true;
    }
  } catch {
    /* best effort */
  }
}
export const hasMicrophone = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
export const isSecureForMic = () => typeof window === "undefined" || window.isSecureContext;

export async function checkMicrophone() {
  if (!isSecureForMic() || !hasMicrophone()) return "none";
  let permission = "unknown";
  try {
    permission = (await navigator.permissions.query({ name: "microphone" })).state;
  } catch {
    /* Firefox and older Safari can't query the microphone permission */
  }
  if (permission === "denied") return "denied";
  try {
    // Lists devices (without names) even before permission is given.
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput");
    if (inputs.length === 0) return "none";
  } catch {
    /* can't tell — assume there is one */
  }
  return permission === "granted" ? "ok" : "prompt";
}

/** Fires when a mic is plugged in / enabled / removed, or the user comes back from settings. */
export function onMicrophoneMaybeChanged(callback) {
  if (typeof window === "undefined") return () => undefined;
  const onVisible = () => {
    if (document.visibilityState === "visible") callback();
  };
  navigator.mediaDevices?.addEventListener?.("devicechange", callback);
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    navigator.mediaDevices?.removeEventListener?.("devicechange", callback);
    window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** The kind of device, for showing the right "how to turn the mic on" steps. */
export function devicePlatform() {
  if (isIOS()) return "ios";
  if (/Android/i.test(ua())) return "android";
  if (/Windows/i.test(ua())) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua())) return "mac";
  return "other";
}

let aiVoiceStatus = null;
/** Whether the server can do AI voice (has a Gemini key). Cached for the page. */
export function aiVoiceAvailable() {
  aiVoiceStatus ??= fetch("/api/voice/status")
    .then(r => (r.ok ? r.json() : { ai: false }))
    .then(j => Boolean(j.ai))
    .catch(() => false);
  return aiVoiceStatus;
}

// ---------------------------------------------------------------------------
// Text clean-up for speech
// ---------------------------------------------------------------------------

/** Turn a chat reply (markdown, links, emoji) into something pleasant to hear. */
export function cleanForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [label](url) → label
    .replace(/https?:\/\/\S+/g, " ") // bare URLs
    .replace(/[*_#>`~|]/g, " ")
    .replace(/^\s*[-•]\s+/gm, "") // bullets
    .replace(/(\d)\s*ม\.(?!\S)/g, "$1 เมตร")
    .replace(/(\d)\s*กม\./g, "$1 กิโลเมตร")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Only one thing speaks at a time.
let current = null;
export function stopSpeaking() {
  current?.stop();
  current = null;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

/** Thai voices installed on this device, best first (male first — the persona says "ผม"). */
export function thaiDeviceVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const score = v => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/niwat|pattara|male|ชาย/.test(n)) s += 4; // Edge "Niwat Online (Natural)", Windows "Pattara"
    if (/natural|online|neural|premium|enhanced/.test(n)) s += 3;
    if (!v.localService) s += 1;
    return s;
  };
  return window.speechSynthesis
    .getVoices()
    .filter(v => v.lang.toLowerCase().replace("_", "-").startsWith("th"))
    .sort((a, b) => score(b) - score(a));
}

/** getVoices() is empty until the browser has loaded them — wait up to 1.5 s. */
function voicesReady() {
  if (!window.speechSynthesis || window.speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => resolve();
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

/** Chrome cuts utterances off after ~15 s, so speak long text in pieces split at spaces. */
function chunk(text, max = 160) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function speakOnDevice(text, rate, onStart) {
  let stopped = false;
  const done = (async () => {
    if (!window.speechSynthesis) return;
    await voicesReady();
    const voice = thaiDeviceVoices()[0];
    window.speechSynthesis.cancel();
    let first = true;
    for (const piece of chunk(text)) {
      if (stopped) return;
      await new Promise(resolve => {
        const u = new SpeechSynthesisUtterance(piece);
        u.lang = "th-TH";
        if (voice) u.voice = voice;
        u.rate = rate;
        // Some browsers (Chrome on Android, Safari) never fire onend for an utterance — without
        // this the assistant would stay "speaking" forever and hands-free would never listen again.
        const guard = window.setTimeout(resolve, 4000 + (piece.length * 120) / rate);
        const finish = () => {
          window.clearTimeout(guard);
          resolve();
        };
        u.onstart = () => {
          if (first) onStart?.();
          first = false;
        };
        u.onend = finish;
        u.onerror = finish;
        window.speechSynthesis.speak(u);
      });
    }
  })();
  return {
    done,
    stop: () => {
      stopped = true;
      window.speechSynthesis?.cancel();
    },
  };
}

/** How long to wait for the AI voice before using the device voice instead. */
const FIRST_AUDIO_WAIT_MS = 6000;
const NEXT_AUDIO_WAIT_MS = 12000;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`AI voice took over ${ms / 1000} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Split a reply into short pieces for the AI voice: after each "ครับ", sentence mark or
 * line break, merged so no piece is tiny, and long ones cut at a space (~110 characters).
 * A short first piece means the first sound comes sooner.
 */
export function speechPieces(text, max = 110) {
  const sentences = String(text)
    .split(/(?<=ครับ|ค่ะ|[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pieces = [];
  for (const sentence of sentences) {
    for (const part of chunk(sentence, max)) {
      const last = pieces.at(-1);
      // Join very short bits ("ได้เลยครับ") to the previous piece, except the first one.
      if (last && pieces.length > 1 && last.length + part.length < 50) pieces[pieces.length - 1] = `${last} ${part}`;
      else pieces.push(part);
    }
  }
  return pieces.length ? pieces : [String(text)];
}

async function fetchAiAudio(text, signal) {
  const res = await fetch("/api/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  return res.blob();
}

/** Speak `text`. AI voice falls back to the device voice if it fails. */
export function speak(rawText, options) {
  stopSpeaking();
  const text = cleanForSpeech(rawText);
  if (!text) return { done: Promise.resolve(), stop: () => undefined };
  const rate = Math.min(1.3, Math.max(0.7, options.rate ?? 1));

  const controller = new AbortController();
  let audio = null;
  let fallback = null;

  // AI voice: one request per sentence, so the first sentence plays after a couple of seconds
  // while the next one is being made (one long request took 8–30 s before anything was heard).
  const playBlob = (blob, first) => {
    const url = URL.createObjectURL(blob);
    audio = audioPlayer(); // unlocked during the user's tap — a new Audio() would be blocked on iOS
    audio.src = url;
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    let onEnded = null;
    return new Promise((resolve, reject) => {
      onEnded = () => resolve();
      audio.onplay = () => first && options.onStart?.();
      audio.onended = onEnded;
      audio.onerror = () => reject(new Error("audio playback failed"));
      audio.onpause = () => {
        if (controller.signal.aborted) resolve();
      };
      audio.play().catch(reject);
    }).finally(() => {
      URL.revokeObjectURL(url);
      // The player is shared and reused by unlockAudio() on the next tap — don't let that
      // silent unlock sound fire this reply's handlers (e.g. switch the UI to "speaking").
      // Only if a newer reply has not already taken the player over.
      if (audio.onended === onEnded) audio.onplay = audio.onended = audio.onerror = audio.onpause = null;
    });
  };

  const done = (async () => {
    let spokenUpTo = 0; // sentences already played, so a fallback continues where the AI voice stopped
    const pieces = speechPieces(text);
    if (options.engine === "ai") {
      try {
        // The first sentence must arrive quickly, or the visitor hears nothing for too long.
        const fetchPiece = (i, wait) => withTimeout(fetchAiAudio(pieces[i], controller.signal), wait);
        let next = fetchPiece(0, FIRST_AUDIO_WAIT_MS);
        for (let i = 0; i < pieces.length; i++) {
          const blob = await next;
          if (controller.signal.aborted) return;
          next = i + 1 < pieces.length ? fetchPiece(i + 1, NEXT_AUDIO_WAIT_MS) : null;
          next?.catch(() => undefined); // handled when awaited
          await playBlob(blob, i === 0);
          if (controller.signal.aborted) return;
          spokenUpTo = i + 1;
        }
        return;
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("[voice] AI voice slow or unavailable, using device voice:", error);
      }
    }
    const rest = pieces.slice(spokenUpTo).join(" ");
    if (!rest) return;
    fallback = speakOnDevice(rest, rate, spokenUpTo === 0 ? options.onStart : undefined);
    await fallback.done;
  })();

  const speech = {
    done,
    stop: () => {
      controller.abort();
      audio?.pause();
      fallback?.stop();
    },
  };
  current = speech;
  return speech;
}

const MIC_DENIED = "ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน — กดอนุญาตไมโครโฟนที่แถบที่อยู่ของเบราว์เซอร์ แล้วรีเฟรชหน้า (F5)";
const MIC_BLOCKED_BY_SYSTEM =
  'ระบบปฏิบัติการปิดไมโครโฟนไว้สำหรับเบราว์เซอร์ — Windows: Settings → Privacy & security → Microphone เปิด "Microphone access" และ "Let desktop apps access your microphone" แล้วรีเฟรชหน้า';
const MIC_BUSY =
  "ไมโครโฟนถูกโปรแกรมอื่นใช้อยู่หรือเปิดไม่ได้ (เช่น Zoom, Teams, Discord) — ปิดโปรแกรมนั้น หรือเลือกไมค์ตัวอื่นในการตั้งค่าเบราว์เซอร์";
const NO_MIC = "ไม่พบไมโครโฟนในอุปกรณ์นี้";
const INSECURE = "เบราว์เซอร์อนุญาตให้ใช้ไมโครโฟนเฉพาะเว็บที่เป็น https (หรือ localhost)";

/** A Thai explanation for a getUserMedia error that says what to fix. */
function micErrorMessage(error) {
  const { name = "", message = "" } = error ?? {};
  if (name === "NotAllowedError" || name === "SecurityError") {
    // Chrome/Edge: "Permission denied by system" = blocked by Windows/macOS, not by the site setting.
    return /system/i.test(message) ? MIC_BLOCKED_BY_SYSTEM : MIC_DENIED;
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return MIC_BUSY;
  return NO_MIC;
}

/**
 * The browser recogniser only says "not-allowed" / "audio-capture" — open the mic
 * ourselves to find the real reason. If the mic works, the recogniser itself is
 * what is blocked: report it as a recogniser error so the caller can switch to
 * the server engine.
 */
async function diagnoseMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return "recognizer:not-allowed";
  } catch (error) {
    return micErrorMessage(error);
  }
}

/** Mic stream + analyser, for the level meter and for recording. */
async function openMic() {
  if (!isSecureForMic()) throw new Error(INSECURE);
  if (!hasMicrophone()) throw new Error(NO_MIC);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (error) {
    throw new Error(micErrorMessage(error));
  }
  const ctx = audioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  return { stream, ctx, analyser, source };
}

function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function startLevelMeter(analyser, onLevel) {
  if (!onLevel) return () => undefined;
  const buf = new Float32Array(analyser.fftSize);
  const id = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    onLevel(Math.min(1, rms(buf) * 8));
  }, 50);
  return () => window.clearInterval(id);
}

/** Browser engine: Web Speech API, with the mic opened separately just for the level meter. */
function listenWithBrowser(cb) {
  const Ctor = recognitionCtor();
  const rec = new Ctor();
  rec.lang = "th-TH";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  let interimText = "";
  let cancelled = false;
  let failure = null;
  let cleanupMeter = () => undefined;
  let mic = null;

  const result = new Promise((resolve, reject) => {
    rec.onresult = event => {
      interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      cb.onInterim?.((finalText + interimText).trim());
    };
    rec.onerror = event => {
      if (event.error === "no-speech" || event.error === "aborted") return; // onend resolves with ""
      // onend follows straight away — it waits for this diagnosis instead of resolving "".
      if (event.error === "not-allowed" || event.error === "audio-capture") failure = diagnoseMic();
      else reject(new Error(`recognizer:${event.error}`)); // e.g. "network" → caller may retry with the server engine
    };
    rec.onend = () => {
      cleanupMeter();
      mic?.stream.getTracks().forEach(t => t.stop());
      mic?.source.disconnect();
      if (failure && !cancelled) {
        void failure.then(message => reject(new Error(message)));
        return;
      }
      resolve(cancelled ? "" : (finalText || interimText).trim());
    };
  });

  // Level meter is optional. Phones hand the microphone to one user at a time, so
  // opening it a second time there would starve the recogniser — skip it.
  if (!isMobileDevice())
    void openMic()
      .then(m => {
        mic = m;
        cleanupMeter = startLevelMeter(m.analyser, cb.onLevel);
      })
      .catch(() => undefined);

  try {
    rec.start();
  } catch {
    /* already started */
  }

  return {
    engine: "browser",
    result,
    stop: () => rec.stop(),
    cancel: () => {
      cancelled = true;
      rec.abort();
    },
  };
}

/** Server engine: record 16 kHz WAV until silence, then POST to /api/voice/stt. */
function listenWithServer(cb) {
  let stopNow = null;
  let stopRequested = false;
  let cancelled = false;
  audioContext(); // create/resume now, while we're still inside the user's tap

  const result = (async () => {
    const mic = await openMic();
    const { ctx, source, analyser, stream } = mic;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const cleanupMeter = startLevelMeter(analyser, cb.onLevel);

    // Voice activity detection with an adaptive noise floor.
    let noiseFloor = 0.01;
    let quietest = Infinity;
    let heardSpeech = false;
    let lastLoud = performance.now();
    const startedAt = performance.now();

    await new Promise(resolve => {
      stopNow = resolve;
      // Stopped or cancelled while the mic permission prompt was still open.
      if (stopRequested || cancelled) return resolve();
      processor.onaudioprocess = e => {
        const input = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(input));
        const level = rms(input);
        const now = performance.now();
        // Calibrate on the quietest moment of the first 0.4 s — not the loudest, or someone
        // who starts talking straight away sets the "noise" so high they are never heard.
        if (now - startedAt < 400) {
          quietest = Math.min(quietest, level);
          noiseFloor = Math.min(0.05, Math.max(0.01, quietest * 1.5));
        }
        if (level > Math.max(0.02, noiseFloor * 2.5)) {
          heardSpeech = true;
          lastLoud = now;
        }
        if (heardSpeech && now - lastLoud > 1300) resolve(); // paused → done
        if (!heardSpeech && now - startedAt > 7000) resolve(); // nobody spoke
        if (now - startedAt > 15000) resolve(); // hard cap
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    });

    processor.disconnect();
    source.disconnect();
    cleanupMeter();
    stream.getTracks().forEach(t => t.stop());
    const sampleRate = ctx.sampleRate;
    if (cancelled || !heardSpeech) return "";

    cb.onProcessing?.();
    const wav = encodeWav16k(chunks, sampleRate);
    const res = await fetch("/api/voice/stt", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
    if (res.status === 429) throw new Error("พูดถามบ่อยเกินไป — รอสักครู่แล้วลองใหม่");
    if (!res.ok) throw new Error("ฟังเสียงไม่สำเร็จ — ลองพูดใหม่ หรือพิมพ์คำถามแทน");
    const json = await res.json();
    return (json.text ?? "").trim();
  })();

  return {
    engine: "server",
    result,
    stop: () => {
      stopRequested = true;
      stopNow?.();
    },
    cancel: () => {
      cancelled = true;
      stopNow?.();
    },
  };
}

/** Downsample float chunks to 16 kHz mono 16-bit WAV. */
function encodeWav16k(chunks, inRate) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const joined = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.length;
  }
  const outRate = 16000;
  const ratio = inRate / outRate;
  const outLen = Math.floor(total / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    // Average the source samples that fall into this output sample (cheap low-pass).
    const start = Math.floor(i * ratio);
    const end = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += joined[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const write = (o, s) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Listen for one spoken question. Uses the browser recogniser when there is one,
 * otherwise (or when `prefer` is "server") records and transcribes on the server.
 */
export function listen(cb, prefer) {
  // (Callers decide; see preferredListenEngine.)
  if (!isSecureForMic()) {
    return {
      engine: "browser",
      result: Promise.reject(new Error(INSECURE)),
      stop: () => undefined,
      cancel: () => undefined,
    };
  }
  const engine = prefer ?? (hasBrowserRecognition() ? "browser" : "server");
  return engine === "browser" && hasBrowserRecognition() ? listenWithBrowser(cb) : listenWithServer(cb);
}

/**
 * Which recogniser to use: iPhones record + transcribe on the server (Safari's own
 * recogniser needs Siri and often returns nothing); everyone else uses the
 * browser's live recogniser when present.
 */
export function preferredListenEngine(serverAvailable) {
  if (serverAvailable && (isIOS() || !hasBrowserRecognition())) return "server";
  return hasBrowserRecognition() ? "browser" : "server";
}
