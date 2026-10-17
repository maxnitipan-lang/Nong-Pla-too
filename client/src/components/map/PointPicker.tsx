import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CAMPUS_BUILDINGS, CAMPUS_OVERVIEW } from "@shared/campus";
import { buildingLatLng, type LatLng } from "@/lib/directions";

const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="30" height="42" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#e0533d" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
});

/**
 * Small satellite map for choosing one point (e.g. where the kiosk stands):
 * click to place, drag to fine-tune. Building names are shown for orientation.
 */
export function PointPicker({ value, onChange, disabled }: { value: LatLng | null; onChange: (p: LatLng) => void; disabled?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const start = value ?? CAMPUS_OVERVIEW.mapCenter;
    const map = L.map(boxRef.current, { center: [start.lat, start.lng], zoom: 18, maxZoom: 21 });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: "Imagery &copy; Esri",
    }).addTo(map);
    for (const b of CAMPUS_BUILDINGS) {
      const p = buildingLatLng(b);
      if (!p) continue;
      L.circleMarker([p.lat, p.lng], { radius: 4, color: "#fff", weight: 1, fillColor: b.accent, fillOpacity: 1, interactive: false })
        .bindTooltip(b.shortName, { permanent: true, direction: "right", offset: [5, 0], className: "!text-[10px] !font-bold !py-0 !px-1" })
        .addTo(map);
    }
    if (!disabled) map.on("click", (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([value.lat, value.lng], { icon: pinIcon, draggable: !disabled }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
  }, [value, disabled]);

  return <div ref={boxRef} className="relative isolate h-72 w-full overflow-hidden rounded-xl border border-[var(--border)]" />;
}
