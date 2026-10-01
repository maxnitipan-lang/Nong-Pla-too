// Pull the latest college news into the database from THIS computer.
//
//   pnpm news:sync
//
// The college website blocks requests from cloud servers (Render gets HTTP 403
// from Cloudflare), but works from normal internet connections. Run this on a
// computer in the college (or at home) whose .env DATABASE_URL points at the
// production database, and the website shows the new items right away.

import "dotenv/config";
import { syncCollegeNews } from "../server/newsScraper";

if (!process.env.DATABASE_URL) {
  console.error("ไม่พบ DATABASE_URL ในไฟล์ .env");
  process.exit(1);
}
syncCollegeNews()
  .then(({ imported }) => {
    console.log(`ดึงข่าวสำเร็จ ${imported} รายการ — หน้าเว็บอัปเดตแล้ว`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
