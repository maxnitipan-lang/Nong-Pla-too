import { describe, expect, it, vi } from "vitest";

vi.stubEnv("DATABASE_URL", ""); // never touch a real database in tests

describe("several Gemini keys", () => {
  it("reads GEMINI_API_KEY alone, or with GEMINI_API_KEYS, without duplicates", async () => {
    const { apiKeysFrom } = await import("./chat.js");
    expect(apiKeysFrom({ GEMINI_API_KEY: "a" })).toEqual(["a"]);
    expect(apiKeysFrom({ GEMINI_API_KEY: "a", GEMINI_API_KEYS: "b, c,a," })).toEqual(["a", "b", "c"]);
    expect(apiKeysFrom({})).toEqual([]);
  });

  it("tries every key for the main model before the backup models", async () => {
    const { attemptsToTry } = await import("./chat.js");
    const attempts = attemptsToTry(Date.now(), 2);
    expect(attempts[0]).toMatchObject({ keyIndex: 0 });
    expect(attempts[1]).toMatchObject({ keyIndex: 1, model: attempts[0].model });
    expect(attempts.length % 2).toBe(0);
  });
});

describe("aiStore without a database", () => {
  it("does nothing and never throws", async () => {
    const store = await import("./aiStore.js");
    expect(await store.getStoredAnswer("x")).toBeNull();
    await store.storeAnswer("x", "q", { reply: "r" });
    await store.countAiUse("answered", 10);
    expect(await store.aiUsage()).toEqual([]);
    expect(store.thaiDay(Date.UTC(2026, 10, 17, 20))).toBe("2026-11-18");
  });
});
