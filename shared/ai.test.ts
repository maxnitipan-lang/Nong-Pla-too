import { describe, expect, it } from "vitest";
import { extractCampusAIReply } from "./ai";

describe("extractCampusAIReply", () => {
  it("accepts plain text responses", () => {
    expect(extractCampusAIReply("สวัสดีจาก AI")).toBe("สวัสดีจาก AI");
  });

  it("accepts common JSON response keys", () => {
    expect(extractCampusAIReply({ answer: "ไปอาคารอำนวยการได้ทางนี้" })).toBe("ไปอาคารอำนวยการได้ทางนี้");
    expect(extractCampusAIReply({ content: "มีทั้งหมด 9 สาขา" })).toBe("มีทั้งหมด 9 สาขา");
  });

  it("returns a safe fallback for unknown payloads", () => {
    expect(extractCampusAIReply({ data: { result: true } })).toContain("รูปแบบคำตอบ");
  });
});
