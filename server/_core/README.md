# _core — ระบบพื้นฐานของเซิร์ฟเวอร์

ส่วนใหญ่มาจาก template ของ Manus ปกติไม่ต้องแก้

| ไฟล์ | ใช้ทำอะไร |
| --- | --- |
| `index.ts` | จุดเริ่มเซิร์ฟเวอร์: เปิดพอร์ต, ผูก API, `/api/health`, เริ่มดึงข่าวอัตโนมัติ |
| `env.ts` | อ่านค่าจากไฟล์ `.env` |
| `trpc.ts` | ระดับสิทธิ์ของ API (สาธารณะ / viewer / editor / admin) |
| `context.ts` | ตรวจว่าใครเป็นคนเรียก API (จาก cookie ล็อกอิน) |
| `localAccounts.ts` | บัญชีผู้ใช้แบบ username + password, เข้ารหัสรหัสผ่าน, กันการเดารหัส |
| `adminSession.ts` | ล็อกอินด้วยบัญชีหลัก (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) |
| `cookies.ts` | ตั้งค่า cookie ล็อกอิน |
| `vite.ts` | เสิร์ฟหน้าเว็บ (โหมดพัฒนา และโหมดจริง) |
| `oauth.ts`, `sdk.ts` | ล็อกอินผ่าน Manus (ไม่ได้ใช้บน Render) |
| `systemRouter.ts`, `llm.ts`, `map.ts`, `dataApi.ts`, `imageGeneration.ts`, `voiceTranscription.ts`, `notification.ts`, `heartbeat.ts`, `storageProxy.ts` | บริการของ Manus จาก template (ไม่ได้ใช้บน Render) |
