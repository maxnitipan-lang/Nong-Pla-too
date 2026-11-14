// Walking-direction helpers: coordinates, distances, GPS and the Google Maps link.
// (Same as client/src/lib/directions.ts in the React version.)

/** Building coordinates as numbers (the API sends them as strings), or null. */
export function buildingLatLng(building) {
  if (!building?.latitude || !building?.longitude) return null;
  const lat = Number(building.latitude);
  const lng = Number(building.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export const hasCoords = (building) => buildingLatLng(building) !== null;

/** "350 เมตร" / "1.2 กม." */
export function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} เมตร` : `${(meters / 1000).toFixed(1)} กม.`;
}

/** Walking time at 1.25 m/s, at least 1 minute. */
export const walkMinutes = (meters) => Math.max(1, Math.round(meters / 1.25 / 60));

/** Google Maps walking directions — by coordinates, or by name when a building has none. */
export function walkingDeepLink(building) {
  const point = buildingLatLng(building);
  const destination = point ? `${point.lat},${point.lng}` : `${building.name} วิทยาลัยเทคนิคสมุทรสงคราม`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
}

const GPS_WINDOW_MS = 9000;
const GPS_GOOD_ENOUGH_M = 40;

/**
 * Best GPS fix within ~9 s. Phones often report a coarse network fix first and
 * sharpen it over a few seconds, so watch and keep the most accurate reading;
 * stop early once it is within 40 m.
 */
export function getBestPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง (GPS)"));
      return;
    }
    let best = null;
    let done = false;
    let watchId = null;
    let timer = null;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(new Error("หาตำแหน่งไม่สำเร็จ — ลองออกไปที่โล่งแล้วลองใหม่"));
    };
    watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!best || coords.accuracy < best.accuracy) best = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
        if (coords.accuracy <= GPS_GOOD_ENOUGH_M) finish();
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          done = true;
          navigator.geolocation.clearWatch(watchId);
          clearTimeout(timer);
          reject(new Error("ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่ง (GPS) ในเบราว์เซอร์แล้วลองใหม่"));
        }
        // Timeout / unavailable: keep waiting until the window closes.
      },
      { enableHighAccuracy: true, timeout: GPS_WINDOW_MS, maximumAge: 0 },
    );
    timer = setTimeout(finish, GPS_WINDOW_MS);
  });
}

/** Lower-cased text a building is searchable by: names, category, rooms and departments. */
export function buildingSearchText(building) {
  return [
    building.name,
    building.shortName,
    building.category,
    building.description,
    ...(building.floorsDetail ?? []).flatMap((floor) => floor.rooms),
    ...(building.departments ?? []).flatMap((d) => [d.name, d.code]),
  ]
    .join(" ")
    .toLowerCase();
}

/** Link the phone app opens straight into navigation to `buildingId`. */
export function phoneRouteUrl(buildingId, startNavigation = true, lang = "th") {
  const origin = window.location.origin;
  if (!buildingId) return `${origin}/app?openExternalBrowser=1`;
  return `${origin}/app?place=${encodeURIComponent(buildingId)}${startNavigation ? "&go=1" : ""}${lang === "en" ? "&lang=en" : ""}&openExternalBrowser=1`;
}
