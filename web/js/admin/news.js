// /admin/news — news cards: add, edit, delete, and pull the latest from the college website.

import { newsInputSchema } from "/shared/adminSchemas.js";
import { apiGet, apiPost } from "../api.js";
import { confirmDialog, field, html, icon, linkColorFields, openDialog, raw, readForm, toast, toastError, validate } from "./ui.js";

const EMPTY = { id: "", tag: "", title: "", excerpt: "", date: "", time: "", accent: "#3c8f8d", link: "", image: "", source: "", published: true, sortOrder: 0 };

export async function render(page, { canEdit }) {
  let list = [];

  const draw = async () => {
    list = await apiGet("admin/news/list");
    const rows = list.map((n) =>
      raw(html`<div class="row" data-id="${n.id}">
        <span class="swatch" style="background:${n.accent}"></span>
        <div class="grow">
          <strong>${n.title}</strong>
          ${!n.published ? raw('<span class="pill grey">ฉบับร่าง</span>') : ""}
          ${n.source ? raw('<span class="pill">จากเว็บวิทยาลัย</span>') : ""}
          <small>${n.tag} · ${n.date}</small>
        </div>
        ${canEdit
          ? raw(html`<button type="button" class="icon-btn" data-act="edit" aria-label="แก้ไข">${raw(icon("pencil"))}</button>
              <button type="button" class="icon-btn danger" data-act="delete" aria-label="ลบ">${raw(icon("trash"))}</button>`)
          : ""}
      </div>`));
    page.innerHTML = html`${canEdit
        ? raw(html`<div class="toolbar">
            <button type="button" class="btn outline" data-act="sync">${raw(icon("refresh"))} ดึงข่าวจากเว็บวิทยาลัย</button>
            <button type="button" class="btn" data-act="create">${raw(icon("plus"))} เพิ่มข่าว</button></div>`)
        : ""}
      ${rows.length ? raw(html`<div class="rows">${rows}</div>`) : raw('<p class="empty">ยังไม่มีข่าว</p>')}`;
  };

  const editNews = (n, isNew) =>
    openDialog({
      title: isNew ? "เพิ่มข่าว" : "แก้ไขข่าว",
      confirmLabel: "บันทึก",
      body: html`<div class="grid2">
          ${raw(field({ label: "รหัส (id)", name: "id", value: n.id, hint: "a-z, 0-9, - — เปลี่ยนภายหลังไม่ได้", placeholder: "open-house-2026", disabled: !isNew }))}
          ${raw(field({ label: "ป้ายกำกับ", name: "tag", value: n.tag }))}
        </div>
        ${raw(field({ label: "หัวข้อ", name: "title", value: n.title }))}
        ${raw(field({ label: "เนื้อหาย่อ", name: "excerpt", value: n.excerpt, rows: 3 }))}
        <div class="grid2">
          ${raw(field({ label: "วันที่ (ข้อความ)", name: "dateLabel", value: n.date, placeholder: "18 ก.ย. 2569" }))}
          ${raw(field({ label: "เวลา / สถานะ", name: "timeLabel", value: n.time, placeholder: "09:00–15:30 น." }))}
        </div>
        ${raw(field({ label: "ลิงก์ข่าว (ไม่บังคับ)", name: "link", value: n.link, hint: "คลิกการ์ดข่าวแล้วเปิดหน้านี้", placeholder: "https://www.sstc.ac.th/news-detail_325_..." }))}
        ${raw(field({ label: "ลิงก์รูปภาพ (ไม่บังคับ)", name: "imageUrl", value: n.image, placeholder: "https://..." }))}
        <div class="grid2">
          ${raw(field({ label: "สีเน้น", name: "accent", value: n.accent, type: "color" }))}
          ${raw(field({ label: "ลำดับการแสดง", name: "sortOrder", value: n.sortOrder, type: "number", attrs: 'min="0"' }))}
        </div>
        ${raw(field({ label: "การเผยแพร่", name: "published", value: n.published, type: "checkbox", placeholder: "เผยแพร่บนหน้าเว็บ (ไม่ติ๊ก = เก็บเป็นฉบับร่าง)" }))}`,
      onOpen: linkColorFields,
      onConfirm: async (root) => {
        const values = readForm(root, ["id", "tag", "title", "excerpt", "dateLabel", "timeLabel", "link", "imageUrl", "accent", "sortOrder", "published"]);
        const input = validate(newsInputSchema, { ...values, id: values.id.trim(), source: n.source ?? "" });
        if (!input) return false;
        await apiPost("admin/news/save", input);
        toast("บันทึกข่าวแล้ว");
        await draw();
      },
    });

  page.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.closest(".row")?.dataset.id;
    const n = list.find((x) => x.id === id);
    if (b.dataset.act === "create") return editNews({ ...EMPTY, sortOrder: list.length }, true);
    if (b.dataset.act === "edit" && n) return editNews(n, false);
    if (b.dataset.act === "delete" && n) {
      if (!(await confirmDialog(`ลบข่าว “${n.title}”?`, "การลบไม่สามารถย้อนกลับได้"))) return;
      try {
        await apiPost("admin/news/delete", { id: n.id });
        toast("ลบข่าวแล้ว");
        await draw();
      } catch (error) {
        toastError(error);
      }
    }
    if (b.dataset.act === "sync") {
      b.disabled = true;
      b.innerHTML = `${icon("refresh", "spin")} กำลังดึง…`;
      try {
        const res = await apiPost("admin/news/syncFromWebsite");
        toast(`ดึงข่าวจากเว็บวิทยาลัยแล้ว ${res.imported} รายการ`);
        await draw();
      } catch (error) {
        toastError(error);
        b.disabled = false;
        b.innerHTML = `${icon("refresh")} ดึงข่าวจากเว็บวิทยาลัย`;
      }
    }
  });

  await draw();
}
