// /admin/settings — college name, address, contact, My Maps link, map centre, kiosk location.

import { settingsInputSchema } from "/shared/adminSchemas.js";
import { apiGet, apiPost } from "../api.js";
import { createPointPicker } from "./pointPicker.js";
import { field, html, raw, readForm, toast, toastError, validate } from "./ui.js";

export async function render(page, { canEdit }) {
  const data = await apiGet("admin/settings/get");
  let kiosk = data.kiosk ? { lat: data.kiosk.lat, lng: data.kiosk.lng } : null;

  page.innerHTML = html`<form class="card stack" id="settings-form" novalidate>
    ${raw(field({ label: "ชื่อวิทยาลัย", name: "collegeName", value: data.collegeName, disabled: !canEdit }))}
    ${raw(field({ label: "ที่อยู่", name: "address", value: data.address, rows: 2, disabled: !canEdit }))}
    ${raw(field({ label: "อีเมลติดต่อ", name: "contactEmail", value: data.contactEmail, placeholder: "info@smtc.ac.th", disabled: !canEdit }))}
    ${raw(field({
      label: "ลิงก์ฝัง Google My Maps",
      name: "mapEmbedUrl",
      value: data.mapEmbedUrl,
      rows: 2,
      hint: "Share → Embed → คัดลอกเฉพาะ src ของ <iframe> (ขึ้นต้นด้วย https://www.google.com/maps/d/embed?mid=) — เว้นว่างเพื่อใช้แผนที่วาด",
      disabled: !canEdit,
    }))}
    <div class="grid2">
      ${raw(field({ label: "ละติจูดจุดกึ่งกลาง", name: "mapCenterLat", type: "number", value: data.mapCenter.lat, attrs: 'step="any"', disabled: !canEdit }))}
      ${raw(field({ label: "ลองจิจูดจุดกึ่งกลาง", name: "mapCenterLng", type: "number", value: data.mapCenter.lng, attrs: 'step="any"', disabled: !canEdit }))}
    </div>
    <div class="subcard">
      <h3>ตำแหน่งตู้ประชาสัมพันธ์ (Kiosk)</h3>
      <p class="help">แตะบนแผนที่ตรงจุดที่ตั้งตู้ (ลากหมุดเพื่อปรับ) — เส้นทางที่แสดงบนตู้จะเริ่มจากจุดนี้ และแผนที่บนตู้ขึ้น "คุณอยู่ที่นี่"
        ถ้าไม่ตั้ง ตู้จะใช้ตำแหน่ง GPS ของเครื่องแทน (คอมพิวเตอร์ตั้งโต๊ะมักคลาดเคลื่อนมาก)</p>
      <div class="toolbar" style="justify-content:space-between;align-items:flex-end;margin:12px 0">
        <div class="grow">${raw(field({ label: "ชื่อจุดตั้งตู้", name: "kioskName", value: data.kiosk?.name ?? "ตู้ประชาสัมพันธ์", placeholder: "เช่น ตู้ประชาสัมพันธ์ หน้าอาคารอำนวยการ", disabled: !canEdit }))}</div>
        ${canEdit ? raw('<button type="button" class="btn outline" id="kiosk-clear">ล้างตำแหน่งตู้</button>') : ""}
      </div>
      <div id="kiosk-map"></div>
      <p class="help" id="kiosk-note" style="margin-top:8px"></p>
    </div>
    ${canEdit ? raw('<div style="display:flex;justify-content:flex-end"><button class="btn" type="submit">บันทึกการตั้งค่า</button></div>') : ""}
  </form>`;

  const form = page.querySelector("#settings-form");
  const note = page.querySelector("#kiosk-note");
  const clearBtn = page.querySelector("#kiosk-clear");
  const showKiosk = () => {
    note.innerHTML = html`${kiosk ? `ตำแหน่ง: ${kiosk.lat.toFixed(6)}, ${kiosk.lng.toFixed(6)}` : "ยังไม่ได้ตั้งตำแหน่งตู้"} · เปิดหน้าตู้ที่ <code>/</code> แอปมือถืออยู่ที่ <code>/app</code>`;
    if (clearBtn) clearBtn.hidden = !kiosk;
  };
  const picker = createPointPicker(page.querySelector("#kiosk-map"), {
    value: kiosk,
    disabled: !canEdit,
    onChange: (p) => {
      kiosk = p;
      showKiosk();
    },
  });
  clearBtn?.addEventListener("click", () => {
    kiosk = null;
    picker.setValue(null);
    showKiosk();
  });
  showKiosk();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canEdit) return;
    const values = readForm(form, ["collegeName", "address", "contactEmail", "mapEmbedUrl", "mapCenterLat", "mapCenterLng", "kioskName"]);
    const input = validate(settingsInputSchema, { ...values, kioskLat: kiosk?.lat ?? null, kioskLng: kiosk?.lng ?? null });
    if (!input) return;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "กำลังบันทึก…";
    try {
      await apiPost("admin/settings/update", input);
      toast("บันทึกการตั้งค่าแล้ว");
    } catch (error) {
      toastError(error);
    } finally {
      button.disabled = false;
      button.textContent = "บันทึกการตั้งค่า";
    }
  });

  return () => picker.destroy();
}
