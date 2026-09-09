// Seed the database with the demo content from `shared/campus.ts`.
//
//   pnpm db:seed
//
// Safe to re-run: every row is upserted by id. After seeding, the site and the
// admin panel read from the database instead of the built-in demo data.

import "dotenv/config";
import { CAMPUS_BUILDINGS, CAMPUS_NEWS, CAMPUS_SETTINGS_DEFAULTS } from "@shared/campus";
import {
  getDb,
  updateCampusSettings,
  upsertCampusBuilding,
  upsertCampusNews,
} from "./db";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error(
      "ไม่พบการเชื่อมต่อฐานข้อมูล — ตั้งค่า DATABASE_URL ใน .env แล้วรัน `pnpm db:push` ก่อน",
    );
    process.exit(1);
  }

  console.log("Seeding campus_buildings…");
  for (let index = 0; index < CAMPUS_BUILDINGS.length; index++) {
    const b = CAMPUS_BUILDINGS[index]!;
    await upsertCampusBuilding({
      id: b.id,
      name: b.name,
      shortName: b.shortName,
      category: b.category,
      description: b.description,
      floors: b.floors,
      latitude: b.latitude ?? "",
      longitude: b.longitude ?? "",
      accent: b.accent,
      mapX: b.x,
      mapY: b.y,
      mapWidth: b.width,
      mapHeight: b.height,
      sortOrder: index,
      floorDetails: b.floorsDetail,
    });
    console.log(`  ✓ ${b.id}`);
  }

  console.log("Seeding campus_news…");
  for (let index = 0; index < CAMPUS_NEWS.length; index++) {
    const n = CAMPUS_NEWS[index]!;
    await upsertCampusNews({
      id: n.id,
      tag: n.tag,
      title: n.title,
      excerpt: n.excerpt,
      dateLabel: n.date,
      timeLabel: n.time,
      accent: n.accent,
      link: n.link,
      imageUrl: n.image,
      source: n.source,
      published: true,
      sortOrder: index,
    });
    console.log(`  ✓ ${n.id}`);
  }

  console.log("Seeding site_settings…");
  await updateCampusSettings({
    collegeName: CAMPUS_SETTINGS_DEFAULTS.collegeName,
    address: CAMPUS_SETTINGS_DEFAULTS.address,
    contactEmail: CAMPUS_SETTINGS_DEFAULTS.contactEmail,
    mapEmbedUrl: process.env.VITE_MYMAPS_EMBED_URL ?? "",
    mapCenterLat: CAMPUS_SETTINGS_DEFAULTS.mapCenter.lat,
    mapCenterLng: CAMPUS_SETTINGS_DEFAULTS.mapCenter.lng,
  });
  console.log("  ✓ settings");

  console.log("\nเสร็จสิ้น — ฐานข้อมูลพร้อมใช้งาน");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
