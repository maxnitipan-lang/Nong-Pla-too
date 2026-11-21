import { describe, expect, it } from "vitest";
import { newsInputSchema, shortThaiYear } from "./adminSchemas.js";

describe("shortThaiYear", () => {
  it("writes the year with 2 digits, like the college website", () => {
    expect(shortThaiYear("18 ก.ย. 2569")).toBe("18 ก.ย. 69");
    expect(shortThaiYear("5 มี.ค. 2570")).toBe("5 มี.ค. 70");
    expect(shortThaiYear("วันนี้ – 30 ก.ย. 2569")).toBe("วันนี้ – 30 ก.ย. 69");
  });

  it("leaves dates already short, and other text, as they are", () => {
    expect(shortThaiYear("19 ต.ค. 69")).toBe("19 ต.ค. 69");
    expect(shortThaiYear("ทุกวัน 2569")).toBe("ทุกวัน 2569");
  });

  it("is applied when news is saved", () => {
    const input = newsInputSchema.parse({ id: "x", tag: "ข่าว", title: "หัวข้อ", dateLabel: "18 ก.ย. 2569" });
    expect(input.dateLabel).toBe("18 ก.ย. 69");
  });
});
