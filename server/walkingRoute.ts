// Walking route between the user's GPS position and a campus building, via
// OpenRouteService (HeiGIT) foot-walking. Called from the server so the ORS key
// never ships in the JS bundle (the old app called ORS straight from the browser).
//
//   ORS_API_KEY      Basic key from https://account.heigit.org (Directions V2 = 2000/day)
//                    VITE_ORS_API_KEY is accepted too, for .env files from the old app.
//
// Returns null when there is no key, the start point is far from campus, or ORS
// fails — the client then falls back to a dashed straight line (like before).

import { CAMPUS_OVERVIEW } from "@shared/campus";

const ORS_URL =
  "https://api.heigit.org/openrouteservice/v2/directions/foot-walking";
const ORS_API_KEY = process.env.ORS_API_KEY || process.env.VITE_ORS_API_KEY || "";

/** Starts farther than this from campus are not worth a walking route. */
const MAX_START_DISTANCE_M = 30_000;
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

export type LatLng = { lat: number; lng: number };

export type WalkingRoute = {
  /** Polyline as [lat, lng] pairs (Leaflet order). */
  coordinates: [number, number][];
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
};

export const isWalkingRouteConfigured = (): boolean => ORS_API_KEY.length > 0;

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

const cache = new Map<string, { at: number; route: WalkingRoute | null }>();

export async function getWalkingRoute(
  from: LatLng,
  to: LatLng,
): Promise<WalkingRoute | null> {
  if (!isWalkingRouteConfigured()) return null;
  if (haversineMeters(from, CAMPUS_OVERVIEW.mapCenter) > MAX_START_DISTANCE_M) {
    return null;
  }

  // ~10 m grid so people standing in the same spot share one ORS call.
  const key = [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(4)).join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.route;

  const url =
    `${ORS_URL}?api_key=${encodeURIComponent(ORS_API_KEY)}` +
    `&start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`;

  let route: WalkingRoute | null = null;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[ORS] walking route failed: HTTP ${res.status}`);
      return null; // don't cache errors (quota resets, transient failures)
    }
    const data = (await res.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number][] };
        properties?: { summary?: { distance?: number; duration?: number } };
      }[];
    };
    const feature = data.features?.[0];
    const coords = feature?.geometry?.coordinates ?? [];
    if (coords.length >= 2) {
      route = {
        coordinates: coords.map(([lng, lat]) => [lat, lng]),
        distance: feature?.properties?.summary?.distance ?? 0,
        duration: feature?.properties?.summary?.duration ?? 0,
      };
    }
  } catch (error) {
    console.warn("[ORS] walking route error:", error instanceof Error ? error.message : error);
    return null;
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), route });
  return route;
}
