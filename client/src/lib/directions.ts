import type { CampusBuilding } from "@shared/campus";

const COLLEGE = "วิทยาลัยเทคนิคสมุทรสงคราม";

// Free routing key from https://openrouteservice.org (email signup, no card).
// Without it we fall back to a straight line + haversine distance.
const ORS_KEY: string = import.meta.env.VITE_ORS_API_KEY || "";

export type LngLat = { lat: number; lng: number };

export const hasCoords = (b?: CampusBuilding | null): boolean =>
  Boolean(b?.latitude && b?.longitude);

/** Google Maps deep link — opens the Maps app with turn-by-turn from the user. */
export function walkingDeepLink(b: CampusBuilding): string {
  const destination = hasCoords(b)
    ? `${b.latitude},${b.longitude}`
    : `${b.name} ${COLLEGE}`;
  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "walking",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type WalkRoute = {
  /** [lat, lng] points for a Leaflet polyline. */
  points: [number, number][];
  distanceM: number;
  durationS: number;
};

/** ORS foot-walking route (via the HeiGIT API). Returns null on no key / failure. */
export async function fetchWalkingRoute(
  origin: LngLat,
  dest: LngLat,
): Promise<WalkRoute | null> {
  if (!ORS_KEY) return null;
  try {
    const url =
      `https://api.heigit.org/openrouteservice/v2/directions/foot-walking` +
      `?api_key=${ORS_KEY}&start=${origin.lng},${origin.lat}` +
      `&end=${dest.lng},${dest.lat}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data?.features?.[0];
    const coords: [number, number][] = feature?.geometry?.coordinates ?? [];
    if (coords.length < 2) return null;
    return {
      points: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
      distanceM: feature.properties.summary.distance,
      durationS: feature.properties.summary.duration,
    };
  } catch {
    return null;
  }
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} กม.` : `${Math.round(m)} เมตร`;
}

export function formatWalk(route: WalkRoute): string {
  return `เดิน ~${formatDistance(route.distanceM)} · ~${Math.max(
    1,
    Math.round(route.durationS / 60),
  )} นาที`;
}
