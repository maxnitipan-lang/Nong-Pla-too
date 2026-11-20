import { describe, expect, it } from "vitest";
import { feedbackToken, isAiSource, readFeedbackToken } from "./chatFeedback.js";

describe("chat feedback token", () => {
  it("round-trips what the server recorded", () => {
    const token = feedbackToken({ question: "g[njv", lang: "th", source: "faq", answer: "ตอบ ".repeat(100) });
    const read = readFeedbackToken(token);
    expect(read).toMatchObject({ question: "g[njv", lang: "th", source: "faq" });
    expect(read.answer.length).toBe(200);
  });

  it("rejects a token that was changed or made up", () => {
    const token = feedbackToken({ question: "ห้องสมุดอยู่ไหน", lang: "th", source: "ai", answer: "อาคาร 1" });
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ q: "คำถามอื่น", l: "th", s: "ai", a: "" })).toString("base64url");
    expect(readFeedbackToken(`${forged}.${sig}`)).toBeNull();
    expect(readFeedbackToken(`${body}.x${sig.slice(1)}`)).toBeNull();
    expect(readFeedbackToken("nope")).toBeNull();
    expect(readFeedbackToken("")).toBeNull();
  });

  it("only AI answers count as AI use", () => {
    expect(isAiSource("ai")).toBe(true);
    expect(isAiSource("ai-kiosk")).toBe(true);
    expect(isAiSource("faq")).toBe(false);
    expect(isAiSource("approved")).toBe(false);
  });
});
