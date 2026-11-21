import { describe, expect, it } from "vitest";
import { normalizeUsername, usernameToOpenId } from "./_core/localAccounts.js";

describe("usernames", () => {
  it("treats Thai marks typed in either order as the same name", () => {
    const vowelFirst = "รถต\u0e39\u0e49"; // ู then ้
    const toneFirst = "รถต\u0e49\u0e39"; // ้ then ู (looks the same on screen)
    expect(vowelFirst === toneFirst).toBe(false);
    expect(normalizeUsername(toneFirst)).toBe(normalizeUsername(vowelFirst));
    expect(usernameToOpenId(` ${toneFirst} `)).toBe(usernameToOpenId(vowelFirst));
  });

  it("still trims and lower-cases English names", () => {
    expect(normalizeUsername("  Admin ")).toBe("admin");
  });
});
