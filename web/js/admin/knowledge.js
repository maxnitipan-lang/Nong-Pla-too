// /admin/knowledge — "ความรู้ของ AI": facts teachers give the AI (typed, or read from a PDF and
// checked first). Not shown on the website; the AI uses them to answer questions.

import { apiGet, apiPost } from "../api.js";
import { confirmDialog, field, html, icon, openDialog, raw, readForm, toast, toastError } from "./ui.js";

const CATEGORIES = ["รับสมัคร", "การเรียน", "กิจกรรม", "บริการ", "ทั่วไป"];
const EMPTY = { id: "", title: "", content: "", category: "ทั่วไป", validFrom: "", validUntil: "", enabled: true };
const MAX_PDF_MB = 20;

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const thaiDate = (day) => (day ? new Date(`${day}T00:00:00`).toLocaleDateString("th-TH", { dateStyle: "medium" }) : "");

/** What the AI does with an item today. */
function status(k) {
  if (!k.enabled) return ["ปิดอยู่", "grey"];
  if (k.validFrom && today() < k.validFrom) return [`เริ่มใช้ ${thaiDate(k.validFrom)}`, "grey"];
  if (k.validUntil && today() > k.validUntil) return ["หมดอายุแล้ว", "grey"];
  return ["AI ใช้อยู่", ""];
}

export async function render(page, { canEdit }) {
  let list = [];

  const draw = async () => {
    try {
      list = await apiGet("admin/knowledge/list");
    } catch (error) {
      page.innerHTML = html`<div class="empty">${error instanceof Error ? error.message : String(error)}</div>`;
      return;
    }
    const rows = list.map((k) => {
      const [label, tone] = status(k);
      return raw(html`<div class="row" data-id="${k.id}">
        <div class="grow">
          <strong>${k.title}</strong>
          <span class="pill ${tone}">${label}</span>
          <small>${k.category} · ${k.content.length.toLocaleString()} ตัวอักษร${k.validUntil ? ` · ใช้ได้ถึง ${thaiDate(k.validUntil)}` : ""}${k.updatedBy ? ` · แก้ล่าสุดโดย ${k.updatedBy}` : ""}</small>
        </div>
        ${canEdit
          ? raw(html`<button type="button" class="icon-btn" data-act="edit" aria-label="แก้ไข">${raw(icon("pencil"))}</button>
              <button type="button" class="icon-btn danger" data-act="delete" aria-label="ลบ">${raw(icon("trash"))}</button>`)
          : ""}
      </div>`);
    });
    page.innerHTML = html`<p class="help">ข้อมูลในหน้านี้ไม่แสดงบนหน้าเว็บ — เป็นความรู้ให้น้องปลาทูใช้ตอบคำถาม เช่น ประกาศรับสมัคร กำหนดการ ค่าเทอม
        · ใส่ "ใช้ได้ถึง" แล้ว AI จะเลิกใช้เองเมื่อพ้นวันนั้น · แก้แล้ว AI ใช้ข้อมูลใหม่ภายใน 1 นาที</p>
      ${canEdit
        ? raw(html`<div class="toolbar">
            <label class="btn outline" style="cursor:pointer">${raw(icon("upload"))} ให้ AI อ่าน PDF
              <input type="file" accept="application/pdf" data-act="pdf" hidden /></label>
            <button type="button" class="btn" data-act="create">${raw(icon("plus"))} เพิ่มความรู้</button></div>`)
        : ""}
      ${rows.length ? raw(html`<div class="rows">${rows}</div>`) : raw('<p class="empty">ยังไม่มีความรู้ — กด "เพิ่มความรู้" หรือ "ให้ AI อ่าน PDF"</p>')}`;
  };

  const edit = (k, { isNew = false, fromPdf = "" } = {}) =>
    openDialog({
      title: fromPdf ? `ตรวจข้อมูลที่ AI อ่านจาก ${fromPdf}` : isNew ? "เพิ่มความรู้ให้ AI" : "แก้ไขความรู้",
      confirmLabel: "บันทึก",
      body: html`${fromPdf
          ? raw('<div class="banner"><div><strong>ตรวจก่อนบันทึก</strong> AI อาจอ่านตัวเลข วันที่ หรือตารางผิด — เทียบกับ PDF แล้วแก้ให้ถูกก่อนกดบันทึก (ข้อความ [อ่านไม่ชัด] ต้องแก้หรือลบ)</div></div>')
          : ""}
        ${raw(field({ label: "หัวข้อ", name: "title", value: k.title, placeholder: "ประกาศรับสมัครรอบปกติ ปีการศึกษา 2570" }))}
        ${raw(field({ label: "เนื้อหา (ข้อเท็จจริงที่ให้ AI ใช้ตอบ)", name: "content", value: k.content, rows: 14, hint: "เขียนเป็นข้อ ๆ ทีละบรรทัด ใส่ตัวเลข วันที่ เวลา ให้ครบ" }))}
        <div class="grid2">
          ${raw(field({ label: "หมวด", name: "category", value: k.category, options: CATEGORIES }))}
          ${raw(field({ label: "การใช้งาน", name: "enabled", value: k.enabled, type: "checkbox", placeholder: "ให้ AI ใช้ข้อมูลนี้" }))}
        </div>
        <div class="grid2">
          ${raw(field({ label: "เริ่มใช้ (ไม่บังคับ)", name: "validFrom", value: k.validFrom, type: "date" }))}
          ${raw(field({ label: "ใช้ได้ถึง (ไม่บังคับ)", name: "validUntil", value: k.validUntil, type: "date", hint: "พ้นวันนี้แล้ว AI จะไม่ใช้" }))}
        </div>`,
      onConfirm: async (root) => {
        const v = readForm(root, ["title", "content", "category", "enabled", "validFrom", "validUntil"]);
        if (!v.title.trim() || !v.content.trim()) {
          toast("กรอกหัวข้อและเนื้อหาก่อน", "error");
          return false;
        }
        if (v.validFrom && v.validUntil && v.validFrom > v.validUntil) {
          toast("วันเริ่มใช้ต้องไม่หลังวันสิ้นสุด", "error");
          return false;
        }
        try {
          await apiPost("admin/knowledge/save", { ...v, id: k.id });
        } catch (error) {
          toastError(error);
          return false;
        }
        toast("บันทึกแล้ว — AI จะใช้ข้อมูลนี้ภายใน 1 นาที");
        await draw();
      },
    });

  const readPdf = async (input) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_PDF_MB * 1024 * 1024) return toast(`ไฟล์ใหญ่เกิน ${MAX_PDF_MB} MB`, "error");
    const label = input.closest("label");
    const before = label.innerHTML;
    label.classList.add("disabled");
    label.firstChild.replaceWith(document.createRange().createContextualFragment(`${icon("spinner", "spin")} AI กำลังอ่าน PDF… (อาจใช้เวลา 1 นาที)`));
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("อ่านไฟล์ไม่ได้"));
        reader.readAsDataURL(file);
      });
      const draft = await apiPost("admin/knowledge/readPdf", { base64 });
      edit({ ...EMPTY, ...draft, title: draft.title || file.name.replace(/\.pdf$/i, "") }, { isNew: true, fromPdf: file.name });
    } catch (error) {
      toastError(error);
    } finally {
      label.innerHTML = before;
      label.classList.remove("disabled");
    }
  };

  page.addEventListener("change", (e) => {
    if (e.target.matches('[data-act="pdf"]')) void readPdf(e.target);
  });
  page.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const k = list.find((x) => x.id === b.closest(".row")?.dataset.id);
    if (b.dataset.act === "create") return edit({ ...EMPTY }, { isNew: true });
    if (b.dataset.act === "edit" && k) return edit(k);
    if (b.dataset.act === "delete" && k) {
      if (!(await confirmDialog(`ลบ “${k.title}”?`, "AI จะไม่ใช้ข้อมูลนี้อีก และย้อนกลับไม่ได้ (ถ้าแค่อยากหยุดใช้ชั่วคราว ให้แก้ไขแล้วปิด \"ให้ AI ใช้ข้อมูลนี้\")"))) return;
      try {
        await apiPost("admin/knowledge/delete", { id: k.id });
        toast("ลบแล้ว");
        await draw();
      } catch (error) {
        toastError(error);
      }
    }
  });

  await draw();
}
