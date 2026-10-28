import { describe, expect, it } from "vitest";
import { CAMPUS_BUILDINGS, CAMPUS_SETTINGS_DEFAULTS } from "@shared/campus";
import faqData from "../shared/data/chatFaq.json";
import { answerFromFaq, normalizeQuestion, similarity } from "./chatFaq";

const ask = (question: string) => answerFromFaq(question, CAMPUS_BUILDINGS, CAMPUS_SETTINGS_DEFAULTS);

describe("ready-made answers (no AI call)", () => {
  it.each([
    ["สวัสดีครับ", "greeting"],
    ["หวัดดีจ้า", "greeting"],
    ["ขอบคุณมากครับ", "thanks"],
    ["น้องปลาทูคือใคร", "who-are-you"],
    ["วิทยาลัยอยู่ที่ไหนครับ", "college-address"],
    ["เปิดกี่โมงครับ", "office-hours"],
    ["อยากสมัครเรียนต้องทำยังไง", "apply"],
    ["จอดรถตรงไหนได้บ้าง", "parking"],
    ["มีสาขาอะไรบ้างครับ", "majors"],
    ["วันนี้อากาศเป็นไง", "off-weather"],
    ["ช่วยทำการบ้านคณิตหน่อย", "off-homework"],
    ["เลือกพรรคไหนดี", "off-politics"],
    ["ขอเลขเด็ดงวดนี้", "off-money"],
    ["มีแฟนยัง", "off-personal"],
  ])("%s → %s", (question, id) => {
    expect(ask(question)?.faqId).toBe(id);
  });

  it("fills in the college name and opens routes", () => {
    expect(ask("สวัสดีครับ")?.reply).toContain(CAMPUS_SETTINGS_DEFAULTS.collegeName);
    expect(ask("โรงอาหารอยู่ตรงไหน")).toMatchObject({ faqId: "canteen", routeToBuildingId: "auditorium" });
  });

  it.each([
    ["ช่างยนต์อยู่ไหน", "mech-auto"],
    ["ไปงานทะเบียนยังไง", "personnel-registration"],
    ["สาขาการบัญชีอยู่ตึกไหน", "commerce"],
    ["ไปตึก ICT ยังไง", "ict-building"],
    ["เมคคาทรอนิกส์อยู่ที่ไหน", "ict-building"],
    ["ไปอาคาร 85 ปียังไง", "building-85"],
    ["ช่างก่อสร้างอยู่ไหน", "construction-workshop"],
  ])("where is %s → route to %s", (question, buildingId) => {
    expect(ask(question)).toMatchObject({ faqId: `building:${buildingId}`, routeToBuildingId: buildingId });
  });

  it.each([
    "สาขาช่างยนต์เรียนอะไรบ้าง",
    "ค่าเทอมเท่าไหร่",
    "ข่าวล่าสุดมีอะไรบ้าง",
    "ตึกไหนมีห้องคอมพิวเตอร์",
    "จบช่างไฟฟ้าทำงานอะไรได้",
    "ก่อสร้างอยู่ไหน", // two buildings have "ก่อสร้าง" — the AI should ask which one
  ])("leaves %s to the AI", (question) => {
    expect(ask(question)).toBeNull();
  });

  it("ignores long, detailed questions", () => {
    expect(ask("สวัสดีครับ ".repeat(20))).toBeNull();
  });

  it("only routes to buildings that exist", () => {
    const ids = new Set(CAMPUS_BUILDINGS.map((b) => b.id));
    for (const entry of (faqData as { entries: { id: string; routeTo?: string }[] }).entries) {
      if (entry.routeTo) expect(ids.has(entry.routeTo), entry.id).toBe(true);
    }
  });

  it("normalises Thai wording", () => {
    expect(normalizeQuestion("ห้องน้ำอยู่ที่ไหนครับ")).toBe(normalizeQuestion("ห้องน้ำอยู่ไหน"));
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("", "abc")).toBe(0);
  });
});
