export function extractCampusAIReply(payload: unknown) {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["reply", "message", "answer", "content", "text"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return "ได้รับข้อความแล้ว แต่รูปแบบคำตอบจาก AI endpoint ยังไม่ตรงกับที่หน้าเว็บรองรับครับ";
}
