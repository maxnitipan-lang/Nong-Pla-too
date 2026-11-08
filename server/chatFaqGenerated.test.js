import { describe, expect, it } from "vitest";
import faqData from "../shared/data/chatFaq.json" with { type: "json" };
import { CAMPUS_BUILDINGS, CAMPUS_SETTINGS_DEFAULTS } from "../shared/campus.js";
import { answerFromFaq } from "./chatFaq.js";
import { GENERATED_ENTRIES, teacherAnswer } from "./chatFaqGenerated.js";

const ask = q => answerFromFaq(q, CAMPUS_BUILDINGS, CAMPUS_SETTINGS_DEFAULTS);
const ALL = [...faqData.entries, ...GENERATED_ENTRIES];

describe("ready-made answer set", () => {
  it("has many answers and no duplicate ids", () => {
    expect(ALL.length).toBeGreaterThan(200);
    const ids = ALL.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every sample question gets its own answer (no answer steals another's question)", () => {
    const answerOf = new Map(ALL.map(e => [e.id, e.answer]));
    const wrong = [];
    for (const e of ALL)
      for (const q of e.questions) {
        const got = ask(q)?.faqId;
        if (got !== e.id && answerOf.get(got) !== e.answer) wrong.push(`${e.id}: ${q} → ${got}`);
      }
    expect(wrong).toEqual([]);
  });

  it("only routes to places that exist", () => {
    const ids = new Set(CAMPUS_BUILDINGS.map(b => b.id));
    for (const e of ALL) if (e.routeTo) expect(ids.has(e.routeTo), `${e.id} → ${e.routeTo}`).toBe(true);
  });
});

describe("answers built from the data files", () => {
  it.each([
    ["ช่างยนต์เรียนอะไร", "dept-auto-study", "เครื่องยนต์"],
    ["จบบัญชีทำงานอะไร", "dept-accounting-careers", "บัญชี"],
    ["ช่างเชื่อมโลหะมีปวสไหม", "dept-welding-levels", "ไม่มี ปวส."],
    ["ปวส.ช่างยนต์ชื่อสาขาอะไร", "dept-auto-levels", "เทคนิคเครื่องกล"],
    ["ครูช่างยนต์มีใครบ้าง", "dept-auto-teachers", "อำนาจ"],
    ["ใครดูแลงานทะเบียน", "office-head-7", "ชวลิต"],
    ["ใครดูแลฝ่ายวิชาการ", "division-7", "สมส่ง"],
    ["อยากเรียนช่างยนต์ต้องทำยังไง", "dept-auto-apply", "งานทะเบียน"],
    ["ตึก 10 มีอะไรบ้าง", "building-building-10-inside", "ธุรกิจดิจิทัล"],
    ["มีสาขาคอมพิวเตอร์ไหม", "dept-computer-any", "เทคนิคคอมพิวเตอร์"],
    ["สาขาไหนเหมาะกับผู้หญิง", "dept-gender", "ทุกเพศ"],
    ["อยากตาย", "chat-crisis", "1323"],
  ])("%s → %s", (question, id, text) => {
    const r = ask(question);
    expect(r?.faqId).toBe(id);
    expect(r.reply).toContain(text);
  });

  it("finds a teacher by first name", () => {
    expect(teacherAnswer("ครูอำนาจสอนอะไร")?.reply).toMatch(/ไวยบริสุทธิ์.*ช่างยนต์/);
    expect(teacherAnswer("อำนาจ")).toBeNull(); // no "teacher / who" words → not about a person
  });

  it("leaves questions it has no data for to the AI", () => {
    for (const q of ["หัวหน้าสาขาช่างยนต์คือใคร", "ช่างไฟฟ้ากับอิเล็กทรอนิกส์ต่างกันยังไง", "ทำไมฟ้าเป็นสีฟ้า"]) expect(ask(q), q).toBeNull();
  });

  it("never states a tuition price", () => {
    expect(ask("ค่าเทอมเท่าไหร่")?.reply).not.toMatch(/\d+\s*บาท/);
  });
});
