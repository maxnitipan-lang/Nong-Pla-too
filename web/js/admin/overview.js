// /admin — counts of buildings, news and users, and whether the map and database are set up.

import { apiGet } from "../api.js";
import { html, icon, raw } from "./ui.js";

function stat({ iconName, label, value, hint, href }) {
  return html`<a class="stat" href="${href}" data-link>
    <small>${raw(icon(iconName))} ${label}</small>
    <strong>${value}</strong>
    ${hint ? raw(html`<span>${hint}</span>`) : ""}
  </a>`;
}

export async function render(page) {
  const data = await apiGet("admin/overview");
  page.innerHTML = html`<div class="grid3">
    ${raw(stat({ iconName: "building", label: "อาคาร", value: data.buildingCount, hint: "อาคารทั้งหมดในระบบ", href: "/admin/buildings" }))}
    ${raw(stat({ iconName: "news", label: "ข่าวสาร", value: data.newsCount, hint: `เผยแพร่อยู่ ${data.publishedNewsCount} เรื่อง`, href: "/admin/news" }))}
    ${raw(stat({ iconName: "users", label: "ผู้ใช้", value: data.userCount, hint: `ผู้ดูแล ${data.adminCount} คน`, href: "/admin/users" }))}
    ${raw(stat({ iconName: "pin", label: "แผนที่", value: data.mapConfigured ? "เชื่อมต่อแล้ว" : "ยังไม่ตั้งค่า", hint: "Google My Maps embed", href: "/admin/settings" }))}
    ${raw(stat({ iconName: "shieldok", label: "ฐานข้อมูล", value: data.databaseConfigured ? "พร้อมใช้งาน" : "ยังไม่เชื่อมต่อ", hint: data.databaseConfigured ? "บันทึกข้อมูลได้" : "โหมดอ่านอย่างเดียว", href: "/admin/settings" }))}
  </div>`;
}
