# Nong Platoo Ontour AI Chatbot

หน้า public มี floating widget `Nong Platoo Ontour AI` อยู่มุมขวาล่างแล้ว โดยใช้คอมโพเนนต์ `client/src/components/CampusAIWidget.tsx` และคอมโพเนนต์แชตที่มีอยู่ใน `client/src/components/AIChatBox.tsx`

## ตอนนี้ใช้งานอย่างไร

ถ้ายังไม่ตั้งค่า endpoint แชตจะทำงานในโหมดเตรียมเชื่อมต่อ แสดง welcome message, suggested questions และข้อความแจ้งเตือนสำหรับรอ AI URL โดยไม่ทำให้หน้าเว็บพัง

## วิธีต่อ AI URL ภายหลัง

เพิ่ม environment variable ฝั่ง frontend:

```bash
VITE_CAMPUS_AI_URL=https://your-ai-service.example.com/chat
```

จากนั้น restart/dev server ใหม่ ระบบจะส่ง request แบบนี้:

```json
{
  "messages": [
    { "role": "assistant", "content": "..." },
    { "role": "user", "content": "อาคารช่างยนต์อยู่ตรงไหน?" }
  ]
}
```

endpoint ควรตอบกลับได้ทั้งรูปแบบ plain text หรือ JSON ที่มี key ใด key หนึ่งต่อไปนี้:

```json
{ "reply": "คำตอบจาก AI" }
```

รองรับ `reply`, `message`, `answer`, `content` หรือ `text`

## สิ่งที่ควรทำก่อนใช้ production

- ตั้งค่า CORS ให้รับเฉพาะโดเมนจริงของเว็บไซต์
- ให้ AI service ตรวจสอบและซ่อน API key ฝั่ง server ห้ามฝังคีย์ลับใน frontend
- กำหนด rate limit และ logging สำหรับการใช้งานแชต
- ใส่ system prompt ให้ AI ตอบเฉพาะข้อมูลของวิทยาลัยและไม่แต่งข้อมูลพิกัด/ข่าวสารขึ้นเอง
- ถ้า AI endpoint ต้องใช้ header พิเศษ ให้เพิ่มใน `CampusAIWidget.tsx` หรือย้าย proxy ไปที่ `server/routers.ts`
