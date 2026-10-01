import { trpc } from "@/lib/trpc";
import {
  aiVoiceAvailable,
  hasBrowserRecognition,
  inAppBrowser,
  preferredListenEngine,
  unlockAudio,
  hasMicrophone,
  isSecureForMic,
  listen,
  speak,
  stopSpeaking,
  thaiDeviceVoices,
  type Listening,
  type SpeakEngine,
} from "@/lib/voice";
import { cn } from "@/lib/utils";
import {
  Building2,
  ChevronRight,
  Loader2,
  MapPin,
  MessageCircle,
  Mic,
  Navigation,
  Send,
  Settings2,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Streamdown } from "streamdown";

type ChatMessage = { role: "user" | "assistant"; content: string; spoken?: boolean };
type Phase = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

const GREETING = "สวัสดีครับ ผมน้องปลาทู 🐟\n\nแตะปุ่มไมค์แล้วพูดได้เลย หรือพิมพ์ถามเรื่องอาคาร สาขา ข่าวสาร และขอเส้นทางได้ครับ";

const QUICK_QUESTIONS = [
  { icon: Navigation, label: "ขอเส้นทางไปสาขาช่างยนต์" },
  { icon: MapPin, label: "สาขาการบัญชีอยู่อาคารไหน" },
  { icon: Building2, label: "วิทยาลัยมีสาขาอะไรบ้าง" },
];

/** Event other parts of the page fire to open the assistant straight into a voice conversation. */
export const OPEN_VOICE_EVENT = "nongplatoo:voice";
export function openVoiceAssistant() {
  window.dispatchEvent(new Event(OPEN_VOICE_EVENT));
}

/** Open the assistant panel (no auto-listening). */
export const OPEN_ASSISTANT_EVENT = "nongplatoo:open";
export function openAssistant() {
  window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
}

/** Kiosk idle reset: stop talking/listening, forget the conversation, close the panel. */
export const RESET_ASSISTANT_EVENT = "nongplatoo:reset";
export function resetAssistant() {
  window.dispatchEvent(new Event(RESET_ASSISTANT_EVENT));
}

type VoiceSettings = { speakReplies: boolean; handsFree: boolean; engine: SpeakEngine; rate: number };
const SETTINGS_KEY = "nong-platoo-voice-settings-v1";
const DEFAULT_SETTINGS: VoiceSettings = { speakReplies: true, handsFree: true, engine: "ai", rate: 1 };

function loadSettings(): VoiceSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<VoiceSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const PHASE_TEXT: Record<Phase, string> = {
  idle: "แตะไมค์แล้วพูดได้เลย",
  listening: "กำลังฟัง… พูดได้เลยครับ",
  transcribing: "กำลังฟังคำถาม…",
  thinking: "น้องปลาทูกำลังคิด…",
  speaking: "กำลังตอบ — แตะเพื่อพูดแทรก",
};

type CampusAIWidgetProps = {
  /** Called when the bot decides to show a walking route (`chat.ask` → routeToBuildingId). */
  onShowRoute?: (buildingId: string) => void;
  /** Hide the floating "ถามน้องปลาทู" button (the page opens the panel itself, e.g. from a tab bar). */
  hideLauncher?: boolean;
};

/**
 * "น้องปลาทู" assistant with a real voice conversation:
 *   tap the mic → speak → live caption → answer appears AND is read aloud →
 *   (hands-free) it listens again, until you stop or stay quiet.
 * Tapping the mic while it talks interrupts it. Voice falls back gracefully:
 * browser recogniser → server transcription; AI voice → device voice.
 * Chat itself is `chat.ask` like the old app (stateless, full history each time).
 */
export function CampusAIWidget({ onShowRoute, hideLauncher = false }: CampusAIWidgetProps = {}) {
  const { data: configured } = trpc.chat.configured.useQuery(undefined, { staleTime: Infinity });
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: GREETING }]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [aiVoice, setAiVoice] = useState(false);
  const [deviceVoiceName, setDeviceVoiceName] = useState<string | null>(null);

  const listeningRef = useRef<Listening | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const missesRef = useRef(0);
  const sessionRef = useRef(0); // bumps on "stop everything" so stale callbacks do nothing
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSettings(loadSettings()), []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);
  useEffect(() => {
    void aiVoiceAvailable().then(setAiVoice);
    const pick = () => setDeviceVoiceName(thaiDeviceVoices()[0]?.name ?? null);
    pick();
    window.speechSynthesis?.addEventListener?.("voiceschanged", pick);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", pick);
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interim, phase]);

  const engine: SpeakEngine = settings.engine === "ai" && aiVoice ? "ai" : "device";
  const canSpeakOut = engine === "ai" || Boolean(deviceVoiceName) || typeof window !== "undefined" && "speechSynthesis" in window;
  const canListen = hasMicrophone() && (hasBrowserRecognition() || aiVoice);

  /** Stop listening, thinking and talking. */
  const stopAll = useCallback(() => {
    sessionRef.current++;
    listeningRef.current?.cancel();
    listeningRef.current = null;
    abortRef.current?.abort();
    stopSpeaking();
    setPhase("idle");
    setInterim("");
    setLevel(0);
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const speakReply = useCallback(
    async (text: string, session: number) => {
      const s = settingsRef.current;
      if (!s.speakReplies) return;
      setPhase("speaking");
      const speech = speak(text, { engine: s.engine === "ai" && aiVoice ? "ai" : "device", rate: s.rate });
      await speech.done;
      if (session === sessionRef.current) setPhase("idle");
    },
    [aiVoice],
  );

  // `startListening` and `ask` call each other (hands-free loop) — tie them through refs.
  const startListeningRef = useRef<(retryOnServer?: boolean) => void>(() => undefined);

  const ask = useCallback(
    async (question: string, fromVoice: boolean) => {
      const q = question.trim();
      if (!q) return;
      const session = sessionRef.current;
      stopSpeaking();
      listeningRef.current?.cancel();
      setNotice(null);
      const history = [...messagesRef.current.slice(1).map(({ role, content }) => ({ role, content })), { role: "user" as const, content: q }].slice(-30);
      setMessages((m) => [...m, { role: "user", content: q, spoken: fromVoice }]);
      setPhase("thinking");
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const { reply, routeToBuildingId } = await utils.client.chat.ask.mutate(
          { messages: history, spoken: fromVoice || undefined },
          { signal: controller.signal },
        );
        if (session !== sessionRef.current) return;
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
        if (routeToBuildingId && onShowRoute) {
          // Say it, then hand over to the map (the panel closes so the route is visible).
          void speakReply(reply, session);
          setOpen(false);
          onShowRoute(routeToBuildingId);
          return;
        }
        await speakReply(reply, session);
        if (session !== sessionRef.current) return;
        if (fromVoice && settingsRef.current.handsFree) startListeningRef.current();
      } catch (error) {
        if (session !== sessionRef.current) return;
        const content = controller.signal.aborted
          ? "หยุดแล้วครับ — ถามใหม่ได้เลย"
          : `ขออภัยครับ ระบบยังตอบไม่ได้ตอนนี้\n(${error instanceof Error ? error.message : "ไม่ทราบสาเหตุ"})`;
        setMessages((m) => [...m, { role: "assistant", content }]);
        setPhase("idle");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [onShowRoute, speakReply, utils],
  );

  const startListening = useCallback(
    (preferServer = false) => {
      const session = sessionRef.current;
      stopSpeaking();
      setNotice(null);
      setInterim("");
      setPhase("listening");
      const engine = preferServer ? "server" : preferredListenEngine(aiVoice);
      const l = listen({ onInterim: setInterim, onLevel: setLevel, onProcessing: () => setPhase("transcribing") }, engine);
      listeningRef.current = l;
      l.result
        .then((text) => {
          if (session !== sessionRef.current || listeningRef.current !== l) return;
          listeningRef.current = null;
          setLevel(0);
          setInterim("");
          if (text) {
            missesRef.current = 0;
            void ask(text, true);
            return;
          }
          missesRef.current++;
          setPhase("idle");
          if (settingsRef.current.handsFree && missesRef.current < 2) {
            setNotice("ไม่ได้ยินเสียง — ลองพูดอีกครั้งครับ");
            startListeningRef.current();
          } else {
            missesRef.current = 0;
            setNotice("ไม่ได้ยินเสียงพูด — แตะไมค์เพื่อลองใหม่");
          }
        })
        .catch((error: Error) => {
          if (session !== sessionRef.current) return;
          listeningRef.current = null;
          setLevel(0);
          setInterim("");
          setPhase("idle");
          // The browser recogniser failed (e.g. no network to its speech service) → try the server.
          if (error.message.startsWith("recognizer:") && engine === "browser" && aiVoice) {
            startListeningRef.current(true);
            return;
          }
          setNotice(error.message.startsWith("recognizer:") ? "ระบบฟังเสียงของเบราว์เซอร์ใช้ไม่ได้ — พิมพ์คำถามแทนได้ครับ" : error.message);
        });
    },
    [aiVoice, ask],
  );
  startListeningRef.current = startListening;

  /** The big mic button does the obvious thing for each state. */
  const onMic = () => {
    unlockAudio(); // phones: allow the reply to be played and the mic to be recorded later
    if (phase === "listening") {
      listeningRef.current?.stop(); // done talking → use what was heard
    } else if (phase === "speaking" || phase === "idle") {
      missesRef.current = 0;
      startListening();
    } else {
      stopAll();
    }
  };

  // Kiosk "ถามด้วยเสียง" → open straight into a conversation.
  useEffect(() => {
    const onVoice = () => {
      unlockAudio();
      setOpen(true);
      setSettings((s) => ({ ...s, handsFree: true }));
      setTimeout(() => startListeningRef.current(), 250);
    };
    window.addEventListener(OPEN_VOICE_EVENT, onVoice);
    return () => window.removeEventListener(OPEN_VOICE_EVENT, onVoice);
  }, []);

  useEffect(() => {
    const onOpen = () => {
      unlockAudio();
      setOpen(true);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onReset = () => {
      stopAll();
      setOpen(false);
      setShowSettings(false);
      setNotice(null);
      setTextInput("");
      setMessages([{ role: "assistant", content: GREETING }]);
    };
    window.addEventListener(RESET_ASSISTANT_EVENT, onReset);
    return () => window.removeEventListener(RESET_ASSISTANT_EVENT, onReset);
  }, [stopAll]);

  const close = () => {
    stopAll();
    setOpen(false);
  };

  const submitText = (event: FormEvent) => {
    unlockAudio();
    event.preventDefault();
    const q = textInput.trim();
    if (!q || phase === "thinking") return;
    setTextInput("");
    void ask(q, false);
  };

  // Like the old app: no AI key on the server → no assistant.
  if (!configured) return null;

  const busy = phase === "thinking" || phase === "transcribing";
  const orbScale = phase === "listening" ? 1 + level * 0.35 : 1;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="ผู้ช่วยน้องปลาทู"
          className={cn("fixed right-3 z-[1200] flex max-h-[calc(100dvh-7rem)] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)] shadow-[0_24px_80px_rgba(16,41,58,0.28)] sm:right-6", hideLauncher ? "bottom-20" : "bottom-24")}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-[var(--deep)] px-5 py-3.5 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--aqua)] text-[var(--ink)]">
                <Sparkles size={18} />
              </span>
              <div>
                <p className="text-sm font-black">น้องปลาทู</p>
                <p className="text-[10px] text-white/65">ผู้ช่วยประจำวิทยาลัย · คุยด้วยเสียงได้</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, speakReplies: !s.speakReplies }))}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
                aria-label={settings.speakReplies ? "ปิดเสียงตอบ" : "เปิดเสียงตอบ"}
                title={settings.speakReplies ? "ปิดเสียงตอบ" : "เปิดเสียงตอบ"}
              >
                {settings.speakReplies ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                className={cn("flex h-9 w-9 items-center justify-center rounded-full", showSettings ? "bg-white/25" : "bg-white/10")}
                aria-label="ตั้งค่าเสียง"
                title="ตั้งค่าเสียง"
              >
                <Settings2 size={16} />
              </button>
              <button type="button" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" aria-label="ปิดผู้ช่วย">
                <X size={17} />
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="space-y-3 border-b border-[var(--border)] bg-[var(--background)] px-5 py-4 text-xs">
              <label className="flex items-center justify-between gap-3 font-bold">
                <span>
                  อ่านคำตอบออกเสียง
                  <span className="block text-[10px] font-medium text-[var(--muted-foreground)]">ปิดได้ถ้าอยู่ในที่ที่ต้องเงียบ</span>
                </span>
                <input type="checkbox" checked={settings.speakReplies} onChange={(e) => setSettings((s) => ({ ...s, speakReplies: e.target.checked }))} className="h-4 w-4" />
              </label>
              <label className="flex items-center justify-between gap-3 font-bold">
                <span>
                  สนทนาต่อเนื่อง (ไม่ต้องกดไมค์ซ้ำ)
                  <span className="block text-[10px] font-medium text-[var(--muted-foreground)]">ตอบจบแล้วฟังต่อทันที — เงียบ 2 รอบจะหยุดเอง</span>
                </span>
                <input type="checkbox" checked={settings.handsFree} onChange={(e) => setSettings((s) => ({ ...s, handsFree: e.target.checked }))} className="h-4 w-4" />
              </label>
              <div>
                <p className="mb-1.5 font-bold">เสียงพูด</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["ai", "device"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      disabled={e === "ai" && !aiVoice}
                      onClick={() => setSettings((s) => ({ ...s, engine: e }))}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left disabled:opacity-40",
                        engine === e ? "border-[var(--ink)] bg-[var(--secondary)]" : "border-[var(--border)]",
                      )}
                    >
                      <span className="block font-bold">{e === "ai" ? "เสียง AI (ธรรมชาติ)" : "เสียงของเครื่อง"}</span>
                      <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                        {e === "ai" ? (aiVoice ? "Gemini · ต้องต่ออินเทอร์เน็ต" : "ยังไม่พร้อมใช้") : deviceVoiceName ?? "ไม่พบเสียงภาษาไทยในเครื่อง"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="block font-bold">
                ความเร็วเสียง {settings.rate.toFixed(1)}×
                <input
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.1}
                  value={settings.rate}
                  onChange={(e) => setSettings((s) => ({ ...s, rate: Number(e.target.value) }))}
                  className="mt-1 w-full"
                />
              </label>
              <button
                type="button"
                onClick={() => unlockAudio() ?? speak("สวัสดีครับ ผมน้องปลาทู ยินดีต้อนรับสู่วิทยาลัยเทคนิคสมุทรสงครามครับ", { engine, rate: settings.rate })}
                className="flex items-center gap-1.5 font-bold text-[#1a73e8]"
              >
                <Volume2 size={13} /> ทดลองฟังเสียง
              </button>
            </div>
          )}

          {/* Conversation */}
          <div ref={scrollRef} className="min-h-[120px] flex-1 space-y-3 overflow-y-auto bg-[var(--background)] p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ml-8 rounded-2xl rounded-br-md bg-[var(--primary)] px-4 py-3 text-sm leading-6 text-white"
                    : "group relative mr-4 rounded-2xl rounded-bl-md bg-[var(--card)] px-4 py-3 text-sm leading-6 text-[var(--card-foreground)] shadow-sm ring-1 ring-[var(--border)]"
                }
              >
                {message.role === "user" && message.spoken && <Mic size={11} className="mb-1 inline opacity-70" />}{" "}
                <Streamdown>{message.content}</Streamdown>
                {message.role === "assistant" && index > 0 && canSpeakOut && (
                  <button
                    type="button"
                    onClick={() => {
                      const session = sessionRef.current;
                      setPhase("speaking");
                      unlockAudio();
                      void speak(message.content, { engine, rate: settings.rate }).done.then(() => {
                        if (session === sessionRef.current) setPhase("idle");
                      });
                    }}
                    className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[var(--muted-foreground)] hover:text-[var(--ink)]"
                  >
                    <Volume2 size={11} /> ฟังอีกครั้ง
                  </button>
                )}
              </div>
            ))}
            {phase === "listening" && interim && (
              <div className="ml-8 rounded-2xl rounded-br-md border-2 border-dashed border-[var(--primary)] px-4 py-3 text-sm leading-6 text-[var(--primary)]">
                {interim}…
              </div>
            )}
          </div>

          {/* Voice stage */}
          <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 pb-4 pt-3">
            {inAppBrowser() && (
              <div className="mb-3 rounded-xl bg-[#fff6e5] px-3 py-2 text-center text-[11px] font-bold leading-5 text-[#8a6412]">
                เบราว์เซอร์ในแอป {inAppBrowser() === "line" ? "LINE" : "Facebook/IG"} มักใช้ไมโครโฟนไม่ได้
                {inAppBrowser() === "line" ? (
                  <a
                    href={`${window.location.pathname}${window.location.search ? window.location.search + "&" : "?"}openExternalBrowser=1`}
                    className="ml-1 underline"
                  >
                    เปิดใน Chrome/Safari
                  </a>
                ) : (
                  " — แตะ ⋯ แล้วเลือกเปิดในเบราว์เซอร์"
                )}
              </div>
            )}
            {canListen ? (
              <div className="flex flex-col items-center">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  {(phase === "listening" || phase === "speaking") && (
                    <>
                      <span className={cn("absolute inset-0 animate-ping rounded-full opacity-25", phase === "listening" ? "bg-[#e97967]" : "bg-[var(--aqua)]")} />
                      <span className={cn("absolute inset-2 rounded-full opacity-30", phase === "listening" ? "bg-[#e97967]" : "bg-[var(--aqua)]")} />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={onMic}
                    style={{ transform: `scale(${orbScale})` }}
                    className={cn(
                      "relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition-[transform,background-color] duration-100",
                      phase === "listening" ? "bg-[#e0533d]" : phase === "speaking" ? "bg-[#1a8f8a]" : busy ? "bg-[var(--muted-foreground)]" : "bg-[var(--deep)]",
                    )}
                    aria-label={phase === "listening" ? "พูดจบแล้ว" : phase === "speaking" ? "พูดแทรก" : busy ? "หยุด" : "แตะเพื่อพูด"}
                  >
                    {busy ? <Loader2 size={30} className="animate-spin" /> : phase === "speaking" ? <SpeakingBars /> : <Mic size={32} />}
                  </button>
                </div>
                <p className="mt-2 text-center text-xs font-black text-[var(--ink)]">{PHASE_TEXT[phase]}</p>
                {phase === "listening" && <p className="text-[10px] text-[var(--muted-foreground)]">พูดจบแล้วรอสักครู่ หรือแตะปุ่มอีกครั้ง</p>}
                {notice && <p className="mt-1 text-center text-[11px] font-bold text-[#c46242]">{notice}</p>}
                {(phase !== "idle" || settings.handsFree) && phase !== "listening" && (
                  <button type="button" onClick={stopAll} className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[var(--muted-foreground)] hover:text-[var(--ink)]">
                    <Square size={10} /> {phase === "idle" ? "โหมดสนทนาต่อเนื่องเปิดอยู่" : "หยุดทั้งหมด"}
                  </button>
                )}
              </div>
            ) : (
              <p className="mb-2 rounded-xl bg-[#fff6e5] px-3 py-2 text-center text-[11px] font-bold text-[#8a6412]">
                {!isSecureForMic()
                  ? "ใช้ไมโครโฟนได้เฉพาะเว็บ https (หรือ localhost) — พิมพ์คำถามแทนได้ครับ"
                  : !hasMicrophone()
                    ? "ไม่พบไมโครโฟน — พิมพ์คำถามแทนได้ครับ"
                    : "เบราว์เซอร์นี้ฟังเสียงไม่ได้ — ใช้ Chrome/Edge หรือพิมพ์คำถามแทน"}
              </p>
            )}

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {QUICK_QUESTIONS.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    unlockAudio();
                    void ask(label, false);
                  }}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-black text-[var(--foreground)] hover:border-[var(--aqua)] disabled:opacity-50"
                >
                  <Icon size={13} className="text-[var(--aqua)]" /> {label}
                  <ChevronRight size={12} className="text-[var(--muted-foreground)]" />
                </button>
              ))}
            </div>

            <form onSubmit={submitText} className="mt-2 flex gap-2">
              <input
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                placeholder="หรือพิมพ์คำถาม เช่น ห้องน้ำอยู่ไหน"
                className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                aria-label="พิมพ์คำถาม"
              />
              <button
                type="submit"
                disabled={!textInput.trim() || phase === "thinking"}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white disabled:opacity-40"
                aria-label="ส่งข้อความ"
              >
                <Send size={17} />
              </button>
            </form>
          </div>
        </div>
      )}

      {!hideLauncher && <button
        type="button"
        onClick={() => {
          unlockAudio();
          if (open) close();
          else setOpen(true);
        }}
        className="fixed bottom-5 right-3 z-[1200] flex h-14 items-center gap-2 rounded-full bg-[var(--deep)] px-4 text-white shadow-[0_14px_35px_rgba(16,41,58,0.3)] transition-all hover:-translate-y-1 sm:right-6"
        aria-label={open ? "ปิด Nong Platoo AI" : "เปิด Nong Platoo AI"}
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--aqua)] text-[var(--ink)]">
          {phase === "listening" ? <Mic size={17} className="animate-pulse" /> : <MessageCircle size={17} />}
        </span>
        <span className="hidden text-xs font-extrabold sm:inline">{open ? "ปิดผู้ช่วย" : "ถามน้องปลาทู"}</span>
      </button>}
    </>
  );
}

/** Little equaliser shown on the orb while the bot talks. */
function SpeakingBars() {
  return (
    <span className="flex h-8 items-end gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-white"
          style={{ height: "100%", animation: `npt-eq 0.9s ${i * 0.15}s ease-in-out infinite` }}
        />
      ))}
      <style>{"@keyframes npt-eq{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}"}</style>
    </span>
  );
}
