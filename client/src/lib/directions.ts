// Walking-direction helpers shared by the map, the building pages and the chat.
//
// The walking route itself comes from the server (`campus.walkingRoute`, which
// proxies OpenRouteService so the key stays secret). Everything here is local:
// coordinates, distance maths, GPS and the Google Maps deep link.

import type { CampusBuilding } from "@shared/campus";

export type LatLng = { lat: number; lng: number };
export type GpsFix = LatLng & { accuracy: number };

/** Building coordinates as numbers (the API sends them as strings), or null. */
export function buildingLatLng(building: Pick<CampusBuilding, "latitude" | "longitude">): LatLng | null {
  if (!building.latitude || !building.longitude) return null;
  const lat = Number(building.latitude);
  const lng = Number(building.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export const hasCoords = (building: Pick<CampusBuilding, "latitude" | "longitude">): boolean =>
  buildingLatLng(building) !== null;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "350 เมตร" / "1.2 กม." */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} เมตร` : `${(meters / 1000).toFixed(1)} กม.`;
}

/** "เดิน ~350 เมตร · ~5 นาที" */
export function formatWalk(meters: number, seconds: number): string {
  return `เดิน ~${formatDistance(meters)} · ~${Math.max(1, Math.round(seconds / 60))} นาที`;
}

/** Google Maps walking directions — by coordinates, or by name when a building has none. */
export function walkingDeepLink(building: Pick<CampusBuilding, "name" | "latitude" | "longitude">): string {
  const point = buildingLatLng(building);
  const destination = point
    ? `${point.lat},${point.lng}`
    : `${building.name} วิทยาลัยเทคนิคสมุทรสงคราม`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
}

const GPS_WINDOW_MS = 9000;
const GPS_GOOD_ENOUGH_M = 40;

/**
 * Best GPS fix within ~9 s. Phones often report a coarse network fix first and
 * sharpen it over a few seconds, so watch and keep the most accurate reading;
 * stop early once it is within 40 m.
 */
export function getBestPosition(): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง (GPS)"));
      return;
    }
    let best: GpsFix | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
      if (best) resolve(best);
      else reject(new Error("หาตำแหน่งไม่สำเร็จ — ลองออกไปที่โล่งแล้วลองใหม่"));
    };
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!best || coords.accuracy < best.accuracy) {
          best = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
        }
        if (coords.accuracy <= GPS_GOOD_ENOUGH_M) finish();
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          done = true;
          navigator.geolocation.clearWatch(watchId);
          window.clearTimeout(timer);
          reject(new Error("ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่ง (GPS) ในเบราว์เซอร์แล้วลองใหม่"));
        }
        // Other errors (timeout / unavailable) — keep waiting for the window to close.
      },
      { enableHighAccuracy: true, timeout: GPS_WINDOW_MS, maximumAge: 0 },
    );
    const timer = window.setTimeout(finish, GPS_WINDOW_MS);
  });
}

/** Lower-cased text a building is searchable by: names, category, rooms and departments ("บัญชี" finds its building). */
export function buildingSearchText(building: CampusBuilding): string {
  return [
    building.name,
    building.shortName,
    building.category,
    building.description,
    ...building.floorsDetail.flatMap((floor) => floor.rooms),
    ...(building.departments ?? []).flatMap((d) => [d.name, d.code]),
  ]
    .join(" ")
    .toLowerCase();
}
