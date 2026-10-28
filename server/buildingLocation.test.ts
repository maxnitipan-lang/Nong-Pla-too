import { describe, expect, it } from "vitest";
import { CAMPUS_BUILDINGS, CAMPUS_SETTINGS_DEFAULTS } from "../shared/campus";
import type { CampusBuilding } from "../shared/campus";
import { describeLocation, locateBuilding } from "./buildingLocation";
import { answerFromFaq } from "./chatFaq";

// Three buildings on a line, ~78 m apart (7e-4° of latitude): south, middle, north.
const make = (id: string, lat: number): CampusBuilding => ({
  ...CAMPUS_BUILDINGS[0],
  id,
  name: `อาคาร${id}`,
  shortName: id,
  latitude: String(lat),
  longitude: "100.0100",
  departments: [],
  floorsDetail: [],
});
const line = [make("south", 13.4193), make("middle", 13.42), make("north", 13.4207)];

describe("building location in words", () => {
  it("names the side of campus and the nearest buildings", () => {
    const north = locateBuilding(line[2], line)!;
    expect(north.zone).toBe("ฝั่งทิศเหนือของวิทยาลัย");
    expect(north.neighbours[0]).toMatchObject({ name: "middle", distanceM: 80 });
    expect(locateBuilding(line[1], line)!.zone).toBe("บริเวณกลางวิทยาลัย");
  });

  it("adds distance and direction from the kiosk only when one is given", () => {
    const kiosk = { name: "ตู้", lat: 13.4193, lng: 100.01 };
    expect(locateBuilding(line[2], line)!.fromKiosk).toBeNull();
    expect(locateBuilding(line[2], line, kiosk)!.fromKiosk).toEqual({ distanceM: 160, direction: "ทิศเหนือ" });
    expect(describeLocation(locateBuilding(line[2], line, kiosk))).toContain("ห่างจากจุดนี้ประมาณ 160 เมตร ไปทางทิศเหนือ");
  });

  it("returns nothing for a building without coordinates", () => {
    expect(locateBuilding({ ...line[0], latitude: undefined, longitude: undefined }, line)).toBeNull();
  });

  it("is used in the ready-made 'where is' answer", () => {
    const answer = answerFromFaq("ช่างยนต์อยู่ไหน", CAMPUS_BUILDINGS, CAMPUS_SETTINGS_DEFAULTS)!;
    expect(answer.reply).toMatch(/อยู่(ฝั่ง|บริเวณกลาง).*วิทยาลัย/);
    expect(answer.reply).toContain("ใกล้กับ");
    expect(answer.routeToBuildingId).toBe("mech-auto");
  });

  it("says which building a department is in", () => {
    const answer = answerFromFaq("ฝ่ายวิชาการอยู่ไหน", CAMPUS_BUILDINGS, CAMPUS_SETTINGS_DEFAULTS)!;
    expect(answer.reply).toMatch(/^ฝ่ายวิชาการ อยู่ที่ \*\*อาคาร 85 ปี\*\*/);
  });
});
