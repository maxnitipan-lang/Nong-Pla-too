import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { CampusBuilding } from "@shared/campus";
import { fetchWalkingRoute, formatDistance, formatWalk, haversineMeters } from "@/lib/directions";
import { cn } from "@/lib/utils";

function pinIcon(color: string, active: boolean) {
  const w = active ? 34 : 26;
  const h = active ? 48 : 38;
  return L.divIcon({
    className: "",
    html:
      `<svg width="${w}" height="${h}" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="${color}" stroke="#fff" stroke-width="2"/>` +
      `<circle cx="14" cy="14" r="5" fill="#fff"/></svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 6],
  });
}

const youIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#2f7fb5;border:3px solid #fff;box-shadow:0 0 0 3px rgba(47,127,181,.35)"></span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type CampusInteractiveMapProps = {
  buildings: CampusBuilding[];
  selectedId: string;
  onSelect: (id: string) => void;
  center: { lat: number; lng: number };
  className?: string;
  /** When set, draw the walking route from the viewer to this building. */
  routeToId?: string | null;
  /** Reports the route summary ("เดิน ~350 เมตร · ~5 นาที") or null when cleared. */
  onRouteInfo?: (text: string | null) => void;
};

/**
 * The interactive campus map: Leaflet + OpenStreetMap (free, no API key), one
 * marker per building drawn straight from our data — so every building shows up
 * without touching Google My Maps. Clicking the list smoothly flies the map to
 * that building, and "ดูเส้นทางในแอป" draws the walking route right here.
 */
export function CampusInteractiveMap({
  buildings,
  selectedId,
  onSelect,
  center,
  className,
  routeToId,
  onRouteInfo,
}: CampusInteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const youMarkerRef = useRef<L.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onRouteInfoRef = useRef(onRouteInfo);
  onRouteInfoRef.current = onRouteInfo;
  const [ready, setReady] = useState(false);

  // 1. Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 17,
      zoomControl: false,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
    setReady(true);
    setTimeout(() => map.invalidateSize(), 200);
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      routeLayerRef.current = null;
      youMarkerRef.current = null;
    };
    // center is the initial camera only — not a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. (Re)build markers when the building list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const points: L.LatLngExpression[] = [];
    for (const b of buildings) {
      if (!b.latitude || !b.longitude) continue;
      const pos: L.LatLngExpression = [Number(b.latitude), Number(b.longitude)];
      points.push(pos);
      const marker = L.marker(pos, {
        icon: pinIcon(b.accent || "#123b52", b.id === selectedId),
        title: b.name,
        zIndexOffset: b.id === selectedId ? 1000 : 0,
      })
        .addTo(map)
        .bindTooltip(b.name, { direction: "top", offset: [0, -34] });
      marker.on("click", () => onSelectRef.current(b.id));
      markersRef.current.set(b.id, marker);
    }

    if (points.length && !selectedId) {
      map.fitBounds(L.latLngBounds(points).pad(0.15), { animate: false });
    }
    // selectedId styling handled by effect 3
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, buildings]);

  // 3. On selection: restyle markers and fly to the chosen building.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    markersRef.current.forEach((marker, id) => {
      const b = buildings.find((x) => x.id === id);
      if (!b) return;
      const active = id === selectedId;
      marker.setIcon(pinIcon(b.accent || "#123b52", active));
      marker.setZIndexOffset(active ? 1000 : 0);
    });

    const sel = buildings.find((b) => b.id === selectedId);
    if (sel?.latitude && sel?.longitude && !routeToId) {
      map.flyTo([Number(sel.latitude), Number(sel.longitude)], 18, {
        duration: 0.8,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId, buildings]);

  // 4. Walking route: draw from the viewer's location to `routeToId`.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const clear = () => {
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
      youMarkerRef.current?.remove();
      youMarkerRef.current = null;
    };
    clear();

    const target = routeToId
      ? buildings.find((b) => b.id === routeToId)
      : undefined;
    if (!target?.latitude || !target?.longitude) {
      onRouteInfoRef.current?.(null);
      return;
    }
    const dest = { lat: Number(target.latitude), lng: Number(target.longitude) };

    if (!navigator.geolocation) {
      onRouteInfoRef.current?.("อุปกรณ์นี้ไม่รองรับ GPS — แสดงเฉพาะที่ตั้งอาคาร");
      map.flyTo([dest.lat, dest.lng], 18, { duration: 0.8 });
      return;
    }

    let cancelled = false;
    onRouteInfoRef.current?.("กำลังขอตำแหน่งของคุณ…");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled || !mapRef.current) return;
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        youMarkerRef.current = L.marker([origin.lat, origin.lng], {
          icon: youIcon,
        })
          .addTo(map)
          .bindTooltip("ตำแหน่งของคุณ", { direction: "top" });

        const route = await fetchWalkingRoute(origin, dest);
        if (cancelled || !mapRef.current) return;

        if (route) {
          routeLayerRef.current = L.polyline(route.points, {
            color: "#123b52",
            weight: 5,
            opacity: 0.85,
          }).addTo(map);
          onRouteInfoRef.current?.(formatWalk(route));
        } else {
          routeLayerRef.current = L.polyline(
            [
              [origin.lat, origin.lng],
              [dest.lat, dest.lng],
            ],
            { color: "#123b52", weight: 4, opacity: 0.7, dashArray: "6 8" },
          ).addTo(map);
          onRouteInfoRef.current?.(
            `ระยะเส้นตรง ~${formatDistance(haversineMeters(origin, dest))} (โดยประมาณ)`,
          );
        }
        map.fitBounds(routeLayerRef.current.getBounds().pad(0.25));
      },
      () => {
        if (cancelled) return;
        onRouteInfoRef.current?.(
          "ไม่ได้รับสิทธิ์ตำแหน่ง — กด “เปิดใน Google Maps” เพื่อนำทางจากตำแหน่งจริง",
        );
        map.flyTo([dest.lat, dest.lng], 18, { duration: 0.8 });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, routeToId, buildings]);

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 h-full w-full", className)}
    />
  );
}
