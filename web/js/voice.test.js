import { describe, expect, it } from "vitest";
import { cleanForSpeech } from "./voice.js";

describe("cleanForSpeech", () => {
  it("strips markdown, links and emoji so the voice reads naturally", () => {
    const reply =
      "**อาคารพาณิชยกรรม** อยู่ทางทิศใต้ครับ 👇\n- ชั้น 1: ห้องบัญชี\n- ดูเพิ่ม [ที่นี่](https://www.sstc.ac.th/x) https://a.b/c";
    expect(cleanForSpeech(reply)).toBe("อาคารพาณิชยกรรม อยู่ทางทิศใต้ครับ ชั้น 1: ห้องบัญชี ดูเพิ่ม ที่นี่");
  });

  it("spells out distance units", () => {
    expect(cleanForSpeech("เดินอีก 200 ม. แล้วเลี้ยวซ้าย รวม 1.2 กม.")).toBe(
      "เดินอีก 200 เมตร แล้วเลี้ยวซ้าย รวม 1.2 กิโลเมตร"
    );
  });
});

describe("speakableEnglish", () => {
  it("drops Thai names, markdown and emoji for the English voice", async () => {
    const { speakableEnglish } = await import("./voice.js");
    expect(speakableEnglish("Accounting is in **Building 4 (อาคาร 4 พาณิชยกรรม)** on floor 3 📚\n- Marketing: floor 2")).toBe(
      "Accounting is in Building 4 on floor 3. Marketing: floor 2"
    );
  });
});

describe("speakableEnglish (phone, separators)", () => {
  it("reads phone numbers digit by digit and turns · and / into pauses", async () => {
    const { speakableEnglish } = await import("./voice.js");
    expect(speakableEnglish("Phone 034-711440 · Website www.sstc.ac.th · 2D / 3D")).toBe(
      "Phone 0 3 4, 7 1 1 4 4 0, Website www.sstc.ac.th, 2D or 3D"
    );
  });
});

describe("isFemaleVoice", () => {
  it("tells female Thai voices from male ones", async () => {
    const { isFemaleVoice } = await import("./voice.js");
    for (const name of ["Microsoft Premwadee Online (Natural) - Thai", "Microsoft Pattara - Thai (Thailand)", "Kanya", "Narisa (Enhanced)", "Google ไทย"])
      expect(isFemaleVoice({ name })).toBe(true);
    for (const name of ["Microsoft Niwat Online (Natural) - Thai", "Some Thai voice"]) expect(isFemaleVoice({ name })).toBe(false);
    expect(isFemaleVoice(null)).toBe(false);
  });
});
