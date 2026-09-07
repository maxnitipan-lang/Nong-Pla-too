# Campus Guide — ขั้นตอนพัฒนาต่อ

## ภาพรวมโครงสร้าง

โปรเจกต์นี้แยกส่วนหลักออกเป็นสองฝั่งอย่างชัดเจน:

- `client/src/` — frontend React + Tailwind สำหรับหน้าแผนที่ หมุด อาคาร รายละเอียดชั้น และข่าวสาร
- `server/` — backend Express + tRPC สำหรับส่งข้อมูลอาคารและข่าวสารให้ frontend
- `drizzle/` — schema และ migration ของฐานข้อมูล MySQL/TiDB
- `shared/campus.ts` — types และ demo data ที่แชร์ระหว่าง frontend/backend

## Step 1: เริ่มต้น frontend

1. แก้ข้อมูลสถานที่ อาคาร และชั้นใน `shared/campus.ts`
2. แก้หน้าจอหลักใน `client/src/pages/Home.tsx`
3. ปรับสี ฟอนต์ และ responsive layout ใน `client/src/index.css`
4. ใช้ `trpc.campus.buildings.useQuery()` และ `trpc.campus.news.useQuery()` เพื่ออ่านข้อมูลจาก backend

ในกรณีที่ฐานข้อมูลยังไม่มีข้อมูล หน้าเว็บจะใช้ demo data ใน `shared/campus.ts` เป็น fallback จึงสามารถ preview หน้าจอได้ทันที

## Step 2: backend และฐานข้อมูล

API ที่มีให้แล้ว:

- `campus.buildings` — คืนรายการอาคารทั้งหมด พร้อม category, จำนวนชั้น และรายละเอียดห้อง
- `campus.news` — คืนข่าวสารที่ `published = 1`

ตารางที่สร้างแล้ว:

- `campus_buildings`
- `campus_news`

สำหรับระบบจัดการหลังบ้านในขั้นถัดไป ให้เพิ่ม `protectedProcedure` หรือ `adminProcedure` ใน `server/routers.ts` แล้วเพิ่ม mutation สำหรับสร้าง/แก้ไข/ลบข้อมูล โดยให้ผู้ดูแลระบบใช้สิทธิ์ `admin`

## Step 3: Google Maps

คอมโพเนนต์ `client/src/components/Map.tsx` รองรับสองโหมด:

1. **Manus Maps proxy** — ใน WebDev preview จะใช้ `VITE_FRONTEND_FORGE_API_KEY` และ `VITE_FRONTEND_FORGE_API_URL` ที่ระบบเตรียมไว้ให้โดยอัตโนมัติ
2. **Google Maps API key แบบ optional** — ถ้านำโปรเจกต์ไป deploy ภายนอกและต้องใช้ Google Maps โดยตรง ให้เพิ่มตัวแปรด้านล่างใน environment ของ frontend:

```bash
VITE_GOOGLE_MAPS_API_KEY=ใส่คีย์ของโปรเจกต์ที่นี่
```

เปิดใช้งาน APIs อย่างน้อย:

- Maps JavaScript API
- Places API (ถ้าต้องการค้นหาสถานที่)
- Geocoding API (ถ้าต้องการแปลงที่อยู่เป็นพิกัด)

ควรจำกัดคีย์ด้วย HTTP referrers ของโดเมนจริงก่อนใช้งาน production ไม่ควร hard-code key ใน source code

ถ้ายังไม่มี key หรือโหลดแผนที่ไม่ได้ ระบบจะแสดง fallback campus map ที่มีหมุดอาคารให้ใช้งานต่อได้ทันที ไม่ทำให้หน้าเว็บว่างหรือพัง

## Step 4: เพิ่ม marker จริงจากฐานข้อมูล

ตอนนี้หมุดถูกวางจากตำแหน่งเชิงภาพ `x/y` ใน `shared/campus.ts` เพื่อทำให้ prototype ใช้งานและปรับ layout ได้ง่าย หากต้องการใช้พิกัดจริง ให้:

1. เพิ่ม `latitude` และ `longitude` ใน type `CampusBuilding`
2. บันทึกพิกัดลงตาราง `campus_buildings`
3. สร้าง `google.maps.marker.AdvancedMarkerElement` ใน callback `onMapReady`
4. เรียก `map.panTo({ lat, lng })` เมื่อผู้ใช้เลือกอาคารจากรายการ

## คำสั่งพัฒนาและตรวจสอบ

```bash
pnpm dev
pnpm check
pnpm test
pnpm build
```

ทุกครั้งที่เปลี่ยน schema ให้ทำตามลำดับ:

```bash
pnpm drizzle-kit generate
# ตรวจไฟล์ SQL ใน drizzle/
# จากนั้น apply migration ผ่านระบบ WebDev
```
