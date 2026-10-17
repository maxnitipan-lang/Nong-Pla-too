# Nong Platoo Ontour

โค้ดเว็บไซต์ประชาสัมพันธ์อัจฉริยะของวิทยาลัยเทคนิคสมุทรสงคราม

## เริ่มต้นใช้งาน

ต้องใช้ Node.js 20+ และ pnpm 10+

```bash
pnpm install
pnpm check
pnpm dev
```

จากนั้นเปิด `http://localhost:3000`

## สร้าง Production Build

```bash
pnpm build
pnpm start
```

## ก่อน Deploy

ตั้งค่า environment variables ของ Backend/Database ตามผู้ให้บริการที่ใช้ เช่น `DATABASE_URL`, `JWT_SECRET` และค่าที่เกี่ยวข้องกับ Manus Runtime ห้าม commit ไฟล์ `.env` หรือ API keys ลง GitHub

## นำขึ้น GitHub

```bash
git init
git add .
git commit -m "Initial Nong Platoo Ontour project"
git branch -M main
git remote add origin https://github.com/<ชื่อบัญชี>/<ชื่อ-repository>.git
git push -u origin main
```

ไฟล์ ZIP นี้ไม่รวม `node_modules`, `dist`, `.git`, log และไฟล์ลับ เพื่อให้สามารถติดตั้ง dependencies ใหม่ด้วย `pnpm install` ได้อย่างสะอาด
