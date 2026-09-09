import { useCallback, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink, Navigation } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CampusBuilding } from "@shared/campus";

// Optional free routing key from https://openrouteservice.org (email signup, no
// credit card). Without it the modal draws a straight "as the crow flies" line
// and distance instead of a road-following walking route.
const ORS_KEY: string = import.meta.env.VITE_ORS_API_KEY || "";
const COLLEGE = "วิทยาลัยเทคนิคสมุทรสงคราม";

/** In-app directions just need a building with real coordinates. */
export const canShowInAppDirections = (b?: CampusBuilding | null): boolean =>
  Boolean(b?.latitude && b?.longitude);

/** Google Maps deep link — opens the Maps app with turn-by-turn from the user. */
export function walkingDeepLink(b: CampusBuilding): string {
  const destination =
    b.latitude && b.longitude
      ? `${b.latitude},${b.longitude}`
      : `${b.name} ${COLLEGE}`;
  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "walking",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function haversineMeters(a: L.LatLngLiteral, b: L.LatLngLiteral): number {
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

const buildingIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<svg width="26" height="38" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>`,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
  });

const youIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#2f7fb5;border:3px solid #fff;box-shadow:0 0 0 3px rgba(47,127,181,.35)"></span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type DirectionsModalProps = {
  building: CampusBuilding | null;
  onClose: () => void;
};

export function DirectionsModal({ building, onClose }: DirectionsModalProps) {
  const mapRef = useRef<L.Map | null>(null);
  const buildingRef = useRef(building);
  buildingRef.current = building;
  const [info, setInfo] = useState("กำลังโหลดแผนที่…");

  // Callback ref: fires with the real node the moment the dialog mounts it, and
  // with null when it unmounts — no timing guesswork against the Radix portal.
  const mountMap = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      mapRef.current?.remove();
      mapRef.current = null;
      return;
    }
    const b = buildingRef.current;
    if (!b?.latitude || !b?.longitude || mapRef.current) return;

    const dest: L.LatLngLiteral = {
      lat: Number(b.latitude),
      lng: Number(b.longitude),
    };
    const map = L.map(node).setView([dest.lat, dest.lng], 17);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    L.marker([dest.lat, dest.lng], {
      icon: buildingIcon(b.accent || "#123b52"),
    })
      .addTo(map)
      .bindPopup(b.name);

    setInfo("กำลังขอตำแหน่งของคุณ… กด “อนุญาต” เมื่อเบราว์เซอร์ถาม");

    const drawStraightLine = (origin: L.LatLngLiteral) => {
      const line = L.polyline(
        [
          [origin.lat, origin.lng],
          [dest.lat, dest.lng],
        ],
        { color: "#123b52", weight: 4, opacity: 0.7, dashArray: "6 8" },
      ).addTo(map);
      map.fitBounds(line.getBounds().pad(0.3));
      setInfo(
        `ระยะเส้นตรง ~${Math.round(haversineMeters(origin, dest))} เมตร (โดยประมาณ)`,
      );
    };

    const drawWalkingRoute = async (origin: L.LatLngLiteral) => {
      if (!ORS_KEY) return drawStraightLine(origin);
      try {
        // HeiGIT unified API (replaces the deprecated api.openrouteservice.org)
        const url =
          `https://api.heigit.org/openrouteservice/v2/directions/foot-walking` +
          `?api_key=${ORS_KEY}&start=${origin.lng},${origin.lat}` +
          `&end=${dest.lng},${dest.lat}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const feature = data?.features?.[0];
        const coords: [number, number][] = feature?.geometry?.coordinates ?? [];
        if (!mapRef.current || coords.length < 2) throw new Error("empty route");

        const line = L.polyline(
          coords.map(([lng, lat]) => [lat, lng] as [number, number]),
          { color: "#123b52", weight: 5, opacity: 0.85 },
        ).addTo(map);
        map.fitBounds(line.getBounds().pad(0.2));

        const s = feature.properties.summary;
        const dist =
          s.distance >= 1000
            ? `${(s.distance / 1000).toFixed(1)} กม.`
            : `${Math.round(s.distance)} เมตร`;
        setInfo(`เดิน ~${dist} · ~${Math.max(1, Math.round(s.duration / 60))} นาที`);
      } catch {
        if (mapRef.current) drawStraightLine(origin);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mapRef.current) return;
          const origin: L.LatLngLiteral = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          L.marker([origin.lat, origin.lng], { icon: youIcon })
            .addTo(map)
            .bindPopup("ตำแหน่งของคุณ");
          void drawWalkingRoute(origin);
        },
        () =>
          setInfo(
            "ไม่ได้รับสิทธิ์ตำแหน่ง — แสดงเฉพาะที่ตั้งอาคาร กด “เปิดใน Google Maps” เพื่อนำทางจริง",
          ),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      setInfo("อุปกรณ์นี้ไม่รองรับ GPS — แสดงเฉพาะที่ตั้งอาคาร");
    }

    setTimeout(() => mapRef.current?.invalidateSize(), 250);
  }, []);

  if (!building) return null;

  return (
    <Dialog
      open={!!building}
      onOpenChange={(v) => {
        if (!v) {
          setInfo("กำลังโหลดแผนที่…");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation size={16} /> เส้นทางไป {building.name}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-[var(--muted-foreground)]">{info}</p>

        <div
          ref={mountMap}
          className="h-[360px] w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]"
        />

        <a
          href={walkingDeepLink(building)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 self-start rounded-full bg-[var(--ink)] px-4 py-2.5 text-xs font-extrabold text-white transition-transform hover:-translate-y-0.5"
        >
          <ExternalLink size={14} /> เปิดใน Google Maps (มีเสียงนำทาง)
        </a>
      </DialogContent>
    </Dialog>
  );
}
