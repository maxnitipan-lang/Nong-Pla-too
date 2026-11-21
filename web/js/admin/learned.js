// /admin/learned — "คำถามที่คนถาม" (was "คำถามจาก AI"): what people ask Nong Platoo (server/chatLearning.js).
//
// Made to be read at a glance:
//   - three cards: what needs the admin (no answer yet, disputed, waiting for a check),
//   - four tabs: ต้องจัดการ / ใช้ตอบอยู่ / ทั้งหมด / ซ่อน,
//   - topic groups as clickable bars (ตึก / ข่าว / สาขา / นอกเรื่อง / อื่น ๆ),
//   - each question says in plain words what state it is in and what to do, with named buttons.
// Approved answers are used for that question and given to the AI as checked knowledge.

import { apiGet, apiPost } from "../api.js";
import { confirmDialog, field, html, icon, openDialog, raw, readForm, toast, toastError } from "./ui.js";

const GROUPS = [
  ["building", "ตึกและสถานที่", "🏫"],
  ["news", "ข่าวสาร", "📰"],
  ["program", "สาขาและการเรียน", "🎓"],
  ["offtopic", "นอกเรื่อง", "💬"],
  ["other", "อื่น ๆ", "📁"],
];
const GROUP_NAME = Object.fromEntries(GROUPS.map(([id, label, emoji]) => [id, `${emoji} ${label}`]));

const SOURCE = {
  faq: "คำตอบสำเร็จรูป",
  ai: "AI คิดเอง",
  "ai-kiosk": "AI คิดเอง",
  learned: "คำตอบที่บันทึกไว้",
  news: "รายการข่าว",
  fallback: "ตอบไม่ได้ (ตอนนั้น AI ไม่ว่าง)",
  "faq-close": "คำตอบที่ใกล้เคียง",
};

/** What state a question is in, in plain words, and what the admin should do. */
function stateOf(r) {
  if (r.status === "hidden") return { key: "hidden", badge: "🙈 ซ่อนไว้", tone: "grey", hint: "ไม่ใช้ตอบ" };
  if (r.disputes > 0) return { key: "disputed", badge: "⚠️ มีคนแย้งว่าผิด", tone: "danger", hint: "ตรวจกับข้อมูลจริง แล้วเขียนคำตอบที่ถูก" };
  if (r.status === "approved")
    return r.approvedBy === "ai"
      ? { key: "inuse", badge: "🤖 ใช้ตอบอยู่ (AI ตรวจเอง)", tone: "ok", hint: "AI ตอบตรงกัน 2 ครั้งจึงบันทึกไว้ — แก้ได้ถ้าไม่ถูก" }
      : { key: "inuse", badge: "✅ ใช้ตอบอยู่", tone: "ok", hint: "แอดมินยืนยันแล้ว" };
  if (r.unsure) return { key: "unanswered", badge: "❓ ยังตอบไม่ได้", tone: "danger", hint: "เขียนคำตอบให้น้องปลาทู" };
  if (r.reusable && r.lastSource === "ai")
    return r.verified === "mismatch"
      ? { key: "check", badge: "⏳ รอตรวจ · AI ตอบไม่ตรงกัน", tone: "warn", hint: "คำตอบอาจผิด แนะนำให้เขียนใหม่" }
      : { key: "check", badge: "⏳ รอตรวจ", tone: "warn", hint: "อ่านคำตอบ ถ้าถูกกด “ใช้คำตอบนี้”" };
  return { key: "fine", badge: "👍 ตอบได้แล้ว", tone: "grey", hint: "ตอบด้วยคำตอบที่มีอยู่ ไม่ต้องทำอะไร" };
}

/** Status filter: [value, label, test on the state]. */
const STATUSES = [
  ["all", "สถานะทั้งหมด", (s) => s.key !== "hidden"],
  ["todo", "ต้องจัดการ (ทุกอย่างที่ค้าง)", (s) => ["disputed", "unanswered", "check"].includes(s.key)],
  ["unanswered", "❓ ยังตอบไม่ได้", (s) => s.key === "unanswered"],
  ["disputed", "⚠️ มีคนแย้งว่าผิด", (s) => s.key === "disputed"],
  ["check", "⏳ รอตรวจ", (s) => s.key === "check"],
  ["inuse", "✅ ใช้ตอบอยู่", (s) => s.key === "inuse"],
  ["fine", "👍 ตอบได้แล้ว (คำตอบที่มีอยู่)", (s) => s.key === "fine"],
  ["hidden", "🙈 ซ่อนไว้", (s) => s.key === "hidden"],
];
const SOURCES = [
  ["all", "ตอบด้วยทั้งหมด"],
  ["faq", "คำตอบสำเร็จรูป"],
  ["ai", "AI คิดเอง"],
  ["learned", "คำตอบที่บันทึกไว้"],
  ["news", "รายการข่าว"],
  ["fallback", "ตอบไม่ได้ (AI ไม่ว่าง)"],
];
const SORTS = [
  ["count", "ถามบ่อยที่สุดก่อน"],
  ["recent", "ล่าสุดก่อน"],
  ["az", "เรียงตามตัวอักษร"],
];
/** Questions typed while testing the app ("ทดสอบ", "test"): hidden by default. */
const TEST = /ทดสอบ|เทส|\btest/i;
const FILTER_KEY = "nongplatoo.learnedFilters";
const DEFAULT_FILTERS = { q: "", group: "all", lang: "all", status: "all", source: "all", hideTest: true, sort: "count" };

/** Bold (**x**) shown as bold, like in the chat — other marks as plain text. */
const answerHtml = (text) =>
  html`${text}`.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n+/g, "<br>");

export async function render(page, { canEdit }) {
  let list = [];
  let showHelp = false;
  let f = { ...DEFAULT_FILTERS };
  try {
    f = { ...f, ...JSON.parse(localStorage.getItem(FILTER_KEY) || "{}") };
  } catch {
    /* no saved filters */
  }
  const keepFilters = () => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ ...f, q: "" }));
    } catch {
      /* private mode */
    }
  };
  const matches = (r) => {
    const test = TEST.test(r.question);
    if (f.hideTest && test) return false;
    if (!STATUSES.find(([id]) => id === f.status)[2](r.state)) return false;
    if (f.group !== "all" && r.category !== f.group) return false;
    if (f.lang !== "all" && r.lang !== f.lang) return false;
    if (f.source !== "all" && (r.lastSource === "ai-kiosk" ? "ai" : r.lastSource === "faq-close" ? "fallback" : r.lastSource) !== f.source) return false;
    const q = f.q.trim().toLowerCase();
    return !q || r.question.toLowerCase().includes(q) || r.answer.toLowerCase().includes(q);
  };
  const sorter = { count: (a, b) => b.askCount - a.askCount, recent: (a, b) => b.updatedAt - a.updatedAt, az: (a, b) => a.question.localeCompare(b.question, "th") };

  const draw = async () => {
    list = (await apiGet("admin/learned/list")).map((r) => ({ ...r, state: stateOf(r) }));
    // The summary follows "ไม่รวมรายการทดสอบ" too.
    const base = f.hideTest ? list.filter((r) => !TEST.test(r.question)) : list;
    const count = (key) => base.filter((r) => r.state.key === key).length;
    const shown = list.filter(matches).sort(sorter[f.sort] ?? sorter.count);
    const select = (name, options, label) => html`<select class="lq-select" data-filter="${name}" aria-label="${label}">${options.map(([v, text]) => raw(html`<option value="${v}" ${String(f[name]) === String(v) ? "selected" : ""}>${text}</option>`))}</select>`;
    const tip = (text) => html`<span class="lq-tip" title="${text}" aria-label="${text}">ⓘ</span>`;
    const changed = Object.entries(DEFAULT_FILTERS).some(([k, v]) => f[k] !== v);
    const asks = base.reduce((n, r) => n + r.askCount, 0);
    const agreed = base.filter((r) => r.state.key === "check" && r.verified === "agree").length;

    const card = (key, emoji, title, n, hint) => html`<button type="button" class="lq-card ${n ? `lq-${key}` : ""}" data-card="${key}">
        <span>${emoji} ${title}</span><strong>${n}</strong><small>${n ? hint : "เรียบร้อย ไม่มีงานค้าง"}</small></button>`;

    const groups = GROUPS.map(([id, label, emoji]) => {
      const rows = base.filter((r) => r.category === id && r.state.key !== "hidden");
      return { id, label: `${emoji} ${label}`, asks: rows.reduce((n, r) => n + r.askCount, 0) };
    });
    const maxAsks = Math.max(1, ...groups.map((g) => g.asks));

    const row = (r) => {
      const s = r.state;
      return html`<article class="lq-row" data-id="${r.id}">
        <div class="lq-q">
          <strong>“${r.question}”</strong>
          <span class="lq-badge lq-${s.tone}">${s.badge}</span>
        </div>
        <p class="lq-meta">ถาม ${r.askCount} ครั้ง · ${GROUP_NAME[r.category] ?? r.category} · ตอบด้วย${SOURCE[r.lastSource] ?? r.lastSource}${r.lang === "en" ? " · ภาษาอังกฤษ" : ""}</p>
        ${r.disputeNote ? raw(html`<p class="lq-dispute">ผู้ใช้แย้งว่า: “${r.disputeNote}”</p>`) : ""}
        <p class="lq-answer"><span>น้องปลาทูตอบว่า:</span> ${raw(answerHtml(r.answer.length > 240 ? `${r.answer.slice(0, 240)}…` : r.answer))}</p>
        <p class="lq-hint">👉 ${s.hint}</p>
        ${canEdit
          ? raw(html`<div class="lq-actions">
              <button type="button" class="btn small" data-act="write">✏️ เขียนคำตอบ</button>
              ${s.key === "check" ? raw(html`<button type="button" class="btn small outline" data-act="approve">✅ ใช้คำตอบนี้</button>`) : ""}
              <button type="button" class="btn small outline" data-act="${s.key === "hidden" ? "show" : "hide"}">${s.key === "hidden" ? "เลิกซ่อน" : "ซ่อน"}</button>
              <button type="button" class="btn small outline lq-del" data-act="delete">ลบ</button>
            </div>`)
          : ""}
      </article>`;
    };

    page.innerHTML = html`
      <div class="lq-intro">
        <p>ดูว่าคนถามน้องปลาทูเรื่องอะไรบ้าง แล้วช่วยสอนคำตอบที่ถูกต้อง · ถามทั้งหมด <strong>${asks}</strong> ครั้ง (${base.length} คำถาม)</p>
        <button type="button" class="btn small outline" data-help>${showHelp ? "ซ่อนวิธีใช้" : "❔ วิธีใช้"}</button>
      </div>
      ${showHelp
        ? raw(html`<ol class="lq-help">
            <li><strong>ดูการ์ดด้านบน</strong> — ถ้ามีตัวเลข แปลว่ามีงานรอ กดการ์ดเพื่อดูรายการ</li>
            <li><strong>กด ✏️ เขียนคำตอบ</strong> — พิมพ์ว่าน้องปลาทูควรตอบอะไร (กด “ให้ AI ช่วยร่าง” ก่อนก็ได้) แล้วบันทึก</li>
            <li><strong>เสร็จ!</strong> — คนที่ถามแบบนี้จะได้คำตอบนั้นทันที และ AI จะใช้ตอบคำถามที่คล้ายกันด้วย</li>
          </ol>
          <p class="muted">🤖 AI บันทึกคำตอบเองได้ เมื่อถามซ้ำ 2 รอบแล้วได้คำตอบตรงกัน · ถ้ามีคนแย้งว่าผิด คำตอบที่ AI บันทึกจะหยุดใช้จนกว่าแอดมินตรวจ · ไม่เก็บคำถามที่มีเบอร์โทร อีเมล หรือเรื่องส่วนตัว</p>`)
        : ""}

      <div class="lq-cards">
        ${raw(card("unanswered", "❓", "ยังตอบไม่ได้", count("unanswered"), "ช่วยเขียนคำตอบให้หน่อย"))}
        ${raw(card("disputed", "⚠️", "มีคนแย้งว่าผิด", count("disputed"), "ตรวจแล้วแก้คำตอบ"))}
        ${raw(card("check", "⏳", "รอตรวจคำตอบ", count("check"), "อ่านแล้วกดใช้ หรือแก้"))}
      </div>

      <div class="card lq-groups">
        <div class="lq-groups-head"><strong>คนถามเรื่องอะไรบ้าง</strong>${f.group !== "all" ? raw(html`<button type="button" class="btn small outline" data-group="all">ดูทุกกลุ่ม</button>`) : raw('<small class="muted">กดที่กลุ่มเพื่อดูเฉพาะกลุ่มนั้น</small>')}</div>
        ${groups.map((g) => raw(html`<button type="button" class="lq-bar ${f.group === g.id ? "on" : ""}" data-group="${g.id}">
            <span>${g.label}</span><i><b style="width:${(100 * g.asks) / maxAsks}%"></b></i><small>${g.asks} ครั้ง</small></button>`))}
      </div>

      <div class="lq-filters">
        <label class="lq-search">🔍<input type="search" data-filter="q" value="${f.q}" placeholder="ค้นหา: พิมพ์คำในคำถามหรือคำตอบ เช่น ห้องสมุด, ค่าเทอม" /></label>
        <div class="lq-fgroups">
          <fieldset><legend>เรื่องที่ถาม ${raw(tip("กลุ่มของคำถาม (ระบบจัดให้อัตโนมัติ) และภาษาที่ถาม"))}</legend>
            ${raw(select("group", [["all", "ทุกกลุ่ม"], ...GROUPS.map(([id, label, emoji]) => [id, `${emoji} ${label}`])], "กลุ่มคำถาม"))}
            ${raw(select("lang", [["all", "ทุกภาษา"], ["th", "ภาษาไทย"], ["en", "ภาษาอังกฤษ"]], "ภาษา"))}
          </fieldset>
          <fieldset><legend>สถานะ & ที่มา ${raw(tip("สถานะ = ต้องทำอะไรกับคำถามนี้ · ตอบด้วย = น้องปลาทูได้คำตอบมาจากไหน"))}</legend>
            ${raw(select("status", STATUSES.map(([id, label, fn]) => [id, `${label} (${list.filter((r) => fn(r.state) && (!f.hideTest || !TEST.test(r.question))).length})`]), "สถานะ"))}
            ${raw(select("source", SOURCES, "ตอบด้วย"))}
          </fieldset>
          <fieldset><legend>อื่น ๆ ${raw(tip("ซ่อนคำถามที่พิมพ์ตอนทดสอบระบบ (มีคำว่า ทดสอบ / test) และเลือกวิธีเรียง"))}</legend>
            ${raw(select("hideTest", [["true", "ไม่รวมรายการทดสอบ"], ["false", "รวมรายการทดสอบ"]], "รายการทดสอบ"))}
            ${raw(select("sort", SORTS, "เรียงตาม"))}
          </fieldset>
        </div>
        <p class="lq-count">พบ <strong>${shown.length}</strong> คำถาม${changed ? raw(' · <button type="button" class="lq-reset" data-reset>ล้างตัวกรอง</button>') : ""}</p>
      </div>

      ${shown.length
        ? raw(html`<div class="lq-list">${shown.map((r) => raw(row(r)))}</div>`)
        : raw(html`<p class="empty">${f.status === "todo" && !f.q && f.group === "all" ? "🎉 ไม่มีงานค้าง น้องปลาทูตอบได้ทุกคำถามแล้ว — เลือกสถานะ “สถานะทั้งหมด” เพื่อดูทุกคำถาม" : "ไม่พบคำถามตามตัวกรองนี้ — ลองล้างตัวกรอง"}</p>`)}

      ${canEdit
        ? raw(html`<details class="lq-tools"><summary>เครื่องมือเพิ่มเติม</summary>
            <p class="muted">ใช้เมื่อมีคำถามรอเยอะ ๆ</p>
            <button type="button" class="btn small outline" data-act-all="ai-write">🤖 ให้ AI เขียนคำตอบให้คำถามที่ตอบไม่ได้</button>
            ${agreed ? raw(html`<button type="button" class="btn small outline" data-act-all="approve-agreed">✅ ใช้ทุกคำตอบที่ AI ตอบตรงกัน 2 ครั้ง (${agreed})</button>`) : ""}
          </details>`)
        : ""}`;
  };

  const save = async (input, message) => {
    try {
      await apiPost("admin/learned/update", input);
      toast(message);
      await draw();
    } catch (error) {
      toastError(error);
    }
  };

  const writeAnswer = (r) =>
    openDialog({
      title: "เขียนคำตอบให้น้องปลาทู",
      description: "พิมพ์คำตอบที่ถูกต้อง เมื่อบันทึก คนที่ถามแบบนี้จะได้คำตอบนี้ทันที",
      confirmLabel: "บันทึก",
      wide: true,
      body: html`<p>คำถาม: <strong>“${r.question}”</strong> <span class="muted">(ถาม ${r.askCount} ครั้ง)</span></p>
        ${r.disputeNote ? raw(html`<p class="lq-dispute">ผู้ใช้แย้งว่า: “${r.disputeNote}” — ตรวจกับข้อมูลจริงก่อนนะ</p>`) : ""}
        ${raw(field({ label: "คำตอบ", name: "answer", value: r.answer, rows: 8 }))}
        <button type="button" class="btn small outline" data-draft>🤖 ให้ AI ช่วยร่างคำตอบ</button>
        ${raw(field({ label: "กลุ่มคำถาม", name: "category", value: r.category, options: GROUPS.map(([id, label, emoji]) => [id, `${emoji} ${label}`]) }))}`,
      onOpen: (root) =>
        root.querySelector("[data-draft]").addEventListener("click", async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          b.textContent = "🤖 AI กำลังร่าง…";
          try {
            const draft = await apiPost("admin/learned/draft", { id: r.id });
            root.querySelector('[name="answer"]').value = draft.reply;
            toast("ร่างแล้ว — อ่านและแก้ก่อนบันทึก");
          } catch (error) {
            toastError(error);
          }
          b.disabled = false;
          b.textContent = "🤖 ให้ AI ช่วยร่างคำตอบ";
        }),
      onConfirm: async (root) => {
        const { answer, category } = readForm(root, ["answer", "category"]);
        if (!answer.trim()) return false;
        await save({ id: r.id, answer: answer.trim(), category }, "บันทึกแล้ว — น้องปลาทูจะตอบแบบนี้");
      },
    });

  page.addEventListener("click", async (e) => {
    if (e.target.closest("[data-help]")) {
      showHelp = !showHelp;
      return draw();
    }
    if (e.target.closest("[data-reset]")) {
      f = { ...DEFAULT_FILTERS };
      keepFilters();
      return draw();
    }
    const c = e.target.closest("[data-card]");
    if (c) {
      f = { ...f, status: c.dataset.card, group: "all", q: "" };
      keepFilters();
      await draw();
      page.querySelector(".lq-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const g = e.target.closest("[data-group]");
    if (g) {
      f.group = g.dataset.group === f.group ? "all" : g.dataset.group;
      if (f.group !== "all" && f.status === "todo") f.status = "all";
      keepFilters();
      return draw();
    }
    const all = e.target.closest("[data-act-all]");
    if (all?.dataset.actAll === "ai-write") {
      all.disabled = true;
      all.textContent = "🤖 AI กำลังเขียน…";
      try {
        const res = await apiPost("admin/learned/aiWrite");
        toast(res.tried ? `AI ลองเขียน ${res.tried} คำถาม · บันทึกได้ ${res.written} คำตอบ` : "ไม่มีคำถามที่ตอบไม่ได้เพราะ AI ไม่ว่าง");
      } catch (error) {
        toastError(error);
      }
      return draw();
    }
    if (all?.dataset.actAll === "approve-agreed") {
      const n = list.filter((r) => r.state.key === "check" && r.verified === "agree").length;
      if (!(await confirmDialog(`ใช้ ${n} คำตอบที่ AI ตอบตรงกัน 2 ครั้ง?`, "ควรอ่านคร่าว ๆ ก่อน — คำตอบเหล่านี้จะใช้ตอบคนอื่นทันที"))) return;
      try {
        await apiPost("admin/learned/approveAgreed");
        toast("เรียบร้อย");
      } catch (error) {
        toastError(error);
      }
      return draw();
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const r = list.find((x) => x.id === b.closest("[data-id]")?.dataset.id);
    if (!r) return;
    if (b.dataset.act === "write") return writeAnswer(r);
    if (b.dataset.act === "approve") {
      if (r.verified === "mismatch" && !(await confirmDialog("คำตอบนี้อาจผิด", "AI ตอบคำถามนี้ไม่ตรงกัน 2 ครั้ง แนะนำให้กด ✏️ เขียนคำตอบแทน ยังจะใช้คำตอบนี้ไหม?"))) return;
      return save({ id: r.id, status: "approved" }, "เรียบร้อย — ใช้คำตอบนี้แล้ว");
    }
    if (b.dataset.act === "hide") return save({ id: r.id, status: "hidden" }, "ซ่อนแล้ว");
    if (b.dataset.act === "show") return save({ id: r.id, status: "new" }, "เลิกซ่อนแล้ว");
    if (b.dataset.act === "delete") {
      if (!(await confirmDialog(`ลบคำถาม “${r.question}”?`, "ลบแล้วกู้คืนไม่ได้"))) return;
      try {
        await apiPost("admin/learned/delete", { id: r.id });
        toast("ลบแล้ว");
        await draw();
      } catch (error) {
        toastError(error);
      }
    }
  });

  page.addEventListener("change", (e) => {
    const el = e.target.closest("select[data-filter]");
    if (!el) return;
    const name = el.dataset.filter;
    f[name] = name === "hideTest" ? el.value === "true" : el.value;
    keepFilters();
    draw();
  });
  let typing = null;
  page.addEventListener("input", (e) => {
    const el = e.target.closest("input[data-filter=q]");
    if (!el) return;
    f.q = el.value;
    clearTimeout(typing);
    typing = setTimeout(async () => {
      const at = el.selectionStart;
      await draw();
      const again = page.querySelector("input[data-filter=q]");
      again?.focus();
      again?.setSelectionRange(at, at);
    }, 250);
  });

  await draw();
}
