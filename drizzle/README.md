# drizzle — โครงสร้างฐานข้อมูล

| ไฟล์ | ใช้ทำอะไร |
| --- | --- |
| `schema.ts` | ตารางทั้งหมด: `users`, `campus_buildings`, `campus_news`, `site_settings`, `walk_networks` |
| `0000_*.sql` – `0007_*.sql` | ประวัติการเปลี่ยนตาราง (migration) เรียงตามลำดับ ห้ามแก้ไฟล์เก่า |
| `meta/` | ข้อมูลที่ drizzle ใช้ติดตาม migration |

เปลี่ยนตาราง: แก้ `schema.ts` แล้วรัน `npm run db:push`
