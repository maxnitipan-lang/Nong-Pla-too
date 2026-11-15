import { describe, expect, it } from "vitest";
import { cleanForSpeech } from "./speechText.js";

// What น้องปลาทู says out loud — abbreviations must be read the way Thai people say them.
describe("pronunciation", () => {
  it.each([
    ["เรียน ปวช. 3 ปี", "เรียน ปอ วอ ชอ 3 ปี"],
    ["ต่อ ปวส. 2 ปี", "ต่อ ปอ วอ สอ 2 ปี"],
    ["รับผู้จบ ม.3 และ ม.6", "รับผู้จบ มอ 3 และ มอ 6"],
    ["เดิน 145 ม. ระยะ 6.6 กม.", "เดิน 145 เมตร ระยะ 6.6 กิโลเมตร"],
    ["รองฯ สรยุทธ", "รองผู้อำนวยการ สรยุทธ"],
    ["ก่อตั้ง พ.ศ. 2484", "ก่อตั้ง พุทธศักราช 2484"],
    ["ปริญญาตรี (ทล.บ.)", "ปริญญาตรี (เทคโนโลยีบัณฑิต)"],
    ["ห้องประชุม อวท.", "ห้องประชุม ออ วอ ทอ"],
    ["ศูนย์ ICT และห้อง MC3", "ศูนย์ ไอซีที และห้อง เอ็มซีสาม"],
    ["Fix it Center", "ฟิกซ์อิทเซ็นเตอร์"],
    ["อ.เมือง จ.สมุทรสงคราม", "อำเภอเมือง จังหวัดสมุทรสงคราม"],
    ["ภาคเรียนที่ 1/2568", "ภาคเรียนที่ 1 ปีการศึกษา 2568"],
    ["เข้ากับคุณ 89%", "เข้ากับคุณ 89 เปอร์เซ็นต์"],
    ["เวลา 13.30 น.", "เวลา 13 นาฬิกา 30 นาที"],
    ["ร้าน 7-11", "ร้าน เซเว่นอีเลฟเว่น"],
    ["โทร 034-711440", "โทร ศูนย์ สาม สี่, เจ็ด หนึ่ง หนึ่ง สี่ สี่ ศูนย์"],
    ["สายด่วน 1323", "สายด่วน หนึ่ง สาม สอง สาม"],
    ["เปิด 08:00–16:30 น.", "เปิด 8 นาฬิกา ถึง 16 นาฬิกา 30 นาที"],
    ["วันจันทร์–ศุกร์", "วันจันทร์ ถึง ศุกร์"],
    ["ทางเข้า–ออก", "ทางเข้า ออก"],
    ["ชั้น 2–4", "ชั้น 2 ถึง 4"],
    ["เมื่อ 19 ต.ค. 69", "เมื่อ 19 ตุลาคม 2569"],
    ["ติด 0 / ร / มส.", "ติด 0 หรือ รอ หรือ มอ สอ"],
    ["เว็บ www.sstc.ac.th", "เว็บ ดับเบิลยูดับเบิลยูดับเบิลยู ดอท เอส เอส ที ซี ดอท เอ ซี ดอท ที เอช"],
  ])("%s → %s", (text, spoken) => {
    expect(cleanForSpeech(text)).toBe(spoken);
  });

  it("reads every ready-made answer without leftover ปวช./ปวส. abbreviations", async () => {
    const { default: faq } = await import("./data/chatFaq.json", { with: { type: "json" } });
    for (const e of faq.entries) expect(cleanForSpeech(e.answer), e.id).not.toMatch(/ปว[ชส]\.|รองฯ|พ\.ศ\./);
  });
});

describe("chunk: where the voice pauses", async () => {
  const { chunk, voiceSummary } = await import("./speechText.js");
  it("never splits a phone number read digit by digit", () => {
    const en = "Dual vocational education means studying at the college while also doing practical training in real companies, which helps you gain hands-on work experience before graduation. If you want to know more about which programs offer this or how to apply, you can check with the Registration office or call 0 3 4, 7 1 1 4 4 0.";
    expect(chunk(en).every((p) => !/^\d[.,]?$/.test(p) && !/\d$/.test(p.trim()) || p === chunk(en).at(-1))).toBe(true);
    expect(chunk(en).at(-1)).toMatch(/0 3 4, 7 1 1 4 4 0\.$/);
  });
  it("breaks Thai without spaces at a word, not in the middle of one", () => {
    const parts = chunk("ลูกชอบซ่อมรถมอเตอร์ไซค์สามารถเรียนสาขาวิชาช่างยนต์".repeat(6), 60);
    for (const p of parts.slice(0, -1)) expect(p.length).toBeLessThanOrEqual(60);
    expect(parts.join("")).toBe("ลูกชอบซ่อมรถมอเตอร์ไซค์สามารถเรียนสาขาวิชาช่างยนต์".repeat(6));
  });
  it("reads only the start of a long reply, ending at a sentence", () => {
    const long = "ข้อหนึ่งยาวมากครับ ".repeat(40);
    const v = voiceSummary(long, 120);
    expect(v.length).toBeLessThan(170);
    expect(v).toMatch(/ครับ รายละเอียดเพิ่มเติมดูบนจอได้เลยครับ$/);
  });
});
