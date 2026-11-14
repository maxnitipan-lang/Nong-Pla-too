import { describe, expect, it } from "vitest";
import { englishOnly } from "./chat.js";

describe("englishOnly", () => {
  it("drops Thai names in brackets and writes Thai levels in English", () => {
    expect(englishOnly("Accounting is in **Building 4 (อาคาร 4 พาณิชยกรรม)** on floor 3. We teach ปวช. and ปวส.")).toBe(
      "Accounting is in **Building 4** on floor 3. We teach Vocational Certificate and Higher Vocational Diploma"
    );
  });
});

describe("isUndecided", () => {
  it("spots people who can't pick a program", async () => {
    const { isUndecided } = await import("./chat.js");
    for (const q of ["ตอนนี้อยากเรียนเทคนิคมากแต่ไม่รู้จะเรียนสาขาไหน", "เลือกสาขาไม่ถูกเลย", "จบ ม.3 ควรเรียนอะไรดีครับ", "สาขาไหนเหมาะกับหนู", "I don't know what to study"])
      expect(isUndecided(q)).toBe(true);
    for (const q of ["ห้องสมุดอยู่ไหน", "ช่างยนต์เรียนอะไร", "where is the library"]) expect(isUndecided(q)).toBe(false);
  });
});
