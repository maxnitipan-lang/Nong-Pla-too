import { describe, expect, it, vi } from "vitest";

vi.stubEnv("DATABASE_URL", ""); // never touch a real database in tests

describe("ความรู้ของ AI", () => {
  it("uses an item only while it is enabled and within its dates", async () => {
    const { isActive } = await import("./aiKnowledge.js");
    const item = { enabled: true, validFrom: "2026-11-01", validUntil: "2026-11-30" };
    expect(isActive(item, "2026-11-18")).toBe(true);
    expect(isActive(item, "2026-10-31")).toBe(false);
    expect(isActive(item, "2026-12-01")).toBe(false);
    expect(isActive({ ...item, enabled: false }, "2026-11-18")).toBe(false);
    expect(isActive({ enabled: true, validFrom: "", validUntil: "" }, "2030-01-01")).toBe(true);
  });

  it("without a database the AI keeps the built-in announcement", async () => {
    const { knowledgeLines } = await import("./aiKnowledge.js");
    expect(await knowledgeLines()).toBeNull();
  });
});
