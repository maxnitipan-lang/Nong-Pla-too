# ล่องแม่กลอง — เว็บแนะนำเที่ยวสมุทรสงคราม

โครงสร้างแยก **frontend** กับ **backend** ออกจากกัน คุยกันผ่าน REST API เพื่อให้แบ่งงานกันทำได้คนละส่วน

```
project/
├── backend/          ← คนทำหลังบ้าน (API + ข้อมูล) ทำงานที่นี่
│   ├── server.js         Express server หลัก
│   ├── routes/           API endpoints แต่ละตัว
│   └── data/             ไฟล์ JSON เก็บข้อมูล (สถานที่, จุดเริ่มต้น, รถโดยสาร)
│
└── frontend/         ← คนทำหน้าเว็บ (UI + แมพ) ทำงานที่นี่
    ├── index.html        โครงหน้าเว็บ
    ├── css/style.css      สไตล์ทั้งหมด
    └── js/
        ├── config.js      ที่อยู่ backend API (แก้บรรทัดเดียวถ้า URL เปลี่ยน)
        ├── api.js         ฟังก์ชันเรียก API ทั้งหมด (คนทำ frontend ไม่ต้องรู้เรื่อง backend)
        ├── map.js         จัดการแมพ (Leaflet)
        └── app.js         เชื่อม API เข้ากับหน้าจอ
```

## วิธีรัน (ตอน dev ในเครื่อง)

### 1. รัน backend ก่อน
```bash
cd backend
npm install
npm start
```
เช็คว่าทำงาน: เปิด http://localhost:4000/api/health ควรเห็น `{"status":"ok"}`

### 2. เปิด frontend
เปิดไฟล์ `frontend/index.html` ในเบราว์เซอร์ได้เลย (หรือใช้ Live Server ใน VS Code ก็ได้)
ถ้า backend รันอยู่ที่ port 4000 จะเชื่อมกันอัตโนมัติ (ดูสถานะที่มุมขวาบนของหน้าเว็บ)

## แบ่งงานกันยังไง

**ทีม backend** แก้ที่โฟลเดอร์ `backend/` อย่างเดียว:
- ใส่ข้อมูลสถานที่จริงที่ `backend/data/places.json`
- ใส่ข้อมูลจุดเริ่มต้น (จุดจอดรถ/สถานี) ที่ `backend/data/startpoints.json`
- ใส่ราคา/ประเภทรถโดยสารจริงต่อเส้นทางที่ `backend/data/transport.json` — ดู `_readme` ในไฟล์นั้นสำหรับรูปแบบ
- ถ้าจะต่อ Directions API จริง (Longdo/Google) แก้ที่ `backend/routes/route.js`

**ทีม frontend** แก้ที่โฟลเดอร์ `frontend/` อย่างเดียว ไม่ต้องรู้ว่า backend เก็บข้อมูลยังไง แค่เรียกผ่าน `API.xxx()` ใน `js/api.js`:
- แก้ดีไซน์/สไตล์ที่ `css/style.css`
- แก้ layout ที่ `index.html`
- แก้ logic แสดงผลที่ `js/app.js`

**จุดต่อกัน (contract) ระหว่างสองทีม** คือ API endpoints ด้านล่าง — ถ้าจะเปลี่ยนรูปแบบข้อมูลที่ backend ส่งออกมา ต้องบอกทีม frontend ด้วย

## API Endpoints ที่มีตอนนี้

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| GET | `/api/health` | เช็คว่า server ทำงานอยู่ |
| GET | `/api/places` | รายการสถานที่ท่องเที่ยวทั้งหมด |
| GET | `/api/places/:id` | ข้อมูลสถานที่เดียว |
| GET | `/api/startpoints` | รายการจุดเริ่มต้น (สถานีขนส่ง ฯลฯ) |
| GET | `/api/route?from=X&to=Y` | ระยะทาง+เส้นทางจาก X ไป Y (ตอนนี้เป็นเส้นตรง รอต่อ Directions API) |
| GET | `/api/transport?from=X&to=Y` | ตัวเลือกรถโดยสารสำหรับเส้นทาง X→Y |

## สิ่งที่ยังไม่ได้ทำ (รอทำต่อ)

- [ ] ต่อ Directions API จริง (Longdo Map หรือ Google) ให้เส้นทางเดินตามถนนจริง ไม่ใช่เส้นตรง — แก้ที่ `backend/routes/route.js`
- [ ] ใส่ข้อมูลสถานที่/จุดจอดรถ/ราคาจริงจากการลงพื้นที่ — แก้ที่ไฟล์ JSON ใน `backend/data/`
- [ ] ย้ายข้อมูลจาก JSON file ไปเป็นฐานข้อมูลจริง (เช่น Firebase/Supabase) เมื่อข้อมูลเยอะขึ้น — ตอนนี้ยังใช้ JSON file พอสำหรับ prototype
- [ ] เชื่อมกับ AI (Claude API) ให้ตอบคำถามได้ ถ้าจะใช้เว็บนี้เป็นสมองของหุ่นยนต์
- [ ] Deploy backend ขึ้น hosting จริง (เช่น Render, Railway) แล้วแก้ `frontend/js/config.js` ให้ชี้ไป URL จริง
