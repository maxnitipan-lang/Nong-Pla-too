# Frontend Asset Guide — Nong Platoo Ontour Kiosk

รอบนี้จัดโค้ดเป็น **Frontend-only** สำหรับทำหน้าจอ Kiosk และเตรียมช่องใส่ภาพจริงไว้แล้ว โดยไม่ต้องแก้ Backend เพื่อเปลี่ยนภาพหรือตัวละคร

## จุดที่ต้องแก้ไฟล์เดียว

เปิดไฟล์ `client/src/config/kioskAssets.ts` แล้วเปลี่ยน path ใน `KIOSK_ASSETS` และ `DEPARTMENT_LOGOS` ได้ทันที

## ตำแหน่งไฟล์ภาพที่แนะนำ

```text
client/public/images/
├── kiosk/
│   ├── nong-platu-idle.png
│   ├── nong-platu-greeting.png
│   ├── nong-platu-listening.png
│   ├── nong-platu-thinking.png
│   ├── nong-platu-speaking.png
│   ├── campus-welcome.webp
│   └── campus-map-overlay.png
└── departments/
    ├── AUT.png
    ├── DBT.png
    ├── ELEC.png
    ├── MEC.png
    └── ACC.png
```

เมื่อวางไฟล์ไว้ตามนี้ ไม่ต้องแก้ `KioskHome.tsx` ระบบจะอ่านภาพเอง หากไฟล์ยังไม่มี ระบบจะแสดง fallback เป็นรหัสแผนกหรือหน้าตา placeholder แทน จึงยังเปิดหน้าเว็บได้ตามปกติ

## ขนาดไฟล์ที่แนะนำ

| ประเภท | ขนาดแนะนำ | รูปแบบ |
|---|---:|---|
| ตัวละครน้องปลาทู | 800×1000 px | PNG/WebP |
| โลโก้แผนก | 512×512 px | PNG/WebP พื้นหลังโปร่งใส |
| ภาพพื้นหลังต้อนรับ | 1600×900 px | WebP/JPG |
| Overlay แผนที่ | ตามอัตราส่วนแผนที่ | PNG โปร่งใส |

## จุดที่ใช้แก้ข้อมูลการแสดงผล

- เมนูหน้าแรก: `client/src/pages/KioskHome.tsx` ส่วน `menuItems`
- สีและตำแหน่งหมุด: ข้อมูล `CampusBuilding` ใน `shared/campus.ts`
- โลโก้แผนก: `client/src/config/kioskAssets.ts`
- ภาพตัวละครแต่ละสถานะ: `client/src/config/kioskAssets.ts`
- ข้อความต้อนรับและคำอธิบาย: `client/src/pages/KioskHome.tsx`

## หมายเหตุเรื่อง Backend

หน้า Kiosk ใช้ข้อมูลอาคารและข่าวสารผ่าน query ที่มีอยู่เพื่อแสดงผล แต่การเปลี่ยนหน้าตา สี ไอคอน ตัวละคร และภาพทั้งหมดทำได้จาก Frontend โดยไม่ต้องแก้ router หรือ schema หากต้องการทำ Frontend mockup แบบไม่ใช้ข้อมูล backend ให้เปลี่ยนตัวแปร `buildings` และ `news` ใน `KioskHome.tsx` เป็นข้อมูลตัวอย่าง local ได้
