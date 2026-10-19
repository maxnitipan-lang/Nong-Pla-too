import { describe, expect, it } from "vitest";
import { cleanForSpeech } from "./voice";

describe("cleanForSpeech", () => {
  it("strips markdown, links and emoji so the voice reads naturally", () => {
    const reply = "**อาคารพาณิชยกรรม** อยู่ทางทิศใต้ครับ 👇\n- ชั้น 1: ห้องบัญชี\n- ดูเพิ่ม [ที่นี่](https://www.sstc.ac.th/x) https://a.b/c";
    expect(cleanForSpeech(reply)).toBe("อาคารพาณิชยกรรม อยู่ทางทิศใต้ครับ ชั้น 1: ห้องบัญชี ดูเพิ่ม ที่นี่");
  });

  it("spells out distance units", () => {
    expect(cleanForSpeech("เดินอีก 200 ม. แล้วเลี้ยวซ้าย รวม 1.2 กม.")).toBe("เดินอีก 200 เมตร แล้วเลี้ยวซ้าย รวม 1.2 กิโลเมตร");
  });
});
