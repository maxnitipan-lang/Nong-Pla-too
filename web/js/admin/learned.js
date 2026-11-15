// /admin/learned — "คำถามจาก AI": what people ask Nong Platoo (server/chatLearning.js).
//
// Questions are grouped by topic (ตึกและสถานที่ / ข่าวสาร / สาขาและการเรียน / นอกเรื่อง / อื่น ๆ),
// most-asked first, with views for the ones to look at: unanswered or unsure, disputed
// ("ไม่ใช่", "ผิด"), waiting for approval. For any question the admin writes the answer
// Nong Platoo should give (the AI can draft it first). Approved answers are used for that
// question and given to the AI as checked knowledge for similar ones.

import { apiGet, apiPost } from "../api.js";
import { confirmDialog, field, html, icon, openDialog, raw, readForm, toast, toastError } from "./ui.js";

const GROUPS = [
  ["all", "ทั้งหมด", "📋"],
  ["building", "ตึกและสถานที่", "🏫"],
  ["news", "ข่าวสาร", "📰"],
  ["program", "สาขาและการเรียน", "🎓"],
  ["offtopic", "นอกเรื่อง", "💬"],
  ["other", "อื่น ๆ", "📁"],
];
const GROUP_NAME = Object.fromEntries(GROUPS.map(([id, label, emoji]) => [id, `${emoji} ${label}`]));

const VIEWS = [
  ["top", "🔥 ถามบ่อยที่สุด", () => true],
  ["unsure", "❓ ตอบไม่ได้ / ไม่มั่นใจ", (r) => r.unsure && r.status !== "hidden"],
  ["disputed", "⚠️ มีคนแย้ง", (r) => r.disputes > 0],
  ["waiting", "⏳ รออนุมัติ", (r) => r.status === "new" && r.reusable],
  ["approved", "✅ อนุมัติแล้ว", (r) => r.status === "approved"],
  ["ai", "🤖 AI เขียนเอง", (r) => r.status === "approved" && r.approvedBy === "ai"],
  ["hidden", "🙈 ซ่อน", (r) => r.status === "hidden"],
];

const SOURCE = {
  faq: "คำตอบสำเร็จรูป",
  ai: "AI คิดเอง",
  "ai-kiosk": "AI (เฉพาะตู้)",
  learned: "คำตอบที่แอดมินอนุมัติ",
  news: "รายการข่าว",
  fallback: "ตอบไม่ได้ (AI ไม่ว่าง)",
  "faq-close": "คำตอบใกล้เคียง (AI ไม่ว่าง)",
};
const CHECK = {
  agree: ["✓ AI ตอบตรงกัน 2 ครั้ง", ""],
  mismatch: ["⚠ AI ตอบไม่ตรงกัน", "danger"],
  pending: ["… ยังไม่ได้ตรวจซ้ำ", "grey"],
};

export async function render(page, { canEdit }) {
  let list = [];
  let group = "all";
  let view = "top";

  const draw = async () => {
    list = await apiGet("admin/learned/list");
    const inGroup = (r) => group === "all" || r.category === group;
    const viewFn = VIEWS.find(([id]) => id === view)[2];
    const shown = list.filter((r) => inGroup(r) && viewFn(r)).sort((a, b) => b.askCount - a.askCount);

    // Summary and share of each group (by how many times people asked).
    const asks = list.reduce((n, r) => n + r.askCount, 0);
    const byGroup = GROUPS.slice(1).map(([id, label, emoji]) => {
      const rows = list.filter((r) => r.category === id);
      return { id, label: `${emoji} ${label}`, asks: rows.reduce((n, r) => n + r.askCount, 0), count: rows.length };
    });
    const maxAsks = Math.max(1, ...byGroup.map((g) => g.asks));
    const stat = (label, value, hint) => html`<div class="stat"><small>${label}</small><strong>${value}</strong><span>${hint}</span></div>`;
    const agreed = list.filter((r) => r.status === "new" && r.reusable && r.verified === "agree" && !r.disputes).length;

    const rows = shown.map((r) =>
      raw(html`<div class="row" data-id="${r.id}">
        <div class="grow">
          <strong>${r.question}</strong>
          <span class="pill blue">ถาม ${r.askCount} ครั้ง</span>
          <span class="pill grey">${GROUP_NAME[r.category] ?? r.category}</span>
          ${r.lang === "en" ? raw('<span class="pill grey">English</span>') : ""}
          <span class="pill ${r.lastSource === "fallback" ? "danger" : "grey"}">ตอบโดย: ${SOURCE[r.lastSource] ?? r.lastSource}</span>
          ${r.status === "approved" ? raw(r.approvedBy === "ai" ? '<span class="pill">🤖 AI เขียนเอง · ใช้ตอบอยู่</span>' : '<span class="pill">✅ แอดมินอนุมัติ · ใช้ตอบอยู่</span>') : ""}
          ${r.status === "hidden" ? raw('<span class="pill grey">ซ่อน</span>') : ""}
          ${r.unsure && r.status !== "approved" ? raw('<span class="pill danger">❓ ตอบไม่ได้ / ไม่มั่นใจ</span>') : ""}
          ${r.disputes ? raw(html`<span class="pill danger">⚠️ มีคนแย้ง ${r.disputes} ครั้ง</span>`) : ""}
          ${r.status === "new" && r.reusable && r.lastSource === "ai" ? raw(html`<span class="pill ${CHECK[r.verified]?.[1] ?? "grey"}">${CHECK[r.verified]?.[0] ?? r.verified}</span>`) : ""}
          ${r.disputeNote ? raw(html`<small>ผู้ใช้แย้งว่า: “${r.disputeNote}”</small>`) : ""}
          <small>${r.answer.length > 260 ? `${r.answer.slice(0, 260)}…` : r.answer}</small>
        </div>
        ${canEdit
          ? raw(html`<button type="button" class="icon-btn" data-act="write" aria-label="เขียนคำตอบ" title="เขียนคำตอบที่ควรตอบ">${raw(icon("pencil"))}</button>
              ${r.status === "new" && r.reusable ? raw(html`<button type="button" class="icon-btn" data-act="approve" aria-label="อนุมัติ" title="อนุมัติคำตอบนี้">${raw(icon("shieldok"))}</button>`) : ""}
              <button type="button" class="icon-btn" data-act="${r.status === "hidden" ? "show" : "hide"}" aria-label="${r.status === "hidden" ? "เลิกซ่อน" : "ซ่อน"}" title="${r.status === "hidden" ? "เลิกซ่อน" : "ซ่อน (ไม่ใช้ตอบ)"}">${raw(icon(r.status === "hidden" ? "eye" : "eyeoff"))}</button>
              <button type="button" class="icon-btn danger" data-act="delete" aria-label="ลบ" title="ลบ">${raw(icon("trash"))}</button>`)
          : ""}
      </div>`));

    page.innerHTML = html`<p class="muted">ทุกคำถามที่คนถามน้องปลาทู จัดกลุ่มให้อัตโนมัติ ดูว่าเรื่องไหนถูกถามบ่อย เรื่องไหนตอบไม่ได้ หรือมีคนแย้งว่าผิด
        แล้วกด ✏️ เพื่อเขียนคำตอบที่ควรตอบ (ให้ AI ช่วยร่างก่อนได้) — คำตอบที่อนุมัติจะใช้ตอบคำถามนี้ทันที และ AI จะใช้เป็นความรู้ตอบคำถามที่คล้ายกัน
        🤖 AI ก็เขียนคำตอบเข้าฐานข้อมูลเองได้ เมื่อถามซ้ำ 2 รอบแล้วได้ข้อเท็จจริงตรงกัน — ถ้ามีคนแย้ง คำตอบที่ AI เขียนจะหยุดใช้จนกว่าแอดมินตรวจ
        (ไม่เก็บคำถามที่มีเบอร์โทร อีเมล เลขบัตร หรือเรื่องวิกฤต)</p>
      <div class="grid3">
        ${raw(stat("ถามทั้งหมด", asks.toLocaleString("th-TH"), `${list.length} คำถามไม่ซ้ำกัน`))}
        ${raw(stat("ตอบไม่ได้ / ไม่มั่นใจ", list.filter(VIEWS[1][2]).length, "ควรเขียนคำตอบให้"))}
        ${raw(stat("มีคนแย้งว่าผิด", list.filter(VIEWS[2][2]).length, "ควรตรวจคำตอบ"))}
      </div>
      <div class="card" style="margin:14px 0">
        <strong>สัดส่วนคำถามแต่ละกลุ่ม</strong>
        ${byGroup.map((g) => raw(html`<div style="display:grid;grid-template-columns:170px 1fr 90px;gap:10px;align-items:center;margin-top:8px">
          <span>${g.label}</span>
          <span style="height:10px;background:var(--soft);border-radius:99px;overflow:hidden"><i style="display:block;height:100%;width:${(100 * g.asks) / maxAsks}%;background:var(--accent)"></i></span>
          <small class="muted">${g.asks} ครั้ง · ${g.count} ข้อ</small></div>`))}
      </div>
      <div class="toolbar">${GROUPS.map(([id, label, emoji]) => {
        const n = id === "all" ? list.length : list.filter((r) => r.category === id).length;
        return raw(html`<button type="button" class="btn ${group === id ? "" : "outline"}" data-group="${id}">${emoji} ${label} (${n})</button>`);
      })}</div>
      <div class="toolbar">${VIEWS.map(([id, label, fn]) => raw(html`<button type="button" class="btn ${view === id ? "" : "outline"}" data-view="${id}">${label} (${list.filter((r) => inGroup(r) && fn(r)).length})</button>`))}
        ${canEdit ? raw(html`<button type="button" class="btn outline" data-act-all="ai-write">🤖 ให้ AI เขียนคำตอบให้คำถามที่ตอบไม่ได้</button>`) : ""}
        ${canEdit && agreed ? raw(html`<button type="button" class="btn" data-act-all="approve-agreed">${raw(icon("shieldok"))} อนุมัติทั้งหมดที่ AI ตอบตรงกัน (${agreed})</button>`) : ""}</div>
      ${rows.length ? raw(html`<div class="rows">${rows}</div>`) : raw('<p class="empty">ยังไม่มีคำถามในหมวดนี้</p>')}`;
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
      title: "เขียนคำตอบที่ควรตอบ",
      description: "เมื่อบันทึก คำตอบนี้จะถูกอนุมัติ ใช้ตอบคำถามนี้ทันที และ AI จะใช้เป็นความรู้ตอบคำถามแนวเดียวกัน",
      confirmLabel: "บันทึกและอนุมัติ",
      wide: true,
      body: html`<p><strong>${r.question}</strong> <span class="pill blue">ถาม ${r.askCount} ครั้ง</span></p>
        ${r.disputeNote ? raw(html`<p class="muted">ผู้ใช้แย้งว่า: “${r.disputeNote}” — ตรวจกับข้อมูลจริงก่อนแก้</p>`) : ""}
        ${raw(field({ label: "คำตอบ", name: "answer", value: r.answer, rows: 8 }))}
        <button type="button" class="btn outline" data-draft>${raw(icon("wand"))} ให้ AI ช่วยร่างคำตอบจากข้อมูลวิทยาลัย</button>
        ${raw(field({ label: "กลุ่มคำถาม", name: "category", value: r.category, options: GROUPS.slice(1).map(([id, label, emoji]) => [id, `${emoji} ${label}`]) }))}`,
      onOpen: (root) =>
        root.querySelector("[data-draft]").addEventListener("click", async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          b.innerHTML = `${icon("spinner", "spin")} AI กำลังร่าง…`;
          try {
            const draft = await apiPost("admin/learned/draft", { id: r.id });
            root.querySelector('[name="answer"]').value = draft.reply;
            toast("ร่างแล้ว — ตรวจและแก้ก่อนบันทึก");
          } catch (error) {
            toastError(error);
          }
          b.disabled = false;
          b.innerHTML = `${icon("wand")} ให้ AI ช่วยร่างคำตอบจากข้อมูลวิทยาลัย`;
        }),
      onConfirm: async (root) => {
        const { answer, category } = readForm(root, ["answer", "category"]);
        if (!answer.trim()) return false;
        await save({ id: r.id, answer: answer.trim(), category }, "บันทึกและอนุมัติแล้ว");
      },
    });

  page.addEventListener("click", async (e) => {
    const g = e.target.closest("[data-group]");
    if (g) {
      group = g.dataset.group;
      return draw();
    }
    const v = e.target.closest("[data-view]");
    if (v) {
      view = v.dataset.view;
      return draw();
    }
    const all = e.target.closest("[data-act-all]");
    if (all?.dataset.actAll === "ai-write") {
      all.disabled = true;
      all.textContent = "🤖 AI กำลังเขียน…";
      try {
        const res = await apiPost("admin/learned/aiWrite");
        toast(res.tried ? `AI ลองเขียน ${res.tried} คำถาม · บันทึกได้ ${res.written} คำตอบ (ที่เหลือ AI ตอบไม่ตรงกันหรือไม่มีข้อมูล)` : "ไม่มีคำถามที่ตอบไม่ได้เพราะ AI ไม่ว่าง");
        await draw();
      } catch (error) {
        toastError(error);
        await draw();
      }
      return;
    }
    if (all) {
      const n = list.filter((r) => r.status === "new" && r.reusable && r.verified === "agree" && !r.disputes).length;
      if (!(await confirmDialog(`อนุมัติ ${n} คำตอบที่ AI ตอบตรงกัน 2 ครั้ง?`, "ควรอ่านคร่าว ๆ ก่อน — คำตอบเหล่านี้จะใช้ตอบคนอื่นทันที"))) return;
      try {
        await apiPost("admin/learned/approveAgreed");
        toast("อนุมัติแล้ว");
        await draw();
      } catch (error) {
        toastError(error);
      }
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const r = list.find((x) => x.id === b.closest(".row")?.dataset.id);
    if (!r) return;
    if (b.dataset.act === "write") return writeAnswer(r);
    if (b.dataset.act === "approve") {
      if ((r.verified === "mismatch" || r.disputes) && !(await confirmDialog("คำตอบนี้อาจผิด", "AI ตอบไม่ตรงกัน หรือมีคนแย้ง — แนะนำให้กด ✏️ เขียนคำตอบแทน ยังจะอนุมัติไหม?"))) return;
      return save({ id: r.id, status: "approved" }, "อนุมัติแล้ว — ใช้ตอบคำถามนี้แล้ว");
    }
    if (b.dataset.act === "hide") return save({ id: r.id, status: "hidden" }, "ซ่อนแล้ว — ไม่ใช้ตอบ");
    if (b.dataset.act === "show") return save({ id: r.id, status: "new" }, "เลิกซ่อนแล้ว");
    if (b.dataset.act === "delete") {
      if (!(await confirmDialog(`ลบคำถาม “${r.question}”?`, "สถิติของคำถามนี้จะหายไปด้วย"))) return;
      try {
        await apiPost("admin/learned/delete", { id: r.id });
        toast("ลบแล้ว");
        await draw();
      } catch (error) {
        toastError(error);
      }
    }
  });

  await draw();
}
