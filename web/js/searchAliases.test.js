import { describe, expect, it } from "vitest";
import { buildingHouses, buildingSearchText } from "./directions.js";

const registration = { name: "งานบุคคล / งานทะเบียน", floorsDetail: [{ level: 1, rooms: ["งานบุคคล", "งานทะเบียน"] }] };
const cafe = { name: "ร้านเพลินแฟ", description: "ร้านกาแฟ (ใกล้งานทะเบียน)" };

describe("search words people use", () => {
  it("finds the registration office by 'สมัครเรียน'", () => {
    expect(buildingSearchText(registration)).toContain("สมัครเรียน");
  });

  it("does not treat a place described as 'near' the office as the office", () => {
    expect(buildingHouses(cafe, /งานทะเบียน/)).toBe(false);
    expect(buildingSearchText(cafe)).not.toContain("สมัครเรียน");
    expect(buildingHouses(registration, /งานทะเบียน/)).toBe(true);
  });
});
