// "น้องปลาทู" assistant panel with a real voice conversation:
//   tap the mic → speak → live caption → answer appears AND is read aloud →
//   (hands-free) it listens again, until you stop or stay quiet.
// Tapping the mic while it talks interrupts it. Voice falls back gracefully:
// browser recogniser → server transcription; AI voice → device voice.
// Questions go to POST /api/chat/ask (stateless, full history each time).
// (Same behaviour as client/src/components/CampusAIWidget.tsx.)
//
// Other parts of the page open it with these window events:
//   "nongplatoo:open"  open the panel     "nongplatoo:voice"  open and start listening
//   "nongplatoo:reset" kiosk idle: forget the conversation and close

import { apiPost } from "./api.js";
import { WAIT_PHRASES } from "../../shared/speechText.js";
import { icon } from "./icons.js";
import { renderMarkdown } from "./markdown.js";
import { $, html, raw, readStore, writeStore } from "./util.js";
import {
  aiVoiceAvailable,
  naturalDeviceVoice,
  checkMicrophone,
  devicePlatform,
  hasBrowserRecognition,
  hasMicrophone,
  inAppBrowser,
  isSecureForMic,
  listen,
  onMicrophoneMaybeChanged,
  preferredListenEngine,
  speak,
  stopSpeaking,
  thaiDeviceVoices,
  unlockAudio,
} from "./voice.js";

const GREETING = "สวัสดีครับ ผมน้องปลาทู 🐟\n\nแตะปุ่มไมค์แล้วพูดได้เลย หรือพิมพ์ถามเรื่องอาคาร สาขา ข่าวสาร และขอเส้นทางได้ครับ";
const QUICK_QUESTIONS = [
  { icon: "navigate", label: "ขอเส้นทางไปสาขาช่างยนต์" },
  { icon: "pin", label: "สาขาการบัญชีอยู่อาคารไหน" },
  { icon: "building", label: "วิทยาลัยมีสาขาอะไรบ้าง" },
];
const PHASE_TEXT = {
  idle: "แตะไมค์แล้วพูดได้เลย",
  listening: "กำลังฟัง… พูดได้เลยครับ",
  transcribing: "กำลังฟังคำถาม…",
  thinking: "น้องปลาทูกำลังคิด…",
  speaking: "กำลังพูด — แตะปุ่มเพื่อหยุด",
};
/** Buttons a reply can show (the server names them; unknown names are ignored). */
const CHAT_ACTIONS = {
  "dept-quiz": "🎯 เริ่มเกมเลือกสาขา",
  "open-departments": "🏫 ดูสาขาวิชาทั้งหมด",
  "open-news": "📰 ดูข่าวสาร",
  "open-map": "🗺️ เปิดแผนที่",
};
// v2: the voice defaults to "auto" (a natural device voice if there is one, else the AI voice).
const SETTINGS_KEY = "nong-platoo-voice-settings-v2";
const DEFAULT_SETTINGS = { speakReplies: true, handsFree: true, engine: "auto", rate: 1 };

/** Steps to turn the microphone on, per device. */
function micHelpSteps(state) {
  const blocked = state === "denied";
  const steps = {
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
  return steps[devicePlatform()];
}

const SPEAKING_BARS = '<span class="speaking-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

export class PlatooChat {
  /**
   * @param {HTMLElement} root              where to put the panel (inside .platoo-ui)
   * @param {object} options
   * @param {boolean} [options.atKiosk]     answers can say how far a building is from the kiosk
   * @param {(id:string)=>void} [options.onShowRoute]  the bot decided to show a walking route
   * @param {()=>void} [options.onOpenMap]  "เปิดแผนที่วิทยาลัย" button
   */
  constructor(root, { atKiosk = false, onShowRoute, onOpenMap, onAction } = {}) {
    this.atKiosk = atKiosk;
    this.onShowRoute = onShowRoute;
    this.onAction = onAction; // a button under a reply, e.g. open the department quiz
    this.onOpenMap = onOpenMap;
    this.s = {
      open: false,
      messages: [{ role: "assistant", content: GREETING }],
      phase: "idle", // idle | listening | transcribing | thinking | speaking
      interim: "",
      level: 0,
      notice: null,
      showSettings: false,
      settings: { ...DEFAULT_SETTINGS, ...(readStore(SETTINGS_KEY) ?? {}) },
      aiVoice: false,
      deviceVoiceName: null,
      micState: "prompt", // ok | prompt | denied | none
      showMicHelp: false,
    };
    this.listening = null;
    this.abort = null;
    this.misses = 0;
    this.session = 0; // bumps on "stop everything" so late callbacks do nothing

    this.el = document.createElement("div");
    this.el.className = "platoo-chat";
    root.append(this.el);
    this.mount();

    void aiVoiceAvailable().then((ai) => this.set({ aiVoice: ai }));
    const pickVoice = () => this.set({ deviceVoiceName: thaiDeviceVoices()[0]?.name ?? null });
    pickVoice();
    window.speechSynthesis?.addEventListener?.("voiceschanged", pickVoice);
    onMicrophoneMaybeChanged(() => this.s.open && this.checkMic());

    window.addEventListener("nongplatoo:open", () => {
      unlockAudio();
      this.setOpen(true);
    });
    window.addEventListener("nongplatoo:voice", () => {
      unlockAudio();
      this.setOpen(true);
      this.set({ settings: { ...this.s.settings, handsFree: true } });
      // No microphone → open in typing mode instead of starting to listen and failing.
      setTimeout(() => void checkMicrophone().then((state) => {
        this.set({ micState: state });
        if (state !== "none") this.startListening();
      }), 250);
    });
    window.addEventListener("nongplatoo:reset", () => {
      this.stopAll();
      this.set({ open: false, showSettings: false, notice: null, messages: [{ role: "assistant", content: GREETING }] });
      this.input.value = "";
    });
    window.platooChatReady = true;
  }

  /* ---------------- state */

  set(patch) {
    const before = this.s;
    this.s = { ...this.s, ...patch };
    if ("settings" in patch) writeStore(SETTINGS_KEY, this.s.settings);
    // Talking to the bot counts as using the kiosk (its 90 s reset watches for this).
    if ("phase" in patch && patch.phase !== "idle") window.dispatchEvent(new Event("nongplatoo:activity"));
    this.update(before);
  }

  get engine() {
    const chosen = this.s.settings.engine;
    if (chosen === "device") return "device";
    if (chosen === "auto" && naturalDeviceVoice()) return "device"; // natural and instant
    return this.s.aiVoice ? "ai" : "device";
  }
  get canSpeakOut() {
    return this.engine === "ai" || Boolean(this.s.deviceVoiceName) || "speechSynthesis" in window;
  }
  get canListen() {
    return this.s.micState !== "none" && hasMicrophone() && (hasBrowserRecognition() || this.s.aiVoice);
  }
  get busy() {
    return this.s.phase === "thinking" || this.s.phase === "transcribing";
  }

  setOpen(open) {
    this.set({ open });
    if (open) this.checkMic();
  }

  checkMic() {
    void checkMicrophone().then((state) => {
      if (this.s.micState !== "ok" && state === "ok") this.set({ micState: state, notice: null }); // fixed while waiting
      else this.set({ micState: state });
    });
  }

  close() {
    this.stopAll();
    this.set({ open: false });
  }

  /** Stop listening, thinking and talking. */
  stopAll() {
    this.session++;
    clearTimeout(this.waitTimer);
    this.waitPhrase = null;
    this.listening?.cancel();
    this.listening = null;
    this.abort?.abort();
    stopSpeaking();
    this.set({ phase: "idle", interim: "", level: 0 });
  }

  /* ---------------- talking */

  async speakReply(text, session) {
    const s = this.s.settings;
    if (!s.speakReplies) return;
    // The AI voice takes a few seconds to arrive — stay on "กำลังคิด…" until sound actually plays.
    this.set({ phase: "thinking" });
    // Let a wait phrase finish first, so the answer does not cut it off mid-word.
    await this.waitPhrase?.done;
    this.waitPhrase = null;
    if (session !== this.session) return;
    const speech = speak(text, {
      engine: this.engine,
      rate: s.rate,
      // A wait phrase was already heard, so the visitor can wait a little longer for the AI voice.
      firstWaitMs: this.saidWaitPhrase ? 8000 : undefined,
      onStart: () => session === this.session && this.set({ phase: "speaking" }),
    });
    await speech.done;
    if (session === this.session) this.set({ phase: "idle" });
  }

  async ask(question, fromVoice) {
    const q = question.trim();
    if (!q) return;
    const session = this.session;
    stopSpeaking();
    this.listening?.cancel();
    const history = [...this.s.messages.slice(1).map(({ role, content }) => ({ role, content })), { role: "user", content: q }].slice(-30);
    this.set({ notice: null, messages: [...this.s.messages, { role: "user", content: q, spoken: fromVoice }], phase: "thinking" });
    const controller = new AbortController();
    this.abort = controller;
    // Voice question: if the answer is not back within 0.6 s, say a short wait phrase (its voice
    // is made in advance on the server, so it plays at once) instead of leaving silence.
    this.saidWaitPhrase = false;
    clearTimeout(this.waitTimer);
    if (fromVoice && this.s.settings.speakReplies) {
      this.waitTimer = setTimeout(() => {
        if (session !== this.session) return;
        this.saidWaitPhrase = true;
        const phrase = WAIT_PHRASES[Math.floor(Math.random() * WAIT_PHRASES.length)];
        // Normally made in advance (instant); if the server just woke up and has not made it yet,
        // use the device voice after 1.5 s rather than hold the real answer back.
        this.waitPhrase = speak(phrase, { engine: this.engine, rate: this.s.settings.rate, firstWaitMs: 1500 });
      }, 600);
    }
    try {
      const { reply, routeToBuildingId, action } = await apiPost(
        "chat/ask",
        { messages: history, spoken: fromVoice || undefined, atKiosk: this.atKiosk || undefined },
        controller.signal,
      );
      clearTimeout(this.waitTimer);
      if (session !== this.session) return;
      this.set({ messages: [...this.s.messages, { role: "assistant", content: reply, action: CHAT_ACTIONS[action] ? action : undefined }] });
      if (routeToBuildingId && this.onShowRoute) {
        // Say it, then hand over to the map (the panel closes so the route is visible).
        void this.speakReply(reply, session);
        this.set({ open: false });
        this.onShowRoute(routeToBuildingId);
        return;
      }
      await this.speakReply(reply, session);
      if (session !== this.session) return;
      if (fromVoice && this.s.settings.handsFree) this.startListening();
    } catch (error) {
      clearTimeout(this.waitTimer);
      if (session !== this.session) return;
      const content = controller.signal.aborted
        ? "หยุดแล้วครับ — ถามใหม่ได้เลย"
        : `ขออภัยครับ ระบบยังตอบไม่ได้ตอนนี้\n(${error instanceof Error ? error.message : "ไม่ทราบสาเหตุ"})`;
      this.set({ messages: [...this.s.messages, { role: "assistant", content }], phase: "idle" });
    } finally {
      if (this.abort === controller) this.abort = null;
    }
  }

  startListening(preferServer = false) {
    const session = this.session;
    stopSpeaking();
    this.set({ notice: null, interim: "", phase: "listening" });
    const engine = preferServer ? "server" : preferredListenEngine(this.s.aiVoice);
    const l = listen(
      {
        onInterim: (interim) => this.set({ interim }),
        onLevel: (level) => this.setLevel(level),
        onProcessing: () => this.set({ phase: "transcribing" }),
      },
      engine,
    );
    this.listening = l;
    l.result
      .then((text) => {
        if (session !== this.session || this.listening !== l) return;
        this.listening = null;
        this.set({ level: 0, interim: "" });
        if (text) {
          this.misses = 0;
          void this.ask(text, true);
          return;
        }
        this.misses++;
        this.set({ phase: "idle" });
        if (this.s.settings.handsFree && this.misses < 2) {
          this.set({ notice: "ไม่ได้ยินเสียง — ลองพูดอีกครั้งครับ" });
          this.startListening();
        } else {
          this.misses = 0;
          this.set({ notice: "ไม่ได้ยินเสียงพูด — แตะไมค์เพื่อลองใหม่" });
        }
      })
      .catch((error) => {
        if (session !== this.session) return;
        this.listening = null;
        this.set({ level: 0, interim: "", phase: "idle" });
        // The browser recogniser failed (e.g. no network to its speech service) → try the server.
        if (error.message.startsWith("recognizer:") && engine === "browser" && this.s.aiVoice) {
          this.startListening(true);
          return;
        }
        this.set({ notice: error.message.startsWith("recognizer:") ? "ระบบฟังเสียงของเบราว์เซอร์ใช้ไม่ได้ — พิมพ์คำถามแทนได้ครับ" : error.message });
        void checkMicrophone().then((micState) => this.set({ micState }));
      });
  }

  /** The big mic button does the obvious thing for each state. */
  onMic() {
    unlockAudio(); // phones: allow the reply to be played and the mic to be recorded later
    const { phase } = this.s;
    if (phase === "listening") this.listening?.stop(); // done talking → use what was heard
    else if (phase === "speaking") this.stopAll(); // tap while speaking = stop talking
    else if (phase === "idle") {
      this.misses = 0;
      this.startListening();
    } else this.stopAll();
  }

  /** Mic loudness changes ~20×/s — only resize the orb, don't redraw. */
  setLevel(level) {
    this.s.level = level;
    const orb = this.el.querySelector(".voice-orb > button");
    if (orb) orb.style.transform = `scale(${this.s.phase === "listening" ? 1 + level * 0.35 : 1})`;
  }

  /* ---------------- drawing */

  mount() {
    this.el.innerHTML = html`
      <button type="button" class="ai-backdrop" data-chat="close" aria-label="ปิดผู้ช่วย" tabindex="-1"></button>
      <aside role="dialog" aria-label="ผู้ช่วยน้องปลาทู" class="assistant" aria-hidden="true" inert>
        <div class="assistant-header">
          <div class="assistant-avatar"><img src="/mascots/greeting.webp" alt="" aria-hidden="true" /></div>
          <div><strong>น้องปลาทู</strong><small><i></i> <span data-part="status"></span></small></div>
          <button type="button" data-chat="toggle-speak" data-part="speak-button"></button>
          <button type="button" data-chat="toggle-settings" data-part="settings-button" aria-label="ตั้งค่าเสียง" title="ตั้งค่าเสียง">${raw(icon("gear"))}</button>
          <button type="button" data-chat="close" aria-label="ปิดผู้ช่วย">${raw(icon("close"))}</button>
        </div>
        <div data-part="settings"></div>
        <div class="chat-content" data-part="messages"></div>
        <div class="voice-stage" data-part="voice"></div>
        <div class="suggestions">${QUICK_QUESTIONS.map((q) =>
          raw(html`<button type="button" data-chat="quick" data-question="${q.label}">${raw(icon(q.icon))} ${q.label}</button>`))}</div>
        ${this.onOpenMap ? raw(html`<button type="button" class="assistant-map-action" data-chat="open-map">${raw(icon("map"))} เปิดแผนที่วิทยาลัย</button>`) : ""}
        <form class="chat-input">
          <img class="chat-perch" src="/mascots/point.webp" alt="" aria-hidden="true" />
          <input placeholder="พิมพ์คำถามที่นี่ เช่น ห้องน้ำอยู่ไหน" aria-label="พิมพ์คำถาม" />
          <button type="submit" aria-label="ส่งข้อความ" disabled>${raw(icon("send"))}</button>
        </form>
      </aside>`;
    this.input = this.el.querySelector(".chat-input input");
    this.sendButton = this.el.querySelector(".chat-input button[type=submit]");
    this.input.addEventListener("input", () => this.updateSend());
    this.el.querySelector(".chat-input").addEventListener("submit", (event) => {
      event.preventDefault();
      unlockAudio();
      const q = this.input.value.trim();
      if (!q || this.s.phase === "thinking") return;
      this.input.value = "";
      this.updateSend();
      void this.ask(q, false);
    });
    this.el.addEventListener("click", (event) => this.onClick(event));
    this.el.addEventListener("change", (event) => this.onChange(event));
    this.el.addEventListener("input", (event) => {
      if (event.target.dataset.setting === "rate") this.set({ settings: { ...this.s.settings, rate: Number(event.target.value) } });
    });
    this.update(null);
  }

  onClick(event) {
    const el = event.target.closest("[data-chat]");
    if (!el) return;
    const s = this.s;
    switch (el.dataset.chat) {
      case "close":
        this.close();
        break;
      case "toggle-speak":
        this.set({ settings: { ...s.settings, speakReplies: !s.settings.speakReplies } });
        break;
      case "toggle-settings":
        this.set({ showSettings: !s.showSettings });
        break;
      case "engine":
        this.set({ settings: { ...s.settings, engine: el.dataset.engine } });
        break;
      case "try-voice":
        unlockAudio();
        speak("สวัสดีครับ ผมน้องปลาทู ยินดีต้อนรับสู่วิทยาลัยเทคนิคสมุทรสงครามครับ", { engine: this.engine, rate: s.settings.rate });
        break;
      case "mic":
        this.onMic();
        break;
      case "stop":
        this.stopAll();
        break;
      case "action":
        this.stopAll();
        this.set({ open: false });
        this.onAction?.(el.dataset.name);
        break;
      case "mic-help":
        this.set({ showMicHelp: !s.showMicHelp });
        break;
      case "quick":
        unlockAudio();
        void this.ask(el.dataset.question, false);
        break;
      case "listen-again": {
        const message = s.messages[Number(el.dataset.index)];
        const session = this.session;
        unlockAudio();
        this.set({ phase: "speaking" });
        void speak(message.content, { engine: this.engine, rate: s.settings.rate }).done.then(() => session === this.session && this.set({ phase: "idle" }));
        break;
      }
      case "open-map":
        this.onOpenMap?.();
        this.close();
        break;
    }
  }

  onChange(event) {
    const key = event.target.dataset.setting;
    if (key === "speakReplies" || key === "handsFree") this.set({ settings: { ...this.s.settings, [key]: event.target.checked } });
  }

  updateSend() {
    this.sendButton.disabled = !this.input.value.trim() || this.s.phase === "thinking";
  }

  /** Redraw only the parts whose state changed. */
  update(before) {
    const s = this.s;
    const changed = (...keys) => !before || keys.some((k) => before[k] !== s[k]);
    const part = (name) => this.el.querySelector(`[data-part="${name}"]`);

    if (changed("open")) {
      this.el.querySelector(".ai-backdrop").classList.toggle("visible", s.open);
      this.el.querySelector(".ai-backdrop").tabIndex = s.open ? 0 : -1;
      const panel = this.el.querySelector(".assistant");
      panel.classList.toggle("open", s.open);
      panel.setAttribute("aria-hidden", String(!s.open));
      panel.inert = !s.open;
    }
    if (changed("phase")) part("status").textContent = s.phase === "idle" ? "พร้อมช่วยเหลือ · คุยด้วยเสียงได้" : PHASE_TEXT[s.phase];
    if (changed("settings")) {
      const b = part("speak-button");
      b.innerHTML = icon(s.settings.speakReplies ? "volume-on" : "volume-off");
      b.setAttribute("aria-label", s.settings.speakReplies ? "ปิดเสียงตอบ" : "เปิดเสียงตอบ");
      b.title = b.getAttribute("aria-label");
    }
    if (changed("showSettings")) part("settings-button").classList.toggle("is-on", s.showSettings);
    if (changed("showSettings", "settings", "aiVoice", "deviceVoiceName")) part("settings").innerHTML = s.showSettings ? this.settingsHtml() : "";
    if (changed("messages", "interim", "phase", "aiVoice", "deviceVoiceName")) {
      const box = part("messages");
      box.innerHTML = this.messagesHtml();
      box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    }
    if (changed("phase", "notice", "micState", "showMicHelp", "aiVoice", "settings")) part("voice").innerHTML = this.voiceHtml();
    if (changed("phase")) {
      this.el.classList.toggle("is-speaking", s.phase === "speaking");
      for (const b of this.el.querySelectorAll("[data-chat=quick]")) b.disabled = this.busy;
      this.updateSend();
    }
  }

  settingsHtml() {
    const st = this.s.settings;
    return html`<div class="chat-settings">
      <label><span>อ่านคำตอบออกเสียง<small>ปิดได้ถ้าอยู่ในที่ที่ต้องเงียบ</small></span>
        <input type="checkbox" data-setting="speakReplies" ${st.speakReplies ? "checked" : ""} /></label>
      <label><span>สนทนาต่อเนื่อง (ไม่ต้องกดไมค์ซ้ำ)<small>ตอบจบแล้วฟังต่อทันที — เงียบ 2 รอบจะหยุดเอง</small></span>
        <input type="checkbox" data-setting="handsFree" ${st.handsFree ? "checked" : ""} /></label>
      <div><p>เสียงพูด</p><div class="voice-engines">
        <button type="button" data-chat="engine" data-engine="auto" class="${st.engine === "auto" ? "is-on" : ""}">
          <strong>อัตโนมัติ (แนะนำ)</strong><small>${naturalDeviceVoice() ? `ใช้ ${naturalDeviceVoice().name} — พูดได้ทันที` : "เสียง AI ธรรมชาติ"}</small></button>
        <button type="button" data-chat="engine" data-engine="ai" class="${st.engine === "ai" ? "is-on" : ""}" ${this.s.aiVoice ? "" : "disabled"}>
          <strong>เสียง AI (ธรรมชาติ)</strong><small>${this.s.aiVoice ? "Gemini · ต้องต่ออินเทอร์เน็ต" : "ยังไม่พร้อมใช้"}</small></button>
        <button type="button" data-chat="engine" data-engine="device" class="${st.engine === "device" ? "is-on" : ""}">
          <strong>เสียงของเครื่อง</strong><small>${this.s.deviceVoiceName ?? "ไม่พบเสียงภาษาไทยในเครื่อง"}</small></button>
      </div></div>
      <label class="rate">ความเร็วเสียง ${st.rate.toFixed(1)}×
        <input type="range" min="0.8" max="1.2" step="0.1" value="${st.rate}" data-setting="rate" /></label>
      <button type="button" class="try-voice" data-chat="try-voice">${raw(icon("volume-on"))} ทดลองฟังเสียง</button>
    </div>`;
  }

  messagesHtml() {
    const s = this.s;
    const rows = s.messages.map((m, index) => {
      if (m.role === "user") {
        return html`<div class="message-row user"><div class="message user">${m.spoken ? raw(icon("mic", "said-by-voice")) : ""} ${m.content}</div></div>`;
      }
      const again = index > 0 && this.canSpeakOut ? raw(html`<button type="button" class="listen-again" data-chat="listen-again" data-index="${index}">${raw(icon("volume-on"))} ฟังอีกครั้ง</button>`) : "";
      return html`<div class="message-row bot"><img class="message-mascot" src="/mascots/greeting.webp" alt="" aria-hidden="true" />
        <div class="message bot">${raw(renderMarkdown(m.content))}${m.action ? raw(html`<button type="button" class="chat-action" data-chat="action" data-name="${m.action}">${CHAT_ACTIONS[m.action]} ${raw(icon("arrow"))}</button>`) : ""}${again}</div></div>`;
    });
    const interim = s.phase === "listening" && s.interim ? html`<div class="message-row user"><div class="message user interim">${s.interim}…</div></div>` : "";
    return `<p class="chat-date">วันนี้</p>${rows.join("")}${interim}`;
  }

  voiceHtml() {
    const s = this.s;
    const browser = inAppBrowser();
    const inApp = browser
      ? html`<div class="chat-warning">เบราว์เซอร์ในแอป ${browser === "line" ? "LINE" : "Facebook/IG"} มักใช้ไมโครโฟนไม่ได้${
          browser === "line"
            ? raw(html` <a class="underline" href="${window.location.pathname}${window.location.search ? window.location.search + "&" : "?"}openExternalBrowser=1">เปิดใน Chrome/Safari</a>`)
            : " — แตะ ⋯ แล้วเลือกเปิดในเบราว์เซอร์"
        }</div>`
      : "";
    const help = (state) =>
      raw(html`<div class="mic-help"><button type="button" data-chat="mic-help">${s.showMicHelp ? "ซ่อนวิธีเปิดไมค์" : "วิธีเปิดไมโครโฟน"}</button>
        ${s.showMicHelp ? raw(html`<ol>${micHelpSteps(state).map((step) => raw(html`<li>${step}</li>`))}<li class="mic-help-note">ระหว่างนี้พิมพ์ หรือแตะคำถามด้านล่างแทนได้เลยครับ</li></ol>`) : ""}</div>`);

    if (!this.canListen) {
      const text = !isSecureForMic()
        ? "ใช้ไมโครโฟนได้เฉพาะเว็บ https (หรือ localhost) — พิมพ์คำถามแทนได้ครับ"
        : s.micState === "none" || !hasMicrophone()
          ? "เครื่องนี้ยังไม่มีไมโครโฟนที่ใช้ได้ — พิมพ์ หรือแตะคำถามด้านล่างได้เลยครับ"
          : "เบราว์เซอร์นี้ฟังเสียงไม่ได้ — ใช้ Chrome/Edge หรือพิมพ์คำถามแทน";
      return inApp + html`<div class="chat-warning">${text}${isSecureForMic() && s.micState === "none" ? help("none") : ""}</div>`;
    }

    const phase = s.phase;
    const ring = phase === "listening" || phase === "speaking" ? raw(`<span class="orb-ring ${phase}"></span><span class="orb-ring inner ${phase}"></span>`) : "";
    const orbClass = phase === "listening" ? "is-listening" : phase === "speaking" ? "is-speaking" : this.busy ? "is-busy" : "";
    const orbIcon = this.busy ? icon("spinner", "spin") : phase === "speaking" ? SPEAKING_BARS : icon("mic");
    const label = phase === "listening" ? "พูดจบแล้ว" : phase === "speaking" ? "หยุดพูด" : this.busy ? "หยุด" : "แตะเพื่อพูด";
    const stop =
      (phase !== "idle" || s.settings.handsFree) && phase !== "listening"
        ? raw(html`<button type="button" class="voice-stop" data-chat="stop">${raw(icon("stop"))} ${phase === "idle" ? "โหมดสนทนาต่อเนื่องเปิดอยู่" : "หยุดทั้งหมด"}</button>`)
        : "";
    return inApp + html`<div class="voice-orb-row">
      <div class="voice-orb">${ring}<button type="button" data-chat="mic" class="${orbClass}" aria-label="${label}">${raw(orbIcon)}</button></div>
      <div class="voice-copy">
        <strong>${PHASE_TEXT[phase]}</strong>
        ${phase === "listening" ? raw("<small>พูดจบแล้วรอสักครู่ หรือแตะปุ่มอีกครั้ง</small>") : ""}
        ${s.notice ? raw(html`<small class="voice-notice">${s.notice}</small>`) : ""}
        ${s.notice || s.micState === "denied" ? help(s.micState) : ""}
        ${stop}
      </div>
    </div>`;
  }
}

/** Kept for symmetry with the other modules: create the panel once per page. */
export function createChat(options) {
  return new PlatooChat($("#root"), options);
}
