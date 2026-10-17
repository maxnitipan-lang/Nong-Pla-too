# components — ชิ้นส่วนที่ใช้ร่วมกัน

| โฟลเดอร์ / ไฟล์ | ใช้ทำอะไร |
| --- | --- |
| `map/CampusLeafletMap.tsx` | แผนที่วิทยาลัย (OpenStreetMap): หมุดอาคาร, เส้นทาง, จุดตำแหน่งผู้ใช้, ล็อกไม่ให้เลื่อนออกนอกวิทยาลัย |
| `map/RoutePanel.tsx` | แผงนำทาง: ระยะทาง เวลา คำบอกทางเลี้ยวทีละขั้น ปุ่มเริ่มนำทาง และ QR บนตู้ |
| `map/PointPicker.tsx` | แผนที่ดาวเทียมสำหรับคลิกเลือกจุด (ใช้ตั้งตำแหน่งตู้ในหน้า admin) |
| `assistant/CampusAIWidget.tsx` | แชตบอตน้องปลาทู: พิมพ์ถาม, พูดถาม, ฟังคำตอบเป็นเสียง |
| `common/QrCode.tsx` | สร้าง QR code และลิงก์เปิดเส้นทางบนมือถือ |
| `common/InstallPWAButton.tsx` | ปุ่มติดตั้งแอปลงมือถือ |
| `common/ErrorBoundary.tsx` | กันหน้าเว็บขาวทั้งหน้าเมื่อเกิด error |
| `admin/MyMapsImport.tsx` | นำเข้าอาคารจากไฟล์ Google My Maps |
| `ui/` | ปุ่ม ฟอร์ม กล่องข้อความพื้นฐาน (shadcn/ui ไม่ต้องแก้) |
