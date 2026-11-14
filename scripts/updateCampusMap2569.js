// Bring the buildings in the database in line with the college's map handout
// "แผนที่วิทยาลัย 8 พ.ย. 69" (building numbers, what is on each floor, new places).
//
//   node scripts/updateCampusMap2569.js            → backup + show what would change
//   node scripts/updateCampusMap2569.js --apply    → backup + write to the database
//
// The backup (scripts/backups/campus-buildings-<time>.json) holds the rows exactly as they were.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db.js";
import { campusBuildings } from "../drizzle/schema.js";
import {
  floors,
  MAP_2569_NEW_PLACES as NEW_PLACES,
  MAP_2569_PDF_PIXEL as PDF_PIXEL,
  MAP_2569_UPDATES as UPDATES,
} from "../shared/data/campusMap2569.js";

const APPLY = process.argv.includes("--apply");
// --only=building-10,canteen → touch just these buildings (leaves admin edits elsewhere alone).
const ONLY = process.argv.find(a => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean) ?? null;

function fitter(rows, key) {
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const r = [0, 0, 0];
  for (const p of rows) {
    const v = [p.px, p.py, 1];
    for (let i = 0; i < 3; i++) {
      r[i] += v[i] * p[key];
      for (let j = 0; j < 3; j++) S[i][j] += v[i] * v[j];
    }
  }
  const M = S.map((row, i) => [...row, r[i]]);
  for (let i = 0; i < 3; i++) {
    let m = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[m][i])) m = k;
    [M[i], M[m]] = [M[m], M[i]];
    for (let k = 0; k < 3; k++)
      if (k !== i) {
        const f = M[k][i] / M[i][i];
        for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
      }
  }
  const c = M.map((row, i) => row[3] / row[i]);
  return ([px, py]) => c[0] * px + c[1] * py + c[2];
}

function departmentsFor(row, list) {
  const old = row.departments ?? [];
  return list.map(([name, floor], i) => {
    const found = old.find(d => d.name === name);
    return found
      ? { ...found, floor }
      : { id: `${row.id}-dept-${Date.now().toString(36)}-${i}`, floor, name, code: String(i + 1).padStart(2, "0"), description: "", skills: [], careers: [], accent: row.accent };
  });
}

const db = await getDb();
if (!db) {
  console.error("ไม่พบ DATABASE_URL ในไฟล์ .env");
  process.exit(1);
}
const rows = await db.select().from(campusBuildings);
const byId = new Map(rows.map(r => [r.id, r]));

// Backup first.
const backupDir = path.join("scripts", "backups");
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `campus-buildings-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(backupFile, JSON.stringify(rows, null, 1));
console.log(`สำรองข้อมูล ${rows.length} อาคารไว้ที่ ${backupFile}`);

const fitRows = Object.entries(PDF_PIXEL)
  .filter(([id]) => byId.has(id))
  .map(([id, [px, py]]) => { const b = byId.get(id); return { px, py, lat: +b.latitude, lng: +b.longitude, x: b.mapX, y: b.mapY }; });
const toLat = fitter(fitRows, "lat"), toLng = fitter(fitRows, "lng"), toX = fitter(fitRows, "x"), toY = fitter(fitRows, "y");

const writes = [];
for (const [id, patch] of Object.entries(UPDATES)) {
  const row = byId.get(id);
  if (!row) {
    console.warn(`! ไม่พบอาคาร ${id} — ข้าม`);
    continue;
  }
  const next = { ...row };
  if (patch.name) next.name = patch.name;
  if (patch.shortName) next.shortName = patch.shortName;
  if (patch.category) next.category = patch.category;
  if (patch.description) next.description = patch.description;
  if (patch.floors) next.floors = patch.floors;
  if (patch.floorsDetail) next.floorDetails = patch.floorsDetail;
  if (patch.departments) next.departments = departmentsFor(row, patch.departments);
  if (patch.latLng) [next.latitude, next.longitude] = patch.latLng;
  if (patch.pdfPixel) {
    next.latitude = toLat(patch.pdfPixel).toFixed(10);
    next.longitude = toLng(patch.pdfPixel).toFixed(10);
  }
  writes.push({ kind: "แก้", row: next, before: row });
}

const maxSort = Math.max(0, ...rows.map(r => r.sortOrder ?? 0));
NEW_PLACES.forEach((p, i) => {
  if (byId.has(p.id)) {
    console.log(`= ${p.id} มีอยู่แล้ว — ข้าม`);
    return;
  }
  const sameCategory = rows.find(r => r.category === p.category);
  writes.push({
    kind: "เพิ่ม",
    row: {
      id: p.id, name: p.name, shortName: p.shortName, category: p.category, description: p.description, floors: 1,
      latitude: toLat(p.pdfPixel).toFixed(10), longitude: toLng(p.pdfPixel).toFixed(10),
      floorDetails: floors([1, p.shortName, p.rooms]), departments: [], gallery: [],
      accent: sameCategory?.accent ?? "#123b52",
      mapX: Math.round(Math.min(98, Math.max(2, toX(p.pdfPixel)))), mapY: Math.round(Math.min(98, Math.max(2, toY(p.pdfPixel)))),
      mapWidth: 6, mapHeight: 6, sortOrder: maxSort + 10 * (i + 1),
    },
  });
});

if (ONLY) writes.splice(0, writes.length, ...writes.filter(w => ONLY.includes(w.row.id)));

for (const w of writes) {
  const b = w.row;
  console.log(`\n[${w.kind}] ${b.id}: ${w.before && w.before.name !== b.name ? `${w.before.name} → ` : ""}${b.name}`);
  console.log(`   ${b.description}`);
  for (const f of b.floorDetails) console.log(`   ${f.label}: ${f.rooms.join(", ")}`);
  if (b.departments?.length) console.log(`   สาขา/หน่วยงาน: ${b.departments.map(d => `${d.name} (ชั้น ${d.floor})`).join(", ")}`);
  if (w.before && (w.before.latitude !== b.latitude)) console.log(`   ย้ายจุด: ${w.before.latitude},${w.before.longitude} → ${b.latitude},${b.longitude}`);
  if (!w.before) console.log(`   จุด: ${b.latitude},${b.longitude}`);
}

if (!APPLY) {
  console.log(`\nยังไม่ได้เขียนลงฐานข้อมูล (${writes.length} รายการ) — รันซ้ำพร้อม --apply เพื่อบันทึก`);
  process.exit(0);
}
for (const { row, before } of writes) {
  const { id, ...set } = row;
  if (before) await db.update(campusBuildings).set(set).where(eq(campusBuildings.id, id));
  else await db.insert(campusBuildings).values(row);
}
console.log(`\nบันทึกแล้ว ${writes.length} รายการ`);
process.exit(0);
