import { describe, expect, it } from "vitest";
import { forVoice, toFemaleSpeech } from "./politeness.js";

describe("toFemaleSpeech (female voice: ค่ะ / คะ / หนู)", () => {
  it.each([
    ["สวัสดีครับ ผมน้องปลาทู", "สวัสดีค่ะ หนูน้องปลาทู"],
    ["ห้องสมุดอยู่ที่อาคาร 3 ครับ ผมเปิดเส้นทางให้แล้วครับ", "ห้องสมุดอยู่ที่อาคาร 3 ค่ะ หนูเปิดเส้นทางให้แล้วค่ะ"],
    ["อยากไปที่ไหนครับ", "อยากไปที่ไหนคะ"],
    ["มีอะไรให้น้องปลาทูช่วยไหมครับ", "มีอะไรให้น้องปลาทูช่วยไหมคะ"],
    ["ขอบคุณครับผม", "ขอบคุณค่ะ"],
    ["สนใจไหมครับ? ลองเล่นเกมนะครับ", "สนใจไหมคะ? ลองเล่นเกมนะคะ"],
    ["เรียนกี่ปีครับ", "เรียนกี่ปีคะ"],
    ["ร้านตัดผมอยู่ไหนครับ", "ร้านตัดผมอยู่ไหนคะ"],
  ])("%s", (male, female) => expect(toFemaleSpeech(male)).toBe(female));

  it("leaves English and male voices alone", () => {
    expect(toFemaleSpeech("The library is in Building 3.")).toBe("The library is in Building 3.");
    expect(forVoice("ได้เลยครับ", false)).toBe("ได้เลยครับ");
    expect(forVoice("ได้เลยครับ", true)).toBe("ได้เลยค่ะ");
  });
});
