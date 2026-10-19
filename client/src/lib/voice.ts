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

export type ListenEngine = "browser" | "server";
export type SpeakEngine = "ai" | "device";

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

type RecognitionCtor = new () => SpeechRecognitionLike;
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const hasBrowserRecognition = () => Boolean(recognitionCtor());

const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);
/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS = () =>
  /iPhone|iPad|iPod/i.test(ua()) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(ua()) || isIOS();
/** LINE / Facebook / Instagram in-app browsers usually can't use the microphone. */
export const inAppBrowser = (): "line" | "other" | null =>
  /\bLine\//i.test(ua()) ? "line" : /FBAN|FBAV|Instagram|MicroMessenger|TikTok/i.test(ua()) ? "other" : null;

// Phones only let a page make sound / use the mic's audio graph if it was started
// from a tap. Everything is "unlocked" once, during the first tap, and reused.
let sharedCtx: AudioContext | null = null;
let player: HTMLAudioElement | null = null;
let ttsUnlocked = false;
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

function audioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctx();
  }
  if (sharedCtx.state === "suspended") void sharedCtx.resume().catch(() => undefined);
  return sharedCtx;
}

function audioPlayer(): HTMLAudioElement {
  player ??= new Audio();
  return player;
}

/**
 * Call synchronously inside every tap that may lead to listening or speaking
 * (mic button, send, quick question…). On iOS/Android this is what allows the
 * reply to be played several seconds later and the recorder to hear the mic.
 */
export function unlockAudio(): void {
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

let aiVoiceStatus: Promise<boolean> | null = null;
/** Whether the server can do AI voice (has a Gemini key). Cached for the page. */
export function aiVoiceAvailable(): Promise<boolean> {
  aiVoiceStatus ??= fetch("/api/voice/status")
    .then((r) => (r.ok ? r.json() : { ai: false }))
    .then((j: { ai?: boolean }) => Boolean(j.ai))
    .catch(() => false);
  return aiVoiceStatus;
}

// ---------------------------------------------------------------------------
// Text clean-up for speech
// ---------------------------------------------------------------------------

/** Turn a chat reply (markdown, links, emoji) into something pleasant to hear. */
export function cleanForSpeech(text: string): string {
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

// ---------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------

export type SpeakOptions = {
  engine: SpeakEngine;
  /** 0.7 – 1.3 */
  rate?: number;
  onStart?: () => void;
};

export type Speech = {
  /** Resolves when speaking finished or was stopped. */
  done: Promise<void>;
  stop: () => void;
};

// Only one thing speaks at a time.
let current: Speech | null = null;
export function stopSpeaking() {
  current?.stop();
  current = null;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

/** Thai voices installed on this device, best first (male first — the persona says "ผม"). */
export function thaiDeviceVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/niwat|pattara|male|ชาย/.test(n)) s += 4; // Edge "Niwat Online (Natural)", Windows "Pattara"
    if (/natural|online|neural|premium|enhanced/.test(n)) s += 3;
    if (!v.localService) s += 1;
    return s;
  };
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("th"))
    .sort((a, b) => score(b) - score(a));
}

/** getVoices() is empty until the browser has loaded them — wait up to 1.5 s. */
function voicesReady(): Promise<void> {
  if (!window.speechSynthesis || window.speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

/** Chrome cuts utterances off after ~15 s, so speak long text in pieces split at spaces. */
function chunk(text: string, max = 160): string[] {
  const parts: string[] = [];
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

function speakOnDevice(text: string, rate: number, onStart?: () => void): Speech {
  let stopped = false;
  const done = (async () => {
    if (!window.speechSynthesis) return;
    await voicesReady();
    const voice = thaiDeviceVoices()[0];
    window.speechSynthesis.cancel();
    let first = true;
    for (const piece of chunk(text)) {
      if (stopped) return;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(piece);
        u.lang = "th-TH";
        if (voice) u.voice = voice;
        u.rate = rate;
        u.onstart = () => {
          if (first) onStart?.();
          first = false;
        };
        u.onend = () => resolve();
        u.onerror = () => resolve();
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

async function fetchAiAudio(text: string, signal: AbortSignal): Promise<Blob> {
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
export function speak(rawText: string, options: SpeakOptions): Speech {
  stopSpeaking();
  const text = cleanForSpeech(rawText);
  if (!text) return { done: Promise.resolve(), stop: () => undefined };
  const rate = Math.min(1.3, Math.max(0.7, options.rate ?? 1));

  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let fallback: Speech | null = null;

  const done = (async () => {
    if (options.engine === "ai") {
      try {
        const blob = await fetchAiAudio(text, controller.signal);
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        audio = audioPlayer(); // unlocked during the user's tap — a new Audio() would be blocked on iOS
        audio.src = url;
        audio.playbackRate = rate;
        (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
        await new Promise<void>((resolve, reject) => {
          audio!.onplay = () => options.onStart?.();
          audio!.onended = () => resolve();
          audio!.onerror = () => reject(new Error("audio playback failed"));
          audio!.onpause = () => {
            if (controller.signal.aborted) resolve();
          };
          audio!.play().catch(reject);
        }).finally(() => URL.revokeObjectURL(url));
        return;
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("[voice] AI voice unavailable, using device voice:", error);
      }
    }
    fallback = speakOnDevice(text, rate, options.onStart);
    await fallback.done;
  })();

  const speech: Speech = {
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

// ---------------------------------------------------------------------------
// Listening
// ---------------------------------------------------------------------------

export type ListenCallbacks = {
  /** Live partial text while speaking (browser engine only). */
  onInterim?: (text: string) => void;
  /** Mic loudness 0..1, ~20×/s, for the visualiser. */
  onLevel?: (level: number) => void;
  /** The recognizer is now uploading/transcribing (server engine). */
  onProcessing?: () => void;
};

export type Listening = {
  /** Final text ("" if nothing was heard). Rejects with a Thai message on errors. */
  result: Promise<string>;
  /** Stop listening now and use what was heard so far. */
  stop: () => void;
  /** Stop and discard. */
  cancel: () => void;
  engine: ListenEngine;
};

const MIC_DENIED = "ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน — กดอนุญาตไมโครโฟนที่แถบที่อยู่ของเบราว์เซอร์ แล้วลองใหม่";
const NO_MIC = "ไม่พบไมโครโฟนในอุปกรณ์นี้";
const INSECURE = "เบราว์เซอร์อนุญาตให้ใช้ไมโครโฟนเฉพาะเว็บที่เป็น https (หรือ localhost)";

/** Mic stream + analyser, for the level meter and for recording. */
async function openMic(): Promise<{ stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode; source: MediaStreamAudioSourceNode }> {
  if (!isSecureForMic()) throw new Error(INSECURE);
  if (!hasMicrophone()) throw new Error(NO_MIC);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (error) {
    const name = (error as { name?: string }).name;
    throw new Error(name === "NotAllowedError" || name === "SecurityError" ? MIC_DENIED : NO_MIC);
  }
  const ctx = audioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  return { stream, ctx, analyser, source };
}

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function startLevelMeter(analyser: AnalyserNode, onLevel?: (l: number) => void): () => void {
  if (!onLevel) return () => undefined;
  const buf = new Float32Array(analyser.fftSize);
  const id = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    onLevel(Math.min(1, rms(buf) * 8));
  }, 50);
  return () => window.clearInterval(id);
}

/** Browser engine: Web Speech API, with the mic opened separately just for the level meter. */
function listenWithBrowser(cb: ListenCallbacks): Listening {
  const Ctor = recognitionCtor()!;
  const rec = new Ctor();
  rec.lang = "th-TH";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  let interimText = "";
  let cancelled = false;
  let cleanupMeter = () => undefined as void;
  let mic: Awaited<ReturnType<typeof openMic>> | null = null;

  const result = new Promise<string>((resolve, reject) => {
    rec.onresult = (event) => {
      interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      cb.onInterim?.((finalText + interimText).trim());
    };
    rec.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return; // onend resolves with ""
      if (event.error === "not-allowed") reject(new Error(MIC_DENIED));
      else if (event.error === "audio-capture") reject(new Error(NO_MIC));
      else reject(new Error(`recognizer:${event.error}`)); // e.g. "network" → caller may retry with the server engine
    };
    rec.onend = () => {
      cleanupMeter();
      mic?.stream.getTracks().forEach((t) => t.stop());
      mic?.source.disconnect();
      resolve(cancelled ? "" : (finalText || interimText).trim());
    };
  });

  // Level meter is optional. Phones hand the microphone to one user at a time, so
  // opening it a second time there would starve the recogniser — skip it.
  if (!isMobileDevice()) void openMic()
    .then((m) => {
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
function listenWithServer(cb: ListenCallbacks): Listening {
  let stopNow: (() => void) | null = null;
  let cancelled = false;
  audioContext(); // create/resume now, while we're still inside the user's tap

  const result = (async () => {
    const mic = await openMic();
    const { ctx, source, analyser, stream } = mic;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    const cleanupMeter = startLevelMeter(analyser, cb.onLevel);

    // Voice activity detection with an adaptive noise floor.
    let noiseFloor = 0.01;
    let heardSpeech = false;
    let lastLoud = performance.now();
    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      stopNow = resolve;
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(input));
        const level = rms(input);
        const now = performance.now();
        if (now - startedAt < 400) noiseFloor = Math.max(noiseFloor, level * 1.5); // calibrate
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
    stream.getTracks().forEach((t) => t.stop());
    const sampleRate = ctx.sampleRate;
    if (cancelled || !heardSpeech) return "";

    cb.onProcessing?.();
    const wav = encodeWav16k(chunks, sampleRate);
    const res = await fetch("/api/voice/stt", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
    if (res.status === 429) throw new Error("พูดถามบ่อยเกินไป — รอสักครู่แล้วลองใหม่");
    if (!res.ok) throw new Error("ฟังเสียงไม่สำเร็จ — ลองพูดใหม่ หรือพิมพ์คำถามแทน");
    const json = (await res.json()) as { text?: string };
    return (json.text ?? "").trim();
  })();

  return {
    engine: "server",
    result,
    stop: () => stopNow?.(),
    cancel: () => {
      cancelled = true;
      stopNow?.();
    },
  };
}

/** Downsample float chunks to 16 kHz mono 16-bit WAV. */
function encodeWav16k(chunks: Float32Array[], inRate: number): Blob {
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
  const write = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
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
export function listen(cb: ListenCallbacks, prefer?: ListenEngine): Listening {
  // (Callers decide; see preferredListenEngine.)
  if (!isSecureForMic()) {
    return { engine: "browser", result: Promise.reject(new Error(INSECURE)), stop: () => undefined, cancel: () => undefined };
  }
  const engine: ListenEngine = prefer ?? (hasBrowserRecognition() ? "browser" : "server");
  return engine === "browser" && hasBrowserRecognition() ? listenWithBrowser(cb) : listenWithServer(cb);
}

/**
 * Which recogniser to use: iPhones record + transcribe on the server (Safari's own
 * recogniser needs Siri and often returns nothing); everyone else uses the
 * browser's live recogniser when present.
 */
export function preferredListenEngine(serverAvailable: boolean): ListenEngine {
  if (serverAvailable && (isIOS() || !hasBrowserRecognition())) return "server";
  return hasBrowserRecognition() ? "browser" : "server";
}
