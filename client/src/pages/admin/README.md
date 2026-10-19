# pages/admin — หน้าเจ้าหน้าที่

| ไฟล์                 | URL                | หน้าที่                                                          |
| -------------------- | ------------------ | ---------------------------------------------------------------- |
| `AdminShell.tsx`     | —                  | กรอบของทุกหน้า admin: เมนูซ้าย, ฟอร์มล็อกอิน, ตรวจสิทธิ์         |
| `AdminOverview.tsx`  | `/admin`           | หน้าสรุปภาพรวม                                                   |
| `BuildingsAdmin.tsx` | `/admin/buildings` | เพิ่ม/แก้อาคาร พิกัด ห้อง สาขา รูป และนำเข้าจาก Google My Maps   |
| `WalkwaysAdmin.tsx`  | `/admin/walkways`  | วาดเส้นทางเดินจริงในวิทยาลัย (ใช้คำนวณการนำทาง)                  |
| `NewsAdmin.tsx`      | `/admin/news`      | เพิ่ม/แก้ข่าว และดึงข่าวจากเว็บวิทยาลัย                          |
| `SettingsAdmin.tsx`  | `/admin/settings`  | ตั้งค่าทั่วไป และตำแหน่งตู้ Kiosk                                |
| `UsersAdmin.tsx`     | `/admin/users`     | เพิ่ม/ลบผู้ใช้ กำหนดสิทธิ์ admin / editor / viewer (เฉพาะ admin) |
| `formKit.tsx`        | —                  | ช่องกรอกและปุ่มที่ใช้ร่วมกันในฟอร์ม admin                        |
