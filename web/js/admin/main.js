// Admin panel: login, the frame (menu + header) and switching between pages.
// Pages live in their own files and load when opened:
//   /admin → overview.js   /admin/buildings → buildings.js   /admin/walkways → walkways.js
//   /admin/news → news.js  /admin/users → users.js           /admin/settings → settings.js
// The server checks every permission again; hiding buttons here is only for clarity.

import { ROLE_LABELS, canEdit, canManageUsers, isStaff } from "/shared/roles.js";
import { apiGet, apiPost } from "../api.js";
import { html, icon, raw, toastError } from "./ui.js";

const NAV = [
  { section: "overview", label: "ภาพรวม", path: "/admin", icon: "dashboard", title: "ภาพรวมระบบ" },
  { section: "buildings", label: "อาคาร", path: "/admin/buildings", icon: "building", title: "จัดการอาคาร" },
  { section: "walkways", label: "ทางเดิน (นำทาง)", path: "/admin/walkways", icon: "footprints", title: "ทางเดินสำหรับนำทาง" },
  { section: "news", label: "ข่าวสาร", path: "/admin/news", icon: "news", title: "จัดการข่าวสาร" },
  { section: "users", label: "ผู้ใช้และสิทธิ์", path: "/admin/users", icon: "users", title: "ผู้ใช้และสิทธิ์", adminOnly: true },
  { section: "settings", label: "ตั้งค่าเว็บ", path: "/admin/settings", icon: "settings", title: "ตั้งค่าเว็บ" },
];

const root = document.getElementById("admin-root");
document.documentElement.dataset.theme = localStorage.getItem("theme") === "dark" ? "dark" : "light";

let user = null;
let cleanup = null; // the open page's clean-up (e.g. remove its map)

function sectionFor(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/admin";
  return NAV.find((n) => n.path === path) ?? NAV[0];
}

/* ---------------- login */

async function showLogin() {
  const passwordEnabled = await apiGet("auth/adminLoginEnabled").catch(() => false);
  root.innerHTML = html`<div class="adm-center"><div class="adm-card-center">
    ${raw(icon("shield", "big-icon"))}
    <h1>เข้าสู่ระบบผู้ดูแล</h1>
    ${passwordEnabled
      ? raw(html`<form id="login-form">
          <input class="input" name="username" placeholder="ชื่อผู้ใช้" required autocomplete="username" autocapitalize="none" autofocus />
          <input class="input" name="password" type="password" placeholder="รหัสผ่าน" required autocomplete="current-password" />
          <button class="btn" type="submit">เข้าสู่ระบบ</button>
        </form>`)
      : raw(html`<p>ยังไม่ได้ตั้งรหัสผู้ดูแล — ใส่ <code>ADMIN_USERNAME</code> และ <code>ADMIN_PASSWORD</code> ในการตั้งค่าเซิร์ฟเวอร์ (.env / Render) แล้วรีเฟรชหน้านี้</p>`)}
  </div></div>`;
  const form = document.getElementById("login-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) return;
    button.disabled = true;
    button.textContent = "กำลังเข้าสู่ระบบ…";
    try {
      await apiPost("auth/adminLogin", { username, password });
      await start(); // signed in — load the panel
    } catch (error) {
      toastError(error);
      form.password.value = "";
      button.disabled = false;
      button.textContent = "เข้าสู่ระบบ";
    }
  });
}

function showNoAccess(staff) {
  root.innerHTML = html`<div class="adm-center"><div class="adm-card-center">
    ${raw(icon("shield", "big-icon"))}
    <h1>ไม่มีสิทธิ์เข้าถึง</h1>
    <p>บัญชี <strong>${user.email ?? user.name ?? ""}</strong> ${staff ? "ไม่มีสิทธิ์จัดการผู้ใช้ (เฉพาะผู้ดูแล)" : "ยังไม่ได้รับสิทธิ์เข้าส่วนผู้ดูแล"}</p>
    ${staff ? raw('<a class="btn" href="/admin" data-link>ไปหน้าภาพรวม</a>') : ""}
    <p><a href="/">กลับหน้าแรก</a> · <button type="button" class="icon-btn" data-logout style="display:inline;width:auto;padding:0 6px">ออกจากระบบ</button></p>
  </div></div>`;
}

async function logout() {
  await apiPost("auth/adminLogout").catch(() => undefined);
  await apiPost("auth/logout").catch(() => undefined);
  window.location.href = "/admin";
}

/* ---------------- frame */

function frameHtml(current) {
  const nav = NAV.filter((n) => !n.adminOnly || canManageUsers(user.role));
  return html`<div class="adm">
    <aside class="adm-side">
      <div class="adm-brand"><img src="/mascots/greeting.webp" alt="" /><div><strong>ผู้ดูแลระบบ</strong><small>น้องปลาทู</small></div></div>
      <nav class="adm-nav">${nav.map((n) =>
        raw(html`<a href="${n.path}" data-link class="${n.section === current.section ? "active" : ""}">${raw(icon(n.icon))} ${n.label}</a>`))}</nav>
      <div class="adm-side-foot">
        <a href="/" target="_blank" rel="noreferrer">${raw(icon("external"))} เปิดหน้าเว็บจริง</a>
        <button type="button" data-theme-toggle>${raw(icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon"))} ${document.documentElement.dataset.theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}</button>
        <button type="button" class="logout" data-logout>${raw(icon("logout"))} ออกจากระบบ</button>
      </div>
    </aside>
    <main class="adm-main">
      <header class="adm-head">
        <div>
          <h1>${current.title}</h1>
          <p>เข้าสู่ระบบเป็น ${user.name ?? user.email ?? ""} <span class="pill">${ROLE_LABELS[user.role] ?? user.role}</span></p>
        </div>
        <div class="adm-head-tools"><a class="btn outline small" href="/" target="_blank" rel="noreferrer">${raw(icon("external"))} หน้าเว็บ</a>
          <button type="button" class="btn outline small" data-logout>${raw(icon("logout"))} ออก</button></div>
      </header>
      ${!canEdit(user.role) ? raw('<div class="banner">บัญชีนี้ดูได้อย่างเดียว — ปุ่มแก้ไขถูกซ่อนไว้</div>') : ""}
      <div id="db-banner"></div>
      <div id="page"><p class="muted">กำลังโหลด…</p></div>
    </main>
  </div>`;
}

const PAGES = {
  overview: () => import("./overview.js"),
  buildings: () => import("./buildings.js"),
  walkways: () => import("./walkways.js"),
  news: () => import("./news.js"),
  users: () => import("./users.js"),
  settings: () => import("./settings.js"),
};

async function showPage() {
  const current = sectionFor(location.pathname);
  if (current.adminOnly && !canManageUsers(user.role)) return showNoAccess(true);
  cleanup?.();
  cleanup = null;
  root.innerHTML = frameHtml(current);
  document.title = `${current.title} | ผู้ดูแลระบบ น้องปลาทู`;
  void showDbBanner();
  const page = document.getElementById("page");
  try {
    const mod = await PAGES[current.section]();
    if (sectionFor(location.pathname) !== current) return; // moved on while loading
    cleanup = (await mod.render(page, { user, canEdit: canEdit(user.role), canManageUsers: canManageUsers(user.role) })) ?? null;
  } catch (error) {
    page.innerHTML = html`<div class="empty">โหลดหน้านี้ไม่สำเร็จ — ${error instanceof Error ? error.message : String(error)}</div>`;
  }
}

/** "No database yet" warning (saving won't work until DATABASE_URL is set). */
async function showDbBanner() {
  const data = await apiGet("admin/overview").catch(() => null);
  const box = document.getElementById("db-banner");
  if (!box || !data || data.databaseConfigured) return;
  box.innerHTML = html`<div class="banner">${raw(icon("shield"))}<div><strong>ยังไม่ได้เชื่อมต่อฐานข้อมูล</strong>
    ตอนนี้แสดงข้อมูลตัวอย่างแบบอ่านอย่างเดียว การบันทึกจะยังไม่ทำงานจนกว่าจะตั้งค่า <code>DATABASE_URL</code> แล้วรัน <code>pnpm db:push</code></div></div>`;
}

/* ---------------- navigation */

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-logout]")) {
    event.preventDefault();
    void logout();
    return;
  }
  if (event.target.closest("[data-theme-toggle]")) {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
    // Only the button changes; the page stays as it is (unsaved walkway edits are kept).
    const button = event.target.closest("[data-theme-toggle]");
    button.innerHTML = `${icon(dark ? "sun" : "moon")} ${dark ? "โหมดสว่าง" : "โหมดมืด"}`;
    return;
  }
  const link = event.target.closest("a[data-link]");
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  if (link.pathname !== location.pathname) history.pushState(null, "", link.pathname);
  void showPage();
});
window.addEventListener("popstate", () => user && void showPage());

async function start() {
  user = await apiGet("auth/me").catch(() => null);
  if (!user) return showLogin();
  if (!isStaff(user.role)) return showNoAccess(false);
  await showPage();
}

void start();
