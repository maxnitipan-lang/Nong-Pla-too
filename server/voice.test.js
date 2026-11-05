import { describe, expect, it } from "vitest";
import { cleanTranscript, pcmToWav } from "./voice.js";

describe("voice helpers", () => {
  it("wraps PCM in a valid 24 kHz mono WAV header", () => {
    const pcm = Buffer.alloc(48_000); // 1 s of silence
    const wav = pcmToWav(pcm);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(40)).toBe(48_000);
    expect(wav.length).toBe(44 + 48_000);
  });
});

describe("speech-to-text clean-up", () => {
  it.each(["00:00", "0:01 - 0:03", "", "...", "[เสียงลม]", "(silence)", "ไม่มีเสียงพูด", "no speech"])(
    "treats %j as nothing heard",
    raw => {
      expect(cleanTranscript(raw)).toBe("");
    }
  );

  it("keeps real questions", () => {
    expect(cleanTranscript('"ช่างยนต์อยู่ไหนครับ"')).toBe("ช่างยนต์อยู่ไหนครับ");
    expect(cleanTranscript("ไปตึก 10 ยังไง")).toBe("ไปตึก 10 ยังไง");
    expect(cleanTranscript("[เสียงลม] ห้องน้ำอยู่ไหน")).toBe("ห้องน้ำอยู่ไหน");
  });
});
