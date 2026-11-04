// /admin/users — staff accounts (username + password) and their roles. Admins only.

import { newAdminAccountSchema } from "/shared/adminSchemas.js";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES, USER_ROLES } from "/shared/roles.js";
import { apiGet, apiPost } from "../api.js";
import { confirmDialog, field, html, icon, openDialog, raw, readForm, toast, toastError, validate } from "./ui.js";

/** Readable random password (no look-alike characters). */
function randomPassword(length = 12) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

/** Password box (hidden by default so a screenshot doesn't leak it) + random + copy. */
function passwordFieldHtml(value) {
  return html`<div>
    <div style="display:flex;align-items:flex-end;gap:8px">
      <label class="field" style="flex:1"><span>รหัสผ่าน (อย่างน้อย 8 ตัว)</span>
        <div style="position:relative"><input type="password" name="password" value="${value}" autocomplete="new-password" style="padding-right:40px" />
          <button type="button" class="icon-btn" data-pw="toggle" aria-label="แสดงรหัสผ่าน" style="position:absolute;right:2px;top:2px">${raw(icon("eye"))}</button></div>
      </label>
      <button type="button" class="btn outline" data-pw="random">${raw(icon("wand"))} สุ่ม</button>
      <button type="button" class="btn outline" data-pw="copy" aria-label="คัดลอกรหัสผ่าน">${raw(icon("copy"))}</button>
    </div>
    <small class="muted" style="font-size:11px">ระบบเก็บรหัสแบบเข้ารหัส ดูย้อนหลังไม่ได้ — คัดลอกส่งให้เจ้าของบัญชีทางช่องทางส่วนตัวก่อนกดบันทึก</small>
  </div>`;
}

function wirePasswordField(root) {
  const input = root.querySelector("[name=password]");
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pw]");
    if (!b) return;
    if (b.dataset.pw === "toggle") {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      b.innerHTML = icon(show ? "eyeoff" : "eye");
      b.setAttribute("aria-label", show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน");
    }
    if (b.dataset.pw === "random") input.value = randomPassword();
    if (b.dataset.pw === "copy" && input.value) void navigator.clipboard?.writeText(input.value).then(() => toast("คัดลอกรหัสผ่านแล้ว"));
  });
}

export async function render(page, { user }) {
  const draw = async () => {
    const list = await apiGet("admin/users/list");
    const rows = list.map((u) => {
      const isSelf = u.openId === user.openId;
      const label = u.name ?? u.username ?? u.email ?? u.openId;
      return raw(html`<div class="row" data-open-id="${u.openId}" data-label="${label}">
        <span class="avatar">${label.charAt(0).toUpperCase()}</span>
        <div class="grow">
          <strong>${u.name ?? "(ไม่มีชื่อ)"}</strong> ${isSelf ? raw('<span class="muted">· คุณ</span>') : ""}
          ${u.username ? raw(html`<span class="pill blue">ชื่อผู้ใช้: ${u.username}</span>`) : ""}
          <small>${u.username ? "เข้าสู่ระบบด้วยรหัสผ่าน" : u.email ?? u.openId} · เข้าสู่ระบบล่าสุด ${new Date(u.lastSignedIn).toLocaleDateString("th-TH")}</small>
        </div>
        <select class="input" style="width:150px" data-role ${isSelf ? "disabled" : ""}>
          ${[...USER_ROLES].reverse().map((r) => raw(html`<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`))}
        </select>
        ${u.username ? raw(html`<button type="button" class="icon-btn" data-act="password" aria-label="เปลี่ยนรหัสผ่าน" title="เปลี่ยนรหัสผ่าน">${raw(icon("key"))}</button>`) : ""}
        ${!isSelf ? raw(html`<button type="button" class="icon-btn danger" data-act="delete" aria-label="ลบบัญชี" title="ลบบัญชี">${raw(icon("trash"))}</button>`) : ""}
      </div>`);
    });
    page.innerHTML = html`<div class="toolbar" style="justify-content:space-between">
        <p class="help">เพิ่มคนเข้าส่วนผู้ดูแลเป็นรายคน (ชื่อผู้ใช้ + รหัสผ่าน) และกำหนดสิทธิ์: <b>ผู้ดูแล</b> — ทำได้ทุกอย่างรวมถึงจัดการผู้ใช้ ·
          <b>ผู้แก้ไข</b> — แก้อาคาร ทางเดิน ข่าว ตั้งค่า · <b>ดูอย่างเดียว</b> — เปิดดูได้ แก้ไม่ได้
          · บัญชีหลักใน .env (ADMIN_USERNAME / ADMIN_PASSWORD) ไม่แสดงในรายการนี้</p>
        <button type="button" class="btn" data-act="create">${raw(icon("userplus"))} เพิ่มผู้ใช้</button>
      </div>
      ${rows.length ? raw(html`<div class="rows">${rows}</div>`) : raw('<p class="empty">ยังไม่มีผู้ใช้ในฐานข้อมูล</p>')}`;
  };

  const createUser = () =>
    openDialog({
      title: "เพิ่มผู้ใช้ส่วนผู้ดูแล",
      description: "เข้าสู่ระบบที่ /admin ด้วยชื่อผู้ใช้และรหัสผ่านนี้ ได้สิทธิ์ตามที่เลือกด้านล่าง",
      confirmLabel: "เพิ่มผู้ใช้",
      body:
        field({ label: "ชื่อผู้ใช้ (ใช้ตอนเข้าสู่ระบบ)", name: "username", hint: "a-z, 0-9, . _ - เช่น somchai", placeholder: "somchai", attrs: 'autocapitalize="none"' }) +
        field({ label: "ชื่อที่แสดง", name: "name", placeholder: "เช่น ครูสมชาย งานประชาสัมพันธ์" }) +
        passwordFieldHtml(randomPassword()) +
        html`<div><p style="margin:0 0 8px;font-size:12px;font-weight:700">สิทธิ์</p><div class="rows">${STAFF_ROLES.map((r) =>
          raw(html`<label class="radio-card ${r === "editor" ? "on" : ""}"><input type="radio" name="role" value="${r}" ${r === "editor" ? "checked" : ""} />
            <span><strong>${ROLE_LABELS[r]}</strong><small>${ROLE_DESCRIPTIONS[r]}</small></span></label>`))}</div></div>`,
      onOpen: (root) => {
        wirePasswordField(root);
        root.addEventListener("change", (e) => {
          if (e.target.name !== "role") return;
          for (const card of root.querySelectorAll(".radio-card")) card.classList.toggle("on", card.querySelector("input").checked);
        });
      },
      onConfirm: async (root) => {
        const values = readForm(root, ["username", "name", "password"]);
        values.role = root.querySelector("[name=role]:checked")?.value ?? "editor";
        const input = validate(newAdminAccountSchema, values);
        if (!input) return false;
        await apiPost("admin/users/create", input);
        toast(`เพิ่ม "${input.username}" (${ROLE_LABELS[input.role]}) แล้ว`);
        await draw();
      },
    });

  const resetPassword = (openId, label) =>
    openDialog({
      title: `เปลี่ยนรหัสผ่าน · ${label}`,
      description: "เจ้าของบัญชีจะถูกออกจากระบบทุกเครื่อง และต้องใช้รหัสใหม่นี้",
      confirmLabel: "บันทึกรหัสใหม่",
      body: passwordFieldHtml(randomPassword()),
      onOpen: wirePasswordField,
      onConfirm: async (root) => {
        const password = root.querySelector("[name=password]").value;
        if (password.length < 8) {
          toast("รหัสผ่านอย่างน้อย 8 ตัว", "error");
          return false;
        }
        await apiPost("admin/users/resetPassword", { openId, password });
        toast("เปลี่ยนรหัสผ่านแล้ว — เจ้าของบัญชีต้องเข้าสู่ระบบใหม่");
      },
    });

  page.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const row = b.closest(".row");
    if (b.dataset.act === "create") return createUser();
    if (b.dataset.act === "password") return resetPassword(row.dataset.openId, row.dataset.label);
    if (b.dataset.act === "delete") {
      if (!(await confirmDialog(`ลบบัญชี “${row.dataset.label}”?`, "บัญชีนี้จะเข้าหน้าผู้ดูแลไม่ได้อีก การลบย้อนกลับไม่ได้"))) return;
      try {
        await apiPost("admin/users/delete", { openId: row.dataset.openId });
        toast("ลบบัญชีแล้ว");
        await draw();
      } catch (error) {
        toastError(error);
      }
    }
  });
  page.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-role]")) return;
    const row = e.target.closest(".row");
    e.target.disabled = true;
    try {
      await apiPost("admin/users/setRole", { openId: row.dataset.openId, role: e.target.value });
      toast("อัปเดตสิทธิ์แล้ว");
    } catch (error) {
      toastError(error);
    }
    await draw();
  });

  await draw();
}
