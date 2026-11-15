// /admin/learned — what Nong Platoo learned from real questions (server/chatLearning.js).
// Nothing here is given to visitors until an admin approves it.
// Each new answer was checked by asking the AI a second time:
//   ✓ ตรงกัน     both answers named the same buildings, floors and numbers
//   ⚠ ไม่ตรงกัน  they differ — the AI is unsure; check or fix before approving
//   … ยังไม่ได้ตรวจ the second check could not run (AI busy); judge it yourself

import { apiGet, apiPost } from "../api.js";
import { confirmDialog, field, html, icon, openDialog, raw, readForm, toast, toastError } from "./ui.js";

const STATUS = {
  new: { label: "รออนุมัติ", cls: "grey" },
  approved: { label: "อนุมัติแล้ว · ใช้ตอบอยู่", cls: "" },
  hidden: { label: "ซ่อน", cls: "grey" },
};
const CHECK = {
  agree: { label: "✓ AI ตอบตรงกัน 2 ครั้ง", cls: "" },
  mismatch: { label: "⚠ AI ตอบไม่ตรงกัน — ตรวจก่อน", cls: "danger" },
  pending: { label: "… ยังไม่ได้ตรวจซ้ำ", cls: "grey" },
};

export async function render(page, { canEdit }) {
  let list = [];
  let filter = "new";

  const draw = async () => {
    list = await apiGet("admin/learned/list");
    const inTab = (r, f) => f === "all" || (f === "mismatch" ? r.status === "new" && r.verified === "mismatch" : r.status === f);
    const shown = list.filter((r) => inTab(r, filter));
    const count = (f) => list.filter((r) => inTab(r, f)).length;
    const agreed = list.filter((r) => r.status === "new" && r.verified === "agree").length;
    const tab = (id, label) => html`<button type="button" class="btn ${filter === id ? "" : "outline"}" data-filter="${id}">${label} (${count(id)})</button>`;
    const rows = shown.map((r) =>
      raw(html`<div class="row" data-id="${r.id}">
        <div class="grow">
          <strong>${r.question}</strong>
          <span class="pill">ถาม ${r.askCount} ครั้ง</span>
          ${r.lang === "en" ? raw('<span class="pill">English</span>') : ""}
          <span class="pill ${STATUS[r.status]?.cls ?? ""}">${STATUS[r.status]?.label ?? r.status}</span>
          ${r.status === "new" ? raw(html`<span class="pill ${CHECK[r.verified]?.cls ?? "grey"}">${CHECK[r.verified]?.label ?? r.verified}</span>`) : ""}
          <small>${r.answer.length > 260 ? `${r.answer.slice(0, 260)}…` : r.answer}</small>
        </div>
        ${canEdit
          ? raw(html`${r.status !== "approved" ? raw(html`<button type="button" class="icon-btn" data-act="approve" aria-label="อนุมัติ" title="อนุมัติ (ใช้ตอบคนที่ถามแบบนี้)">${raw(icon("shieldok"))}</button>`) : ""}
              <button type="button" class="icon-btn" data-act="edit" aria-label="แก้คำตอบ" title="แก้คำตอบแล้วอนุมัติ">${raw(icon("pencil"))}</button>
              <button type="button" class="icon-btn" data-act="${r.status === "hidden" ? "show" : "hide"}" aria-label="${r.status === "hidden" ? "เลิกซ่อน" : "ซ่อน"}" title="${r.status === "hidden" ? "เลิกซ่อน" : "ซ่อน (ไม่ใช้ตอบ)"}">${raw(icon(r.status === "hidden" ? "eye" : "eyeoff"))}</button>
              <button type="button" class="icon-btn danger" data-act="delete" aria-label="ลบ" title="ลบ">${raw(icon("trash"))}</button>`)
          : ""}
      </div>`));
    page.innerHTML = html`<p class="muted">คำถามที่ AI ต้องคิดคำตอบเองจะถูกเก็บไว้ที่นี่ <strong>น้องปลาทูจะใช้คำตอบตอบคนอื่นก็ต่อเมื่อแอดมินกดอนุมัติแล้วเท่านั้น</strong>
        ก่อนเก็บ ระบบถาม AI ซ้ำอีกครั้งเพื่อเทียบว่าอาคาร ชั้น และตัวเลขตรงกันไหม ถ้า “ไม่ตรงกัน” แปลว่า AI ไม่แน่ใจ ควรแก้คำตอบหรือซ่อน
        (ไม่เก็บคำถามที่มีเบอร์โทร อีเมล ข่าววันนี้ หรือเรื่องส่วนตัว)</p>
      <div class="toolbar">${raw(tab("new", "รออนุมัติ"))}${raw(tab("mismatch", "⚠ ไม่ตรงกัน"))}${raw(tab("approved", "อนุมัติแล้ว"))}${raw(tab("hidden", "ซ่อน"))}${raw(tab("all", "ทั้งหมด"))}
        ${canEdit && agreed ? raw(html`<button type="button" class="btn" data-act-all="approve-agreed">${raw(icon("shieldok"))} อนุมัติทั้งหมดที่ AI ตอบตรงกัน (${agreed})</button>`) : ""}</div>
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
    if (e.target.closest("[data-act-all]")) {
      const n = list.filter((r) => r.status === "new" && r.verified === "agree").length;
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
    if (b.dataset.act === "approve") {
      if (r.verified === "mismatch" && !(await confirmDialog("AI ตอบคำถามนี้ไม่ตรงกัน 2 ครั้ง", "คำตอบอาจผิด แนะนำให้กด “แก้คำตอบ” ก่อน ยังจะอนุมัติเลยไหม?"))) return;
      return save({ id: r.id, status: "approved" }, "อนุมัติแล้ว — ใช้ตอบคำถามนี้แล้ว");
    }
    if (b.dataset.act === "hide") return save({ id: r.id, status: "hidden" }, "ซ่อนแล้ว — ไม่ใช้ตอบ");
    if (b.dataset.act === "show") return save({ id: r.id, status: "new" }, "เลิกซ่อนแล้ว (รออนุมัติ)");
    if (b.dataset.act === "edit")
      return openDialog({
        title: "แก้คำตอบ",
        confirmLabel: "บันทึกและอนุมัติ",
        body: html`<p><strong>${r.question}</strong></p>${raw(field({ label: "คำตอบ", name: "answer", value: r.answer, rows: 8 }))}`,
        onConfirm: async (root) => {
          const { answer } = readForm(root, ["answer"]);
          if (!answer.trim()) return false;
          await save({ id: r.id, answer: answer.trim() }, "บันทึกและอนุมัติแล้ว");
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
