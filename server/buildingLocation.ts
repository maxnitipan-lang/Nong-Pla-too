// "Where is this building?" in words, worked out from the building coordinates:
// which part of the campus it is in, which buildings are next to it, and how far
// and in which direction it is from the kiosk. Used by the ready-made answers
// (chatFaq.ts) and given to the AI in its building list (chat.ts).

import type { CampusBuilding, CampusSettings } from "@shared/campus";

type Point = { lat: number; lng: number };

/** Within this distance of the campus centre a building counts as "in the middle". */
const CENTRE_RADIUS_M = 45;
/** Buildings closer than this are mentioned as neighbours. */
const NEIGHBOUR_MAX_M = 120;

const COMPASS = ["ทิศเหนือ", "ทิศตะวันออกเฉียงเหนือ", "ทิศตะวันออก", "ทิศตะวันออกเฉียงใต้", "ทิศใต้", "ทิศตะวันตกเฉียงใต้", "ทิศตะวันตก", "ทิศตะวันตกเฉียงเหนือ"];

function pointOf(building: CampusBuilding): Point | null {
  const lat = Number(building.latitude);
  const lng = Number(building.longitude);
  return building.latitude && building.longitude && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function distanceM(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Compass direction of `to` as seen from `from`. */
function compass(from: Point, to: Point): string {
  const rad = Math.PI / 180;
  const y = Math.sin((to.lng - from.lng) * rad) * Math.cos(to.lat * rad);
  const x =
    Math.cos(from.lat * rad) * Math.sin(to.lat * rad) -
    Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lng - from.lng) * rad);
  const bearing = (Math.atan2(y, x) / rad + 360) % 360;
  return COMPASS[Math.round(bearing / 45) % 8];
}

/** Rounded to a distance people can picture: 10 m steps, 50 m steps past 200 m. */
function roundM(m: number): number {
  return m > 200 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10);
}

function campusCentre(points: Point[]): Point {
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  };
}

export type BuildingLocation = {
  /** e.g. "ฝั่งทิศเหนือของวิทยาลัย" or "บริเวณกลางวิทยาลัย" */
  zone: string;
  /** Nearest buildings, closest first. */
  neighbours: { name: string; distanceM: number }[];
  /** From the kiosk (when its location is set in /admin/settings). */
  fromKiosk: { distanceM: number; direction: string } | null;
};

export function locateBuilding(
  building: CampusBuilding,
  buildings: CampusBuilding[],
  kiosk: CampusSettings["kiosk"] = null
): BuildingLocation | null {
  const here = pointOf(building);
  if (!here) return null;
  const others = buildings
    .filter((b) => b.id !== building.id)
    .map((b) => ({ b, p: pointOf(b) }))
    .filter((x): x is { b: CampusBuilding; p: Point } => x.p !== null);
  const centre = campusCentre([here, ...others.map((o) => o.p)]);

  const zone =
    distanceM(centre, here) <= CENTRE_RADIUS_M ? "บริเวณกลางวิทยาลัย" : `ฝั่ง${compass(centre, here)}ของวิทยาลัย`;

  const neighbours = others
    .map((o) => ({ name: o.b.shortName || o.b.name, distanceM: distanceM(here, o.p) }))
    .filter((n) => n.distanceM <= NEIGHBOUR_MAX_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 2)
    .map((n) => ({ ...n, distanceM: roundM(n.distanceM) }));

  const fromKiosk = kiosk
    ? { distanceM: roundM(distanceM(kiosk, here)), direction: compass(kiosk, here) }
    : null;

  return { zone, neighbours, fromKiosk };
}

/** One short Thai sentence, e.g. "อยู่ฝั่งทิศเหนือของวิทยาลัย ใกล้กับตึก 10 และช่างกลโรงงาน". */
export function describeLocation(location: BuildingLocation | null): string {
  if (!location) return "";
  const parts = [`อยู่${location.zone}`];
  if (location.neighbours.length) parts.push(`ใกล้กับ${location.neighbours.map((n) => n.name).join(" และ ")}`);
  if (location.fromKiosk) {
    parts.push(`ห่างจากจุดนี้ประมาณ ${location.fromKiosk.distanceM} เมตร ไปทาง${location.fromKiosk.direction}`);
  }
  return parts.join(" ");
}
