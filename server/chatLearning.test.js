import { describe, expect, it, vi } from "vitest";

vi.stubEnv("DATABASE_URL", ""); // never touch a real database in tests
const { isLearnable, learnedAnswer, rememberQuestion } = await import("./chatLearning.js");

const ai = (reply = "คำตอบจาก AI ครับ") => ({ reply, source: "ai", routeToBuildingId: null });

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

describe("without a database", () => {
  it("never throws and finds nothing", async () => {
    await expect(rememberQuestion("ช่างยนต์กับช่างกลต่างกันยังไง", ai())).resolves.toBeUndefined();
    await expect(learnedAnswer("ช่างยนต์กับช่างกลต่างกันยังไง")).resolves.toBeNull();
  });
});
