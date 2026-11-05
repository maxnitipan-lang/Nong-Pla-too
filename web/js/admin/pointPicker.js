// Small satellite map for choosing one point (e.g. where the kiosk stands):
// click to place, drag to fine-tune. Building names are shown for orientation.
// (Same as client/src/components/PointPicker.tsx.) Leaflet is window.L.

import { CAMPUS_BUILDINGS, CAMPUS_OVERVIEW } from "/shared/campus.js";
import { buildingLatLng } from "../directions.js";
import { esc } from "../util.js";

const L = window.L;

const pinIcon = () =>
  L.divIcon({
    className: "",
    html: '<svg width="30" height="42" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#e0533d" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  });

/**
 * @param {HTMLElement} box
 * @param {{ value: {lat:number,lng:number}|null, onChange: (p)=>void, disabled?: boolean, buildings?: object[] }} options
 * @returns {{ setValue(p), destroy() }}
 */
export function createPointPicker(box, { value, onChange, disabled = false, buildings = CAMPUS_BUILDINGS }) {
  box.classList.add("mini-map");
  const start = value ?? CAMPUS_OVERVIEW.mapCenter;
  const map = L.map(box, { center: [start.lat, start.lng], zoom: 18, maxZoom: 21 });
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: "Imagery &copy; Esri",
  }).addTo(map);
  for (const b of buildings) {
    const p = buildingLatLng(b);
    if (!p) continue;
    L.circleMarker([p.lat, p.lng], { radius: 4, color: "#fff", weight: 1, fillColor: b.accent, fillOpacity: 1, interactive: false })
      .bindTooltip(esc(b.shortName), { permanent: true, direction: "right", offset: [5, 0], className: "bname" })
      .addTo(map);
  }
  let marker = null;
  const setValue = (p) => {
    if (!p) {
      marker?.remove();
      marker = null;
      return;
    }
    if (!marker) {
      marker = L.marker([p.lat, p.lng], { icon: pinIcon(), draggable: !disabled }).addTo(map);
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        onChange({ lat: ll.lat, lng: ll.lng });
      });
    } else marker.setLatLng([p.lat, p.lng]);
  };
  if (!disabled)
    map.on("click", (e) => {
      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
      setValue(p);
      onChange(p);
    });
  setValue(value);
  setTimeout(() => map.invalidateSize(), 200);
  return { setValue, map, destroy: () => map.remove() };
}
