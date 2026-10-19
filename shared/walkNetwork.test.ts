import { describe, expect, it } from "vitest";
import {
  connectBuildingEntrance,
  distanceM,
  locateOnPath,
  planCampusRoute,
  type WalkNetwork,
} from "./walkNetwork";

// ~1e-4 deg ≈ 11 m. An L-shaped walkway: west→east along the bottom, then north.
//
//   C (13.4210,100.0110)  ← building "north" beside it
//   |
//   A ───────── B
// (13.4190,100.0090) (13.4190,100.0110)
const base = { lat: 13.419, lng: 100.009 };
const at = (dLat: number, dLng: number) => ({ lat: base.lat + dLat, lng: base.lng + dLng });

const L_SHAPE: WalkNetwork = {
  version: 1,
  nodes: [
    { id: "A", ...at(0, 0), gate: true, name: "ประตูหน้า" },
    { id: "B", ...at(0, 0.002), name: "โรงอาหาร" },
    { id: "C", ...at(0.002, 0.002) },
    { id: "E", ...at(0.002, 0.0021), buildingId: "north" },
  ],
  edges: [
    { a: "A", b: "B" },
    { a: "B", b: "C", name: "ทางเดินมีหลังคา" },
    { a: "C", b: "E" },
  ],
};
const target = { ...at(0.002, 0.0021), buildingId: "north", name: "อาคารเหนือ" };

describe("planCampusRoute", () => {
  it("follows the walkways instead of cutting across", () => {
    const route = planCampusRoute(L_SHAPE, at(0, 0.0001), target)!;
    expect(route).not.toBeNull();
    const straight = distanceM(at(0, 0.0001), target);
    expect(route.distance).toBeGreaterThan(straight * 1.3); // goes round the corner
    // Passes through the corner B.
    expect(locateOnPath(route.path, L_SHAPE.nodes[1]).offBy).toBeLessThan(1);
  });

  it("gives turn-by-turn steps with landmarks and path names", () => {
    const route = planCampusRoute(L_SHAPE, at(0, 0.0001), target)!;
    const text = route.steps.map((s) => s.instruction);
    expect(route.steps[0].maneuver).toBe("depart");
    expect(text[0]).toContain("ทิศตะวันออก");
    // East then north = a left turn at the canteen, onto the named path.
    expect(route.steps[1].maneuver).toBe("left");
    expect(text[1]).toBe("เลี้ยวซ้าย เข้าทางเดินมีหลังคา ที่โรงอาหาร");
    expect(route.steps.at(-1)!.maneuver).toBe("arrive");
    expect(text.at(-1)).toContain("อาคารเหนือ");
    // Step distances add up to the route.
    const sum = route.steps.reduce((s, x) => s + x.distance, 0);
    expect(Math.abs(sum - route.distance)).toBeLessThan(1);
  });

  it("routes people off campus from the nearest gate", () => {
    const far = at(-0.01, -0.01); // ~1.5 km away
    const route = planCampusRoute(L_SHAPE, far, target)!;
    expect(route.offCampus?.gateName).toBe("ประตูหน้า");
    expect(route.path[0]).toEqual([L_SHAPE.nodes[0].lat, L_SHAPE.nodes[0].lng]);
  });

  it("returns null when the building is on an unconnected island", () => {
    const island: WalkNetwork = {
      ...L_SHAPE,
      nodes: [...L_SHAPE.nodes, { id: "X", ...at(0.005, 0.005) }, { id: "Y", ...at(0.005, 0.0052), buildingId: "island" }],
      edges: [...L_SHAPE.edges, { a: "X", b: "Y" }],
    };
    expect(planCampusRoute(island, at(0, 0.0001), { ...at(0.005, 0.0052), buildingId: "island", name: "เกาะ" })).toBeNull();
  });
});

describe("connectBuildingEntrance", () => {
  it("links a building to the nearest walkway by splitting it", () => {
    const { network, linkDistance } = connectBuildingEntrance(L_SHAPE, { id: "south", name: "อาคารใต้", ...at(-0.0002, 0.001) });
    expect(linkDistance).toBeGreaterThan(15);
    expect(linkDistance).toBeLessThan(30);
    expect(network.nodes.find((n) => n.buildingId === "south")).toBeTruthy();
    const route = planCampusRoute(network, at(0, 0.0001), { ...at(-0.0002, 0.001), buildingId: "south", name: "อาคารใต้" });
    expect(route?.steps.at(-1)?.maneuver).toBe("arrive");
  });
});
