// Build the 3D map's building footprints + road outlines from the OpenStreetMap snapshot.
//
//   npx tsx scripts/buildCampusFootprintsFromOsm.ts
//
// Input : scripts/data/campus-osm.json   (Overpass `out geom` of highway/building ways around campus)
// Output: shared/data/campusFootprints.json  (read by client/src/components/CampusMap3D.tsx)
//
// The 3D map matches each campus building (shared/campus.ts / database, by its
// lat/lng pin) to the OSM footprint it sits in, so the footprints don't need ids
// of their own. A building with no footprint is drawn as a plain box at its pin.
// Map data © OpenStreetMap contributors (ODbL) — keep the credit on the map.

import fs from "node:fs";
import { CAMPUS_BUILDINGS } from "../shared/campus";

type OsmWay = { id: number; geometry: { lat: number; lon: number }[]; tags?: Record<string, string> };

/** How far around the outermost campus pins to keep OSM ways (metres). */
const PAD_M = 160;
const ROAD_WIDTH_M: Record<string, number> = {
  primary: 12,
  secondary: 10,
  secondary_link: 7,
  tertiary: 8,
  residential: 6,
  unclassified: 6,
  service: 4.5,
  living_street: 4.5,
  path: 2,
  footway: 2,
  pedestrian: 3,
};

const osm = JSON.parse(fs.readFileSync("scripts/data/campus-osm.json", "utf8")) as { elements: OsmWay[] };

const lats = CAMPUS_BUILDINGS.map((b) => Number(b.latitude));
const lngs = CAMPUS_BUILDINGS.map((b) => Number(b.longitude));
const padLat = PAD_M / 110_574;
const padLng = PAD_M / (111_320 * Math.cos((13.42 * Math.PI) / 180));
const box = { s: Math.min(...lats) - padLat, n: Math.max(...lats) + padLat, w: Math.min(...lngs) - padLng, e: Math.max(...lngs) + padLng };
const inside = (p: { lat: number; lon: number }) => p.lat >= box.s && p.lat <= box.n && p.lon >= box.w && p.lon <= box.e;
const round = (n: number) => Math.round(n * 1e7) / 1e7;
const toPath = (way: OsmWay): [number, number][] => way.geometry.map((p) => [round(p.lat), round(p.lon)]);

const buildings = osm.elements
  .filter((w) => w.tags?.building && w.geometry.length >= 4 && w.geometry.some(inside))
  .map((w) => {
    const ring = toPath(w);
    // OSM closes rings by repeating the first node — the 3D shape doesn't need it.
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) ring.pop();
    const levels = Number(w.tags?.["building:levels"]);
    return {
      osmId: w.id,
      kind: w.tags!.building,
      ...(w.tags?.name ? { name: w.tags.name } : {}),
      ...(Number.isFinite(levels) && levels > 0 ? { levels } : {}),
      ring,
    };
  });

const roads = osm.elements
  .filter((w) => w.tags?.highway && ROAD_WIDTH_M[w.tags.highway] && w.geometry.some(inside))
  .map((w) => ({ osmId: w.id, kind: w.tags!.highway, width: ROAD_WIDTH_M[w.tags!.highway], path: toPath(w) }));

const out = {
  source: "© OpenStreetMap contributors (ODbL) — scripts/data/campus-osm.json",
  buildings,
  roads,
};
fs.writeFileSync("shared/data/campusFootprints.json", JSON.stringify(out) + "\n");
console.log(`campusFootprints.json: ${buildings.length} buildings, ${roads.length} roads`);
