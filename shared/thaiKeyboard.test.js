import { describe, expect, it } from "vitest";
import { englishKeysToThai, fixWrongKeyboard } from "./thaiKeyboard.js";

describe("Thai typed with the keyboard on English", () => {
  it.each([
    ["g[njv", "เบื่อ"],
    ["=jk'po9N", "ช่างยนต์"],
  ])("%s → %s", (typed, thai) => {
    expect(fixWrongKeyboard(typed)).toBe(thai);
    expect(englishKeysToThai(typed)).toBe(thai);
  });

  it.each(["hello", "thank you", "wifi", "ok", "ICT", "ไปช่างยนต์", ""])("leaves %j alone", (text) => {
    expect(fixWrongKeyboard(text)).toBeNull();
  });
});
