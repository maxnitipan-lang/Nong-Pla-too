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
    ${raw(stat({ iconName: "users", label: "บัญชีเจ้าหน้าที่", value: data.userCount, hint: `เป็นผู้ดูแล ${data.adminCount} คน · ไม่นับบัญชีหลัก`, href: "/admin/users" }))}
    ${raw(stat({ iconName: "pin", label: "แผนที่", value: data.mapConfigured ? "Google My Maps" : "แผนที่ของเว็บ", hint: data.mapConfigured ? "ใช้แผนที่ที่ฝังจาก Google" : "ใช้แผนที่ 2D/3D ที่วาดไว้ (ปกติ)", href: "/admin/settings" }))}
    ${raw(stat({ iconName: "shieldok", label: "ฐานข้อมูล", value: data.databaseConfigured ? "พร้อมใช้งาน" : "ยังไม่เชื่อมต่อ", hint: data.databaseConfigured ? "บันทึกข้อมูลได้" : "โหมดอ่านอย่างเดียว", href: "/admin/settings" }))}
  </div>
  ${raw(aiUsageCard(data.aiUsage ?? []))}`;
}

/** AI use in the last 7 days: calls, answers, "busy" (out of free quota), average time. */
function aiUsageCard(days) {
  const sum = (key) => days.reduce((n, d) => n + d[key], 0);
  const today = days[0];
  const rows = days
    .map((d) => html`<tr><td>${d.day}</td><td>${d.calls}</td><td>${d.answered}</td><td>${d.busy}</td><td>${d.failed}</td><td>${d.cacheHits}</td><td>${d.liked ?? 0} / ${d.disliked ?? 0}</td><td>${d.avgMs ? (d.avgMs / 1000).toFixed(1) + " วิ" : "-"}</td></tr>`)
    .join("");
  return html`<section class="card" style="margin-top:16px">
    <h3 class="ai-usage-title">${raw(icon("wand"))} การใช้งาน AI (7 วันล่าสุด)</h3>
    ${days.length
      ? raw(html`<p class="muted">วันนี้เรียก AI ${today.calls} ครั้ง · ไม่ว่าง/เกินโควตา ${today.busy} ครั้ง · ตอบจากคำตอบที่เก็บไว้ ${today.cacheHits} ครั้ง · 👍 ${today.liked ?? 0} · 👎 ${today.disliked ?? 0}
          — รวม 7 วัน: ไม่ว่าง ${sum("busy")} จาก ${sum("calls")} ครั้ง</p>
        <div style="overflow-x:auto"><table class="ai-usage">
          <thead><tr><th>วันที่</th><th>เรียก AI</th><th>ตอบได้</th><th title="Gemini ตอบไม่ทันหรือโควตาวันนี้เต็ม">ไม่ว่าง / เกินโควตา</th><th>ผิดพลาด</th><th>ตอบจากที่เก็บไว้</th><th>👍 / 👎</th><th>เวลาเฉลี่ย</th></tr></thead>
          <tbody>${raw(rows)}</tbody></table></div>`)
      : "ยังไม่มีข้อมูล — จะเริ่มนับเมื่อมีคนถามคำถามที่ต้องใช้ AI"}
  </section>`;
}
