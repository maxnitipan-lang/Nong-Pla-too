// /admin/learned — what Nong Platoo learned from real questions (server/chatLearning.js).
// Each row: the question, how many people asked it, the AI's answer and its state.
//   "ใช้งานอยู่"  the answer is reused (asked 2+ times, or approved)
//   "รอคนถามซ้ำ"  kept, but used only once someone asks again
//   "อนุมัติแล้ว"  checked by an admin: always used, never replaced by a new AI answer
//   "ซ่อน"        never used

import { apiGet, apiPost } from "../api.js";
import { confirmDialog, field, html, icon, openDialog, raw, readForm, toast, toastError } from "./ui.js";

const STATUS = {
  approved: { label: "อนุมัติแล้ว", cls: "" },
  hidden: { label: "ซ่อน", cls: "grey" },
};

export async function render(page, { canEdit }) {
  let list = [];
  let filter = "all";

  const draw = async () => {
    list = await apiGet("admin/learned/list");
    const shown = list.filter((r) => filter === "all" || (filter === "use" ? r.inUse : filter === "wait" ? !r.inUse && r.status === "new" : r.status === filter));
    const count = (f) => list.filter((r) => (f === "use" ? r.inUse : f === "wait" ? !r.inUse && r.status === "new" : r.status === f)).length;
    const tab = (id, label, n) => html`<button type="button" class="btn ${filter === id ? "" : "outline"}" data-filter="${id}">${label} (${n})</button>`;
    const rows = shown.map((r) =>
      raw(html`<div class="row" data-id="${r.id}">
        <div class="grow">
          <strong>${r.question}</strong>
          <span class="pill">ถาม ${r.askCount} ครั้ง</span>
          ${r.lang === "en" ? raw('<span class="pill">English</span>') : ""}
          ${STATUS[r.status] ? raw(html`<span class="pill ${STATUS[r.status].cls}">${STATUS[r.status].label}</span>`) : raw(html`<span class="pill ${r.inUse ? "" : "grey"}">${r.inUse ? "ใช้งานอยู่" : "รอคนถามซ้ำ"}</span>`)}
          <small>${r.answer.length > 220 ? `${r.answer.slice(0, 220)}…` : r.answer}</small>
        </div>
        ${canEdit
          ? raw(html`${r.status !== "approved" ? raw(html`<button type="button" class="icon-btn" data-act="approve" aria-label="อนุมัติ" title="อนุมัติ (ใช้ตอบเสมอ)">${raw(icon("shieldok"))}</button>`) : ""}
              <button type="button" class="icon-btn" data-act="edit" aria-label="แก้คำตอบ" title="แก้คำตอบ">${raw(icon("pencil"))}</button>
              <button type="button" class="icon-btn" data-act="${r.status === "hidden" ? "show" : "hide"}" aria-label="${r.status === "hidden" ? "เลิกซ่อน" : "ซ่อน"}" title="${r.status === "hidden" ? "เลิกซ่อน" : "ซ่อน (ไม่ใช้ตอบ)"}">${raw(icon(r.status === "hidden" ? "eye" : "eyeoff"))}</button>
              <button type="button" class="icon-btn danger" data-act="delete" aria-label="ลบ" title="ลบ">${raw(icon("trash"))}</button>`)
          : ""}
      </div>`));
    page.innerHTML = html`<p class="muted">คำถามที่ AI ต้องคิดคำตอบเอง จะถูกเก็บไว้ที่นี่ เมื่อมีคนถามซ้ำ (2 ครั้งขึ้นไป) น้องปลาทูจะตอบจากคำตอบนี้ทันทีโดยไม่ใช้ AI
        ตรวจคำตอบแล้วกด “อนุมัติ” เพื่อใช้ตอบเสมอ แก้คำตอบให้ถูกต้องได้ หรือ “ซ่อน” คำตอบที่ไม่ควรใช้ (ไม่เก็บคำถามที่มีเบอร์โทร อีเมล ข่าววันนี้ หรือเรื่องส่วนตัว)</p>
      <div class="toolbar">${raw(tab("all", "ทั้งหมด", list.length))}${raw(tab("use", "ใช้งานอยู่", count("use")))}${raw(tab("wait", "รอคนถามซ้ำ", count("wait")))}${raw(tab("approved", "อนุมัติแล้ว", count("approved")))}${raw(tab("hidden", "ซ่อน", count("hidden")))}</div>
      ${rows.length ? raw(html`<div class="rows">${rows}</div>`) : raw('<p class="empty">ยังไม่มีคำถามในหมวดนี้ — เมื่อมีคนถามน้องปลาทูเรื่องที่ยังไม่มีคำตอบสำเร็จรูป จะขึ้นที่นี่</p>')}`;
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

  page.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) {
      filter = f.dataset.filter;
      return draw();
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const r = list.find((x) => x.id === b.closest(".row")?.dataset.id);
    if (!r) return;
    if (b.dataset.act === "approve") return save({ id: r.id, status: "approved" }, "อนุมัติแล้ว — ใช้ตอบคำถามนี้เสมอ");
    if (b.dataset.act === "hide") return save({ id: r.id, status: "hidden" }, "ซ่อนแล้ว — ไม่ใช้ตอบอีก");
    if (b.dataset.act === "show") return save({ id: r.id, status: "new" }, "เลิกซ่อนแล้ว");
    if (b.dataset.act === "edit")
      return openDialog({
        title: "แก้คำตอบ",
        confirmLabel: "บันทึกและอนุมัติ",
        body: html`<p><strong>${r.question}</strong></p>${raw(field({ label: "คำตอบ", name: "answer", value: r.answer, rows: 8 }))}`,
        onConfirm: async (root) => {
          const { answer } = readForm(root, ["answer"]);
          if (!answer.trim()) return false;
          await save({ id: r.id, answer: answer.trim() }, "บันทึกคำตอบแล้ว");
        },
      });
    if (b.dataset.act === "delete") {
      if (!(await confirmDialog(`ลบคำถาม “${r.question}”?`, "ถ้ามีคนถามอีก น้องปลาทูจะให้ AI คิดคำตอบใหม่"))) return;
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
