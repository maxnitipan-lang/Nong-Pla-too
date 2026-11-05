import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { CAMPUS_BUILDINGS, CAMPUS_OVERVIEW } from "../../shared/campus.js";
import { building3dStyle } from "../../shared/building3dStyles.js";
import { FLOOR_M, makeProjector, orientedBox, placeBuildings, setFootprints } from "./campus3d.js";

setFootprints(JSON.parse(readFileSync(new URL("../../shared/data/campusFootprints.json", import.meta.url), "utf8")));

describe("3D campus map — building placement", () => {
  const project = makeProjector(CAMPUS_OVERVIEW.mapCenter);
  const { placed } = placeBuildings(CAMPUS_BUILDINGS, project);

  it("draws every campus building that has a pin", () => {
    const drawn = new Set(placed.flatMap(p => p.ids));
    const withPins = CAMPUS_BUILDINGS.filter(b => b.latitude && b.longitude);
    for (const b of withPins) expect(drawn.has(b.id), b.id).toBe(true);
  });

  it("uses the floor count (or the photo override) for the height", () => {
    for (const p of placed) {
      const style = building3dStyle(p.ids[0]);
      if (style.height) {
        expect(p.height).toBe(style.height);
        continue;
      }
      const floors = style.floors ?? Math.max(...p.ids.map(id => CAMPUS_BUILDINGS.find(b => b.id === id).floors));
      expect(p.height).toBeCloseTo(floors * FLOOR_M + 0.8);
    }
  });

  it("gives pitched and arched roofs a rise, flat roofs none", () => {
    for (const p of placed) {
      const type = building3dStyle(p.ids[0]).roofType ?? "flat";
      if (type === "flat") expect(p.roofRise).toBe(0);
      else expect(p.roofRise).toBeGreaterThan(1);
    }
  });

  it("draws ICT (not in OpenStreetMap) as its own box of the photo size", () => {
    const ict = placed.find(p => p.ids.includes("ict-building"));
    expect(ict.ids).toEqual(["ict-building"]);
    const box = orientedBox(ict.poly);
    expect(box.a * 2).toBeCloseTo(48);
    expect(box.b * 2).toBeCloseTo(28);
  });

  it("projects north as -z and east as +x", () => {
    const { lat, lng } = CAMPUS_OVERVIEW.mapCenter;
    const [x, z] = project(lat + 0.001, lng + 0.001);
    expect(x).toBeGreaterThan(100);
    expect(z).toBeLessThan(-100);
  });

  it("puts a building with no OSM footprint on a box at its pin", () => {
    const far = { ...CAMPUS_BUILDINGS[0], id: "far-away", latitude: "13.43", longitude: "100.03" };
    const res = placeBuildings([far], project);
    expect(res.placed).toHaveLength(1);
    expect(res.placed[0].poly).toHaveLength(4);
  });
});
