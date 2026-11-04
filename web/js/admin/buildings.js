// /admin/buildings — buildings: add, edit (floors, rooms, location, department logos, photos),
// delete, and import names + coordinates from a Google My Maps CSV / KML export.

import { CAMPUS_CATEGORIES, buildingInputSchema } from "/shared/adminSchemas.js";
import { parseMyMapsCsv, parseMyMapsKml } from "/shared/myMaps.js";
import { apiGet, apiPost } from "../api.js";
import { prepareImage } from "./imageUpload.js";
import { confirmDialog, field, html, icon, linkColorFields, openDialog, raw, readForm, toast, toastError, validate } from "./ui.js";

const DEPARTMENTS_HINT = '[{"id":"auto-1","floor":1,"name":"สาขาวิชาช่างยนต์","code":"AUT","description":"","skills":[],"careers":[],"activities":["เยี่ยมชมโรงฝึก"],"accent":"#e8863f"}]';
const GALLERY_HINT = '[{"id":"lab","url":"https://…/lab.jpg","caption":"ห้องปฏิบัติการ","alt":"ห้องปฏิบัติการ"}]';

const EMPTY = {
  id: "", name: "", shortName: "", category: "สายอุตสาหกรรม", description: "", floors: 1, accent: "#123b52",
  latitude: "", longitude: "", mapX: 50, mapY: 50, mapWidth: 18, mapHeight: 17, sortOrder: 0,
  floorRows: [{ label: "ชั้น 1", rooms: "" }], departmentsJson: "[]", galleryJson: "[]",
};

/** Parse a JSON array field; returns an error message instead of throwing. */
function parseJsonArray(text, label) {
  if (!text.trim()) return { value: [] };
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? { value: parsed } : { error: `${label} ต้องเป็น JSON array [ ... ]` };
  } catch {
    return { error: `${label}: JSON ไม่ถูกต้อง` };
  }
}
const writeJson = (value) => JSON.stringify(value, null, 2);

function toForm(b, index) {
  return {
    id: b.id, name: b.name, shortName: b.shortName, category: b.category, description: b.description, floors: b.floors,
    accent: b.accent, latitude: b.latitude ?? "", longitude: b.longitude ?? "", mapX: b.x, mapY: b.y, mapWidth: b.width,
    mapHeight: b.height, sortOrder: index,
    floorRows: (b.floorsDetail.length ? b.floorsDetail : [{ level: 1, label: "ชั้น 1", rooms: [] }]).map((f) => ({ label: f.label, rooms: f.rooms.join(", ") })),
    departmentsJson: writeJson(b.departments ?? []),
    galleryJson: writeJson(b.gallery ?? []),
  };
}

/** Pick a picture, shrink it in the browser, upload it; resolves to its URL (/api/images/…) or null. */
function pickAndUpload(kind) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const dataUrl = await prepareImage(file, kind);
        const { url } = await apiPost("admin/images/upload", { dataUrl });
        toast("อัปโหลดรูปแล้ว — อย่าลืมกดบันทึก");
        resolve(url);
      } catch (error) {
        toastError(error);
        resolve(null);
      }
    };
    input.click();
  });
}

/* ---------------- the edit dialog */

function editBuilding(start, isNew, canEdit, onSaved) {
  const form = structuredClone(start);
  const sync = (root) => Object.assign(form, readForm(root, ["id", "name", "shortName", "category", "description", "floors", "sortOrder", "accent", "mapX", "mapY", "mapWidth", "mapHeight", "latitude", "longitude", "departmentsJson", "galleryJson"]));

  const floorsHtml = () =>
    form.floorRows
      .map((row, i) =>
        html`<div class="subcard" data-floor="${i}" style="padding:10px">
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <input class="input" data-floor-label value="${row.label}" placeholder="ชั้น ${i + 1}" />
            ${form.floorRows.length > 1 ? raw(html`<button type="button" class="icon-btn danger" data-b="floor-remove" aria-label="ลบชั้น">${raw(icon("trash"))}</button>`) : ""}
          </div>
          <input class="input" data-floor-rooms value="${row.rooms}" placeholder="ห้องเรียน 1, ห้องพักครู, ห้องประชุม" />
        </div>`)
      .join("");

  const imagesHtml = () => {
    const departments = parseJsonArray(form.departmentsJson, "สาขาวิชา");
    const gallery = parseJsonArray(form.galleryJson, "Gallery");
    const logos = departments.error
      ? html`<p class="muted" style="color:var(--danger)">${departments.error} — แก้ในช่อง JSON ด้านล่างก่อน</p>`
      : !departments.value.length
        ? html`<p class="muted">อาคารนี้ยังไม่มีสาขา</p>`
        : departments.value
            .map((d, i) =>
              html`<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                <span class="avatar" style="border-radius:12px;color:#fff;background:${d.accent || "#3c8f8d"};overflow:hidden;position:relative;font-size:10px">
                  ${d.logo ? raw(html`<img src="${d.logo}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />`) : d.code}</span>
                <span style="flex:1;font-size:13px;font-weight:600">${d.name}</span>
                ${canEdit ? raw(html`<button type="button" class="btn outline small" data-b="logo" data-index="${i}">${raw(icon("upload"))} ${d.logo ? "เปลี่ยน" : "ใส่โลโก้"}</button>`) : ""}
                ${canEdit && d.logo ? raw(html`<button type="button" class="btn outline small" data-b="logo-remove" data-index="${i}">ลบ</button>`) : ""}
              </div>`)
            .join("");
    const photos = gallery.error
      ? html`<p class="muted" style="color:var(--danger)">${gallery.error} — แก้ในช่อง JSON ด้านล่างก่อน</p>`
      : html`<div class="img-grid">${gallery.value.map((g) =>
          raw(html`<figure><img src="${g.url}" alt="${g.alt ?? ""}" />${canEdit ? raw(html`<button type="button" data-b="photo-remove" data-id="${g.id}" aria-label="ลบรูปนี้">${raw(icon("trash"))}</button>`) : ""}</figure>`))}
          ${canEdit ? raw(html`<button type="button" class="btn outline small" data-b="photo-add">${raw(icon("upload"))} เพิ่มรูปอาคาร</button>`) : ""}</div>`;
    return html`<p class="muted" style="margin:0 0 10px;font-size:12px">เลือกรูปจากเครื่องได้เลย ระบบย่อรูปให้อัตโนมัติ — เสร็จแล้วกด “บันทึก” ด้านล่าง</p>
      <p style="margin:0 0 8px;font-size:12px;font-weight:700">โลโก้สาขา (แสดงบนหมุดแผนที่และการ์ดสาขา)</p>${raw(logos)}
      <p style="margin:14px 0 8px;font-size:12px;font-weight:700">รูปอาคาร</p>${raw(photos)}`;
  };

  const body = html`<div class="grid2">
      ${raw(field({ label: "รหัส (id)", name: "id", value: form.id, hint: "ใช้ a-z, 0-9, - เท่านั้น — เปลี่ยนภายหลังไม่ได้", placeholder: "library", disabled: !isNew }))}
      ${raw(field({ label: "ประเภท", name: "category", value: form.category, options: CAMPUS_CATEGORIES }))}
      ${raw(field({ label: "ชื่ออาคาร", name: "name", value: form.name }))}
      ${raw(field({ label: "ชื่อย่อ", name: "shortName", value: form.shortName }))}
    </div>
    ${raw(field({ label: "คำอธิบาย", name: "description", value: form.description, rows: 3 }))}
    <div class="grid3" style="grid-template-columns:repeat(3,1fr)">
      ${raw(field({ label: "จำนวนชั้น", name: "floors", value: form.floors, type: "number", attrs: 'min="1"' }))}
      ${raw(field({ label: "ลำดับการแสดง", name: "sortOrder", value: form.sortOrder, type: "number", attrs: 'min="0"' }))}
      ${raw(field({ label: "สีหมุด", name: "accent", value: form.accent, type: "color" }))}
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;font-weight:700">รายละเอียดแต่ละชั้น</span>
        <button type="button" class="btn outline small" data-b="floor-add">+ เพิ่มชั้น</button></div>
      <div class="rows" data-part="floors">${raw(floorsHtml())}</div>
    </div>
    <details class="subcard"><summary style="cursor:pointer;font-size:12px;font-weight:700">ตำแหน่งบนแผนที่วาด + พิกัดจริง (ไม่บังคับ)</summary>
      <div class="grid2" style="margin-top:12px">
        ${raw(field({ label: "ตำแหน่ง X (%)", name: "mapX", value: form.mapX, type: "number", attrs: 'step="any"' }))}
        ${raw(field({ label: "ตำแหน่ง Y (%)", name: "mapY", value: form.mapY, type: "number", attrs: 'step="any"' }))}
        ${raw(field({ label: "กว้าง (%)", name: "mapWidth", value: form.mapWidth, type: "number", attrs: 'step="any"' }))}
        ${raw(field({ label: "สูง (%)", name: "mapHeight", value: form.mapHeight, type: "number", attrs: 'step="any"' }))}
        ${raw(field({ label: "ละติจูด", name: "latitude", value: form.latitude }))}
        ${raw(field({ label: "ลองจิจูด", name: "longitude", value: form.longitude }))}
      </div></details>
    <div class="subcard"><h3>รูปภาพ</h3><div data-part="images">${raw(imagesHtml())}</div></div>
    <details class="subcard"><summary style="cursor:pointer;font-size:12px;font-weight:700">สาขาวิชา + Gallery ของอาคาร (หน้าตู้ Kiosk · JSON)</summary>
      <div class="stack" style="margin-top:12px">
        <label class="field"><span>สาขาวิชาในอาคาร</span><textarea name="departmentsJson" rows="8" style="font-family:monospace;font-size:12px">${form.departmentsJson}</textarea>
          <small style="word-break:break-all">ตัวอย่าง: ${DEPARTMENTS_HINT}</small></label>
        <label class="field"><span>Gallery</span><textarea name="galleryJson" rows="5" style="font-family:monospace;font-size:12px">${form.galleryJson}</textarea>
          <small style="word-break:break-all">ตัวอย่าง: ${GALLERY_HINT}</small></label>
      </div></details>`;

  return openDialog({
    title: isNew ? "เพิ่มอาคาร" : "แก้ไขอาคาร",
    wide: true,
    body,
    onOpen: (root) => {
      linkColorFields(root);
      const redrawFloors = () => (root.querySelector("[data-part=floors]").innerHTML = floorsHtml());
      const redrawImages = () => (root.querySelector("[data-part=images]").innerHTML = imagesHtml());
      const setJson = (name, value) => {
        form[name] = writeJson(value);
        root.querySelector(`[name=${name}]`).value = form[name];
        redrawImages();
      };
      root.addEventListener("input", (e) => {
        const row = e.target.closest("[data-floor]");
        if (row) {
          const i = Number(row.dataset.floor);
          if (e.target.matches("[data-floor-label]")) form.floorRows[i].label = e.target.value;
          if (e.target.matches("[data-floor-rooms]")) form.floorRows[i].rooms = e.target.value;
        }
        if (e.target.name === "departmentsJson" || e.target.name === "galleryJson") {
          form[e.target.name] = e.target.value;
          redrawImages();
        }
      });
      root.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-b]");
        if (!b) return;
        const act = b.dataset.b;
        if (act === "floor-add") {
          form.floorRows.push({ label: `ชั้น ${form.floorRows.length + 1}`, rooms: "" });
          redrawFloors();
        }
        if (act === "floor-remove") {
          form.floorRows.splice(Number(b.closest("[data-floor]").dataset.floor), 1);
          redrawFloors();
        }
        const departments = parseJsonArray(form.departmentsJson, "สาขาวิชา").value ?? [];
        const gallery = parseJsonArray(form.galleryJson, "Gallery").value ?? [];
        if (act === "logo" || act === "logo-remove") {
          const i = Number(b.dataset.index);
          const url = act === "logo" ? await pickAndUpload("logo") : undefined;
          if (act === "logo" && !url) return;
          const { logo: _old, ...rest } = departments[i];
          departments[i] = url ? { ...rest, logo: url } : rest;
          setJson("departmentsJson", departments);
        }
        if (act === "photo-add") {
          const url = await pickAndUpload("photo");
          if (!url) return;
          sync(root);
          setJson("galleryJson", [...gallery, { id: `photo-${Date.now()}`, url, caption: "", alt: form.name || "รูปอาคาร" }]);
        }
        if (act === "photo-remove") setJson("galleryJson", gallery.filter((g) => g.id !== b.dataset.id));
      });
    },
    onConfirm: async (root) => {
      sync(root);
      const departments = parseJsonArray(form.departmentsJson, "สาขาวิชา");
      const gallery = parseJsonArray(form.galleryJson, "Gallery");
      if (departments.error || gallery.error) {
        toast(departments.error ?? gallery.error, "error");
        return false;
      }
      const payload = {
        departments: departments.value,
        gallery: gallery.value,
        id: form.id.trim(), name: form.name, shortName: form.shortName, category: form.category, description: form.description,
        floors: form.floors, latitude: form.latitude, longitude: form.longitude, accent: form.accent,
        mapX: form.mapX, mapY: form.mapY, mapWidth: form.mapWidth, mapHeight: form.mapHeight, sortOrder: form.sortOrder,
        floorDetails: form.floorRows.map((row, i) => ({
          level: i + 1,
          label: row.label.trim() || `ชั้น ${i + 1}`,
          rooms: row.rooms.split(/[,\n]/).map((r) => r.trim()).filter(Boolean),
        })),
      };
      const input = validate(buildingInputSchema, payload);
      if (!input) return false;
      await apiPost("admin/buildings/save", input);
      toast("บันทึกอาคารแล้ว");
      await onSaved();
    },
  });
}

/* ---------------- My Maps import */

function myMapsHtml() {
  return html`<details class="card" style="margin-bottom:16px" data-part="mymaps">
    <summary style="cursor:pointer;font-weight:700;color:var(--ink)">นำเข้าอาคารจาก Google My Maps (CSV / KML)</summary>
    <div class="stack" style="margin-top:14px">
      <p class="help">อัปโหลดไฟล์ CSV หรือ KML ที่ Export จาก Google My Maps ระบบจะอ่านชื่อและพิกัดมาให้ตรวจสอบก่อนบันทึก ส่วนชั้น ห้อง สาขาวิชา และ Gallery จะตั้งเป็นสถานะรอข้อมูลจากแบ็กเอนด์</p>
      <p class="help"><b>ขั้นตอนเตรียมไฟล์:</b> Google My Maps → เมนูเพิ่มเติม → Export to KML/KMZ หรือ Export CSV → นำไฟล์มาอัปโหลดที่นี่ · หมายเหตุ: ไฟล์ KMZ ให้แตกไฟล์เป็น KML ก่อน</p>
      <div><button type="button" class="btn outline" data-act="mymaps-pick">${raw(icon("upload"))} เลือกไฟล์ CSV / KML</button></div>
      <div data-part="mymaps-preview"></div>
      <p class="help">หลังนำเข้าแล้ว แก้ไขจำนวนชั้น ห้อง สาขาวิชา และ Gallery ต่อได้ในรายการอาคารด้านล่าง</p>
    </div></details>`;
}

/* ---------------- page */

export async function render(page, { canEdit }) {
  let list = [];
  let imported = []; // rows read from a My Maps file, waiting for "นำเข้า"
  let importedName = "";

  const previewHtml = () =>
    !imported.length
      ? ""
      : html`<div class="subcard">
          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-bottom:10px">
            <div><strong>ตัวอย่างข้อมูล: ${importedName}</strong><small class="muted" style="display:block">พบ ${imported.length} รายการ · ตรวจสอบชื่อและพิกัดก่อนบันทึก</small></div>
            <div style="display:flex;gap:8px"><button type="button" class="btn outline small" data-act="mymaps-clear">ล้าง</button>
              <button type="button" class="btn small" data-act="mymaps-import">นำเข้า ${imported.length} รายการ</button></div>
          </div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr style="text-align:left;color:var(--muted)"><th>ชื่อ</th><th>Latitude</th><th>Longitude</th><th>ประเภท</th></tr>
            ${imported.map((item) => raw(html`<tr style="border-top:1px solid var(--line)"><td>${item.name}</td><td>${item.latitude.toFixed(6)}</td><td>${item.longitude.toFixed(6)}</td><td>${item.category}</td></tr>`))}
          </table></div></div>`;

  const draw = async () => {
    list = await apiGet("admin/buildings/list");
    const rows = list.map((b) =>
      raw(html`<div class="row" data-id="${b.id}">
        <span class="avatar" style="border-radius:12px;color:#fff;background:${b.accent}">${raw(icon("building"))}</span>
        <div class="grow"><strong>${b.name}</strong><small>${b.category} · ${b.floors} ชั้น · <code>${b.id}</code></small></div>
        ${canEdit
          ? raw(html`<button type="button" class="icon-btn" data-act="edit" aria-label="แก้ไข">${raw(icon("pencil"))}</button>
              <button type="button" class="icon-btn danger" data-act="delete" aria-label="ลบ">${raw(icon("trash"))}</button>`)
          : ""}
      </div>`));
    page.innerHTML = html`${canEdit ? raw(myMapsHtml()) : ""}
      ${canEdit ? raw(html`<div class="toolbar"><button type="button" class="btn" data-act="create">${raw(icon("plus"))} เพิ่มอาคาร</button></div>`) : ""}
      ${rows.length ? raw(html`<div class="rows">${rows}</div>`) : raw('<p class="empty">ยังไม่มีอาคาร</p>')}`;
  };

  const showPreview = () => {
    const box = page.querySelector("[data-part=mymaps-preview]");
    if (box) box.innerHTML = previewHtml();
  };

  page.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.closest(".row")?.dataset.id;
    const index = list.findIndex((x) => x.id === id);
    switch (b.dataset.act) {
      case "create":
        return editBuilding({ ...structuredClone(EMPTY), sortOrder: list.length }, true, canEdit, draw);
      case "edit":
        return index >= 0 && editBuilding(toForm(list[index], index), false, canEdit, draw);
      case "delete": {
        if (index < 0) return;
        if (!(await confirmDialog(`ลบอาคาร “${list[index].name}”?`, "การลบไม่สามารถย้อนกลับได้ ข้อมูลอาคารนี้จะหายไปจากหน้าเว็บทันที"))) return;
        try {
          await apiPost("admin/buildings/delete", { id });
          toast("ลบอาคารแล้ว");
          await draw();
        } catch (error) {
          toastError(error);
        }
        return;
      }
      case "mymaps-pick": {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".csv,.kml,text/csv,application/vnd.google-earth.kml+xml";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const content = await file.text();
          imported = file.name.toLowerCase().endsWith(".kml") ? parseMyMapsKml(content) : parseMyMapsCsv(content);
          importedName = file.name;
          if (!imported.length) toast("ไม่พบรายการที่มีพิกัดในไฟล์นี้", "error");
          else toast(`พบข้อมูล ${imported.length} รายการ กรุณาตรวจสอบก่อนนำเข้า`);
          showPreview();
        };
        input.click();
        return;
      }
      case "mymaps-clear":
        imported = [];
        return showPreview();
      case "mymaps-import":
        b.disabled = true;
        try {
          const result = await apiPost("admin/buildings/import", { items: imported });
          toast(`นำเข้าอาคาร ${result.imported} รายการแล้ว`);
          imported = [];
          await draw();
        } catch (error) {
          toastError(error);
          b.disabled = false;
        }
        return;
    }
  });

  await draw();
}
