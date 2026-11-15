import { describe, expect, it, vi } from "vitest";

vi.stubEnv("DATABASE_URL", ""); // never touch a real database in tests
const { factsAgree, isLearnable, learnedAnswer, rememberQuestion } = await import("./chatLearning.js");

const ai = (reply = "คำตอบจาก AI ครับ", routeToBuildingId = null) => ({ reply, source: "ai", routeToBuildingId });

describe("isLearnable", () => {
  it("keeps general questions the AI answered", () => {
    expect(isLearnable("ช่างยนต์กับช่างกลโรงงานต่างกันยังไง", ai())).toBe(true);
    expect(isLearnable("What can I do after the Vocational Certificate?", ai())).toBe(true);
  });

  it("skips ready answers, follow-ups, time-sensitive, kiosk-relative, personal and crisis questions", () => {
    expect(isLearnable("ช่างยนต์อยู่ไหน", { reply: "x", source: "faq" })).toBe(false);
    expect(isLearnable("แล้วชั้นไหนล่ะ", ai())).toBe(false);
    expect(isLearnable("วันนี้มีกิจกรรมอะไร", ai())).toBe(false);
    expect(isLearnable("ข่าวรับสมัครล่าสุด", ai())).toBe(false);
    expect(isLearnable("โรงอาหารใกล้ไหม", ai())).toBe(false);
    expect(isLearnable("โทรหาผมที่ 081-234-5678", ai())).toBe(false);
    expect(isLearnable("อยากตาย", ai())).toBe(false);
    expect(isLearnable("ok", ai())).toBe(false);
  });
});

describe("factsAgree (the second AI answer must say the same thing)", () => {
  it("accepts different wording with the same building, floor and route", () => {
    expect(
      factsAgree(ai("งานการเงินอยู่ **อาคาร 85 ปี** ชั้น 1 ครับ", "building-85"), ai("ไปจ่ายเงินได้ที่อาคาร 85 ปี ชั้น 1 ฝั่งซ้ายครับ", "building-85"))
    ).toBe(true);
    expect(factsAgree(ai("ช่างเชื่อมใช้เครื่องเชื่อม ส่วนช่างกลใช้เครื่องกลึง"), ai("ช่างกลโรงงานใช้เครื่องกลึง ช่างเชื่อมใช้ตู้เชื่อมครับ"))).toBe(true);
  });

  it("rejects answers that name a different building, floor or route", () => {
    expect(factsAgree(ai("อยู่อาคาร 4 ชั้น 3 ครับ"), ai("อยู่อาคาร 4 ชั้น 2 ครับ"))).toBe(false);
    expect(factsAgree(ai("อยู่อาคาร 9 ครับ"), ai("อยู่อาคาร 10 ครับ"))).toBe(false);
    expect(factsAgree(ai("ไปทางนี้", "canteen"), ai("ไปทางนี้", "auditorium"))).toBe(false);
  });
});

describe("without a database", () => {
  it("never throws and finds nothing", async () => {
    await expect(rememberQuestion("ช่างยนต์กับช่างกลต่างกันยังไง", ai())).resolves.toBeUndefined();
    await expect(learnedAnswer("ช่างยนต์กับช่างกลต่างกันยังไง")).resolves.toBeNull();
  });
});

describe("grouping, unsure answers and corrections", async () => {
  const { classifyQuestion, isUnsure, CORRECTION, isRecordable } = await import("./chatLearning.js");

  it("groups questions by topic", () => {
    expect(classifyQuestion("ห้องสมุดอยู่ไหน", { source: "faq", routeToBuildingId: "general-subjects" })).toBe("building");
    expect(classifyQuestion("มีข่าวรับสมัครไหม", { source: "ai" })).toBe("news");
    expect(classifyQuestion("ช่างยนต์เรียนกี่ปี", { source: "ai" })).toBe("program");
    expect(classifyQuestion("เล่ามุกตลกหน่อย", { source: "faq", faqId: "off-joke" })).toBe("offtopic");
    expect(classifyQuestion("ฟุตบอลโลกใครชนะ", { source: "ai" })).toBe("offtopic");
  });

  it("spots answers Nong Platoo could not give", () => {
    expect(isUnsure({ source: "fallback", reply: "ตอนนี้มีคนถามเยอะ" })).toBe(true);
    expect(isUnsure({ source: "ai", reply: "น้องปลาทูยังไม่มีข้อมูลหอพักครับ" })).toBe(true);
    expect(isUnsure({ source: "ai", reply: "ห้องสมุดอยู่อาคาร 3 ชั้น 1 ครับ" })).toBe(false);
  });

  it("recognises 'that's wrong' and never stores personal data", () => {
    for (const t of ["ไม่ใช่นะ ห้องสมุดอยู่อาคาร 4", "ผิดแล้ว", "ไม่ใช่อันนี้", "That's wrong"]) expect(CORRECTION.test(t)).toBe(true);
    for (const t of ["ห้องสมุดอยู่ไหน", "ไม่ใช้เงินได้ไหม"]) expect(CORRECTION.test(t)).toBe(false);
    expect(isRecordable("โทร 081-234-5678 หน่อย")).toBe(false);
    expect(isRecordable("ห้องสมุดอยู่ไหน")).toBe(true);
  });
});

describe("grouping fixes from the live test", async () => {
  const { classifyQuestion, isUnsure } = await import("./chatLearning.js");
  it("puts program questions in the program group even when a route is opened", () => {
    expect(classifyQuestion("ช่างกลโรงงานมีระดับไหน", { source: "faq" })).toBe("program");
    expect(classifyQuestion("ปริญญาตรีมีสาขาอะไร", { source: "faq", routeToBuildingId: "machine-shop" })).toBe("program");
    expect(classifyQuestion("Do you have a bachelor degree?", { source: "faq" })).toBe("program");
    expect(classifyQuestion("ช่างยนต์อยู่ไหน", { source: "faq", routeToBuildingId: "mech-auto" })).toBe("building");
  });
  it("does not mistake advice to the reader for 'I don't know'", () => {
    expect(isUnsure({ source: "ai", reply: "If you're not sure which one, try the quiz" })).toBe(false);
    expect(isUnsure({ source: "ai", reply: "ถ้ายังไม่แน่ใจ ลองเล่นเกมเลือกสาขา" })).toBe(false);
    expect(isUnsure({ source: "ai", reply: "ผมยังไม่แน่ใจเรื่องนี้ครับ" })).toBe(true);
  });
});
