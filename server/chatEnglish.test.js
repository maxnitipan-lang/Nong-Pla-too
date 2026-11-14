import { describe, expect, it } from "vitest";
import { englishOnly } from "./chat.js";

describe("englishOnly", () => {
  it("drops Thai names in brackets and writes Thai levels in English", () => {
    expect(englishOnly("Accounting is in **Building 4 (อาคาร 4 พาณิชยกรรม)** on floor 3. We teach ปวช. and ปวส.")).toBe(
      "Accounting is in **Building 4** on floor 3. We teach Vocational Certificate and Higher Vocational Diploma"
    );
  });
});
