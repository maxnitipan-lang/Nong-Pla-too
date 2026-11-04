import { trpc } from "@/lib/trpc";
import {
  aiVoiceAvailable,
  checkMicrophone,
  devicePlatform,
  onMicrophoneMaybeChanged,
  type MicState,
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
import { useTheme } from "@/contexts/ThemeContext";
import "@/platoo/platoo-ui.css";
import "@/platoo/platoo-extra.css";
import {
  Building2,
  ChevronRight,
  Loader2,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Mic,
  Navigation,
  Send,
  Settings2,
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
  /** On the kiosk: answers can say how far a building is from here. */
  atKiosk?: boolean;
  /** Shows the "เปิดแผนที่วิทยาลัย" button in the panel. */
  onOpenMap?: () => void;
};

/**
 * "น้องปลาทู" assistant with a real voice conversation:
 *   tap the mic → speak → live caption → answer appears AND is read aloud →
 *   (hands-free) it listens again, until you stop or stay quiet.
 * Tapping the mic while it talks interrupts it. Voice falls back gracefully:
 * browser recogniser → server transcription; AI voice → device voice.
 * Chat itself is `chat.ask` like the old app (stateless, full history each time).
 */
export function CampusAIWidget({ onShowRoute, hideLauncher = false, atKiosk = false, onOpenMap }: CampusAIWidgetProps = {}) {
  const { theme } = useTheme();
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
  const [micState, setMicState] = useState<MicState>("prompt");
  const [showMicHelp, setShowMicHelp] = useState(false);

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
  // Check the microphone when the panel opens, and again when one is plugged in / turned on
  // or the person comes back from their settings — so nobody hits a dead mic button.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const check = () =>
      void checkMicrophone().then((state) => {
        if (!alive) return;
        setMicState((prev) => {
          if (prev !== "ok" && state === "ok") setNotice(null); // fixed while we were waiting
          return state;
        });
      });
    check();
    const off = onMicrophoneMaybeChanged(check);
    return () => {
      alive = false;
      off();
    };
  }, [open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interim, phase]);

  const engine: SpeakEngine = settings.engine === "ai" && aiVoice ? "ai" : "device";
  const canSpeakOut = engine === "ai" || Boolean(deviceVoiceName) || typeof window !== "undefined" && "speechSynthesis" in window;
  const canListen = micState !== "none" && hasMicrophone() && (hasBrowserRecognition() || aiVoice);

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
      // The AI voice takes a few seconds to arrive — stay on "กำลังคิด…" until sound actually plays.
      setPhase("thinking");
      const speech = speak(text, {
        engine: s.engine === "ai" && aiVoice ? "ai" : "device",
        rate: s.rate,
        onStart: () => {
          if (session === sessionRef.current) setPhase("speaking");
        },
      });
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
          { messages: history, spoken: fromVoice || undefined, atKiosk: atKiosk || undefined },
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
          void checkMicrophone().then(setMicState);
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
      // No microphone → open in typing mode instead of starting to listen and failing.
      setTimeout(() => {
        void checkMicrophone().then((state) => {
          setMicState(state);
          if (state !== "none") startListeningRef.current();
        });
      }, 250);
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

  // Always shown: greetings, common questions and "where is X" are answered from the
  // ready-made set even without an AI key; other questions then explain what is missing.

  const busy = phase === "thinking" || phase === "transcribing";
  const orbScale = phase === "listening" ? 1 + level * 0.35 : 1;

  // Styled like the Figma assistant (platoo-ui.css: .assistant, .chat-content, .chat-input …).
  // The panel stays mounted so it can slide in and out; `inert` keeps it out of reach while closed.
  return (
    <div className="platoo-ui platoo-chat" data-theme={theme === "dark" ? "dark" : "light"}>
      <button type="button" className={cn("ai-backdrop", open && "visible")} onClick={close} aria-label="ปิดผู้ช่วย" tabIndex={open ? 0 : -1} />
      <aside role="dialog" aria-label="ผู้ช่วยน้องปลาทู" aria-hidden={!open} inert={!open} className={cn("assistant", open && "open")}>
        {/* Header */}
        <div className="assistant-header">
          <div className="assistant-avatar">
            <img src="/mascots/greeting.webp" alt="" aria-hidden="true" />
          </div>
          <div>
            <strong>น้องปลาทู</strong>
            <small>
              <i /> {phase === "idle" ? "พร้อมช่วยเหลือ · คุยด้วยเสียงได้" : PHASE_TEXT[phase]}
            </small>
          </div>
          <button
            type="button"
            onClick={() => setSettings((s) => ({ ...s, speakReplies: !s.speakReplies }))}
            aria-label={settings.speakReplies ? "ปิดเสียงตอบ" : "เปิดเสียงตอบ"}
            title={settings.speakReplies ? "ปิดเสียงตอบ" : "เปิดเสียงตอบ"}
          >
            {settings.speakReplies ? <Volume2 /> : <VolumeX />}
          </button>
          <button type="button" onClick={() => setShowSettings((v) => !v)} className={cn(showSettings && "is-on")} aria-label="ตั้งค่าเสียง" title="ตั้งค่าเสียง">
            <Settings2 />
          </button>
          <button type="button" onClick={close} aria-label="ปิดผู้ช่วย">
            <X />
          </button>
        </div>

        {showSettings && (
          <div className="chat-settings">
            <label>
              <span>
                อ่านคำตอบออกเสียง
                <small>ปิดได้ถ้าอยู่ในที่ที่ต้องเงียบ</small>
              </span>
              <input type="checkbox" checked={settings.speakReplies} onChange={(e) => setSettings((s) => ({ ...s, speakReplies: e.target.checked }))} />
            </label>
            <label>
              <span>
                สนทนาต่อเนื่อง (ไม่ต้องกดไมค์ซ้ำ)
                <small>ตอบจบแล้วฟังต่อทันที — เงียบ 2 รอบจะหยุดเอง</small>
              </span>
              <input type="checkbox" checked={settings.handsFree} onChange={(e) => setSettings((s) => ({ ...s, handsFree: e.target.checked }))} />
            </label>
            <div>
              <p>เสียงพูด</p>
              <div className="voice-engines">
                {(["ai", "device"] as const).map((e) => (
                  <button key={e} type="button" disabled={e === "ai" && !aiVoice} onClick={() => setSettings((s) => ({ ...s, engine: e }))} className={cn(engine === e && "is-on")}>
                    <strong>{e === "ai" ? "เสียง AI (ธรรมชาติ)" : "เสียงของเครื่อง"}</strong>
                    <small>{e === "ai" ? (aiVoice ? "Gemini · ต้องต่ออินเทอร์เน็ต" : "ยังไม่พร้อมใช้") : deviceVoiceName ?? "ไม่พบเสียงภาษาไทยในเครื่อง"}</small>
                  </button>
                ))}
              </div>
            </div>
            <label className="rate">
              ความเร็วเสียง {settings.rate.toFixed(1)}×
              <input type="range" min={0.8} max={1.2} step={0.1} value={settings.rate} onChange={(e) => setSettings((s) => ({ ...s, rate: Number(e.target.value) }))} />
            </label>
            <button
              type="button"
              className="try-voice"
              onClick={() => unlockAudio() ?? speak("สวัสดีครับ ผมน้องปลาทู ยินดีต้อนรับสู่วิทยาลัยเทคนิคสมุทรสงครามครับ", { engine, rate: settings.rate })}
            >
              <Volume2 size={13} /> ทดลองฟังเสียง
            </button>
          </div>
        )}

        {/* Conversation */}
        <div ref={scrollRef} className="chat-content">
          <p className="chat-date">วันนี้</p>
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={cn("message-row", message.role === "user" ? "user" : "bot")}>
              {message.role === "assistant" && <img className="message-mascot" src="/mascots/greeting.webp" alt="" aria-hidden="true" />}
              <div className={cn("message", message.role === "user" ? "user" : "bot")}>
                {message.role === "user" && message.spoken && <Mic size={11} className="mb-1 inline opacity-70" />}{" "}
                <Streamdown>{message.content}</Streamdown>
                {message.role === "assistant" && index > 0 && canSpeakOut && (
                  <button
                    type="button"
                    className="listen-again"
                    onClick={() => {
                      const session = sessionRef.current;
                      setPhase("speaking");
                      unlockAudio();
                      void speak(message.content, { engine, rate: settings.rate }).done.then(() => {
                        if (session === sessionRef.current) setPhase("idle");
                      });
                    }}
                  >
                    <Volume2 size={11} /> ฟังอีกครั้ง
                  </button>
                )}
              </div>
            </div>
          ))}
          {phase === "listening" && interim && (
            <div className="message-row user">
              <div className="message user interim">{interim}…</div>
            </div>
          )}
        </div>

        {/* Voice: the big mic (kiosk visitors mostly talk rather than type). */}
        <div className="voice-stage">
          {inAppBrowser() && (
            <div className="chat-warning">
              เบราว์เซอร์ในแอป {inAppBrowser() === "line" ? "LINE" : "Facebook/IG"} มักใช้ไมโครโฟนไม่ได้
              {inAppBrowser() === "line" ? (
                <a href={`${window.location.pathname}${window.location.search ? window.location.search + "&" : "?"}openExternalBrowser=1`} className="ml-1 underline">
                  เปิดใน Chrome/Safari
                </a>
              ) : (
                " — แตะ ⋯ แล้วเลือกเปิดในเบราว์เซอร์"
              )}
            </div>
          )}
          {canListen ? (
            <div className="voice-orb-row">
              <div className="voice-orb">
                {(phase === "listening" || phase === "speaking") && (
                  <>
                    <span className={cn("absolute inset-0 animate-ping rounded-full opacity-25", phase === "listening" ? "bg-[#e97967]" : "bg-[#21a7a0]")} />
                    <span className={cn("absolute inset-1.5 rounded-full opacity-30", phase === "listening" ? "bg-[#e97967]" : "bg-[#21a7a0]")} />
                  </>
                )}
                <button
                  type="button"
                  onClick={onMic}
                  style={{ transform: `scale(${orbScale})` }}
                  className={cn(phase === "listening" ? "is-listening" : phase === "speaking" ? "is-speaking" : busy ? "is-busy" : "")}
                  aria-label={phase === "listening" ? "พูดจบแล้ว" : phase === "speaking" ? "พูดแทรก" : busy ? "หยุด" : "แตะเพื่อพูด"}
                >
                  {busy ? <Loader2 size={26} className="animate-spin" /> : phase === "speaking" ? <SpeakingBars /> : <Mic size={28} />}
                </button>
              </div>
              <div className="voice-copy">
                <strong>{PHASE_TEXT[phase]}</strong>
                {phase === "listening" && <small>พูดจบแล้วรอสักครู่ หรือแตะปุ่มอีกครั้ง</small>}
                {notice && <small className="voice-notice">{notice}</small>}
                {(notice || micState === "denied") && <MicHelpToggle open={showMicHelp} onToggle={() => setShowMicHelp((v) => !v)} state={micState} />}
                {(phase !== "idle" || settings.handsFree) && phase !== "listening" && (
                  <button type="button" onClick={stopAll} className="voice-stop">
                    <Square size={10} /> {phase === "idle" ? "โหมดสนทนาต่อเนื่องเปิดอยู่" : "หยุดทั้งหมด"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="chat-warning">
              {!isSecureForMic()
                ? "ใช้ไมโครโฟนได้เฉพาะเว็บ https (หรือ localhost) — พิมพ์คำถามแทนได้ครับ"
                : micState === "none" || !hasMicrophone()
                  ? "เครื่องนี้ยังไม่มีไมโครโฟนที่ใช้ได้ — พิมพ์ หรือแตะคำถามด้านล่างได้เลยครับ"
                  : "เบราว์เซอร์นี้ฟังเสียงไม่ได้ — ใช้ Chrome/Edge หรือพิมพ์คำถามแทน"}
              {isSecureForMic() && micState === "none" && <MicHelpToggle open={showMicHelp} onToggle={() => setShowMicHelp((v) => !v)} state="none" />}
            </div>
          )}
        </div>

        <div className="suggestions">
          {QUICK_QUESTIONS.map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                unlockAudio();
                void ask(label, false);
              }}
              disabled={busy}
            >
              <Icon size={13} className="inline" /> {label}
            </button>
          ))}
        </div>

        {onOpenMap && (
          <button
            type="button"
            className="assistant-map-action"
            onClick={() => {
              onOpenMap();
              close();
            }}
          >
            <MapIcon /> เปิดแผนที่วิทยาลัย
          </button>
        )}

        <form onSubmit={submitText} className="chat-input">
          <img className="chat-perch" src="/mascots/point.webp" alt="" aria-hidden="true" />
          <input value={textInput} onChange={(event) => setTextInput(event.target.value)} placeholder="พิมพ์คำถามที่นี่ เช่น ห้องน้ำอยู่ไหน" aria-label="พิมพ์คำถาม" />
          <button type="submit" disabled={!textInput.trim() || phase === "thinking"} aria-label="ส่งข้อความ">
            <Send />
          </button>
        </form>
      </aside>

      {!hideLauncher && (
        <button
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
        </button>
      )}
    </div>
  );
}

function MicHelpToggle({ open, onToggle, state }: { open: boolean; onToggle: () => void; state: MicState }) {
  return (
    <div className="mt-1 w-full text-left">
      <button type="button" onClick={onToggle} className="mx-auto block text-[11px] font-black text-[var(--aqua)] underline">
        {open ? "ซ่อนวิธีเปิดไมค์" : "วิธีเปิดไมโครโฟน"}
      </button>
      {open && <MicHelp state={state} />}
    </div>
  );
}

function MicHelp({ state }: { state: MicState }) {
  const platform = devicePlatform();
  const blocked = state === "denied";
  const steps: Record<ReturnType<typeof devicePlatform>, string[]> = {
    ios: blocked
      ? ["แตะ aA ที่แถบที่อยู่เว็บ", "การตั้งค่าเว็บไซต์ → ไมโครโฟน → อนุญาต", "รีเฟรชหน้านี้"]
      : ["ตั้งค่า (Settings) → Safari → ไมโครโฟน → ถาม หรือ อนุญาต", "กลับมาที่หน้านี้แล้วแตะไมค์อีกครั้ง"],
    android: blocked
      ? ["แตะไอคอนหน้าที่อยู่เว็บ (🔒 หรือ ⚙)", "สิทธิ์ → ไมโครโฟน → อนุญาต", "รีเฟรชหน้านี้"]
      : ["การตั้งค่าโทรศัพท์ → แอป → Chrome → สิทธิ์ → ไมโครโฟน → อนุญาต", "กลับมาที่หน้านี้แล้วแตะไมค์อีกครั้ง"],
    windows: blocked
      ? ["คลิกไอคอนหน้าที่อยู่เว็บ (ซ้ายของชื่อเว็บ)", "เปิดสวิตช์ Microphone", "กด F5 เพื่อรีเฟรช"]
      : [
          "เสียบไมค์/หูฟัง หรือกดปุ่มเปิดไมค์บนคีย์บอร์ด (โน้ตบุ๊กหลายรุ่นคือ F4)",
          "Settings → System → Sound → All sound devices → เลือกไมค์ → Allow",
          "Settings → Privacy & security → Microphone → เปิดทุกข้อ",
        ],
    mac: blocked
      ? ["คลิกไอคอนหน้าที่อยู่เว็บ → อนุญาตไมโครโฟน", "รีเฟรชหน้านี้"]
      : ["System Settings → Privacy & Security → Microphone → เปิดให้เบราว์เซอร์", "เปิดเบราว์เซอร์ใหม่แล้วลองอีกครั้ง"],
    other: ["อนุญาตไมโครโฟนให้เว็บนี้ในการตั้งค่าเบราว์เซอร์", "รีเฟรชหน้านี้แล้วลองอีกครั้ง"],
  };
  return (
    <ol className="mt-2 list-decimal space-y-1 rounded-xl bg-[var(--card)] py-2 pl-7 pr-3 text-[11px] font-semibold leading-5 text-[var(--foreground)]">
      {steps[platform].map((step) => (
        <li key={step}>{step}</li>
      ))}
      <li className="list-none -ml-4 pt-1 text-[10px] text-[var(--muted-foreground)]">
        ระหว่างนี้พิมพ์ หรือแตะคำถามด้านล่างแทนได้เลยครับ
      </li>
    </ol>
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
