import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, Loader2, Navigation2 } from "lucide-react";
import { CAMPUS_BUILDINGS, type CampusBuilding } from "@shared/campus";
import type { CampusRoute, LatLngTuple } from "@shared/walkNetwork";
import {
  buildingLatLng,
  formatDistance,
  getBestPosition,
  type GpsFix,
  type LatLng,
} from "@/lib/directions";
import { cn } from "@/lib/utils";

/**
 * Real, free campus map — Leaflet + OpenStreetMap tiles (no API key, no
 * billing). Draws a campus walking route computed by useCampusNavigation
 * (`route`, plus a dashed/street `approachPath` from off campus to the gate)
 * and the walker's live position.
 */
/** Show "คลาดเคลื่อน ~X" above this GPS accuracy. */
const GPS_WARN_M = 60;
/** Above this accuracy the position is too vague to zoom to — show its circle instead. */
const GPS_VAGUE_M = 300;

/** How far past the outermost buildings the map may be panned (metres). */
const CAMPUS_MARGIN_M = 160;

/**
 * The area the map is locked to: every building (built-in + current list) plus a
 * margin. Panning stops at its edge and zooming out stops once it fills the view,
 * so the map never drifts off to the rest of the province.
 */
function campusBounds(buildings: CampusBuilding[]): L.LatLngBounds {
  const points = [...CAMPUS_BUILDINGS, ...buildings]
    .map((b) => buildingLatLng(b))
    .filter((p): p is LatLng => p !== null)
    .map((p) => L.latLng(p.lat, p.lng));
  const box = L.latLngBounds(points);
  const padLat = CAMPUS_MARGIN_M / 110_574;
  const padLng = CAMPUS_MARGIN_M / (111_320 * Math.cos((box.getCenter().lat * Math.PI) / 180));
  return L.latLngBounds(
    [box.getSouth() - padLat, box.getWest() - padLng],
    [box.getNorth() + padLat, box.getEast() + padLng],
  );
}

const COMPASS_TH = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];

function pinIcon(color: string, active: boolean) {
  const w = active ? 32 : 24;
  const h = active ? 44 : 34;
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

const meIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:18px;height:18px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 2px rgba(26,115,232,.35),0 2px 6px rgba(0,0,0,.3)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

type CampusLeafletMapProps = {
  buildings: CampusBuilding[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  center: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  /** Draw one marker per building. Set false to use this only as a plain basemap backdrop (e.g. under a custom pin overlay). */
  showMarkers?: boolean;
  /**
   * Custom marker HTML (e.g. a department-logo badge) instead of the default
   * colored pin. Still placed at the building's real lat/lng.
   */
  renderMarkerHtml?: (building: CampusBuilding, active: boolean) => string;
  /** [width, height] of the custom marker icon, anchored at its center. Ignored unless renderMarkerHtml is set. */
  markerIconSize?: [number, number];
  /** Walking route to draw (from useCampusNavigation). */
  route?: CampusRoute | null;
  /** Leg from off campus to the gate (street route or straight line), drawn dashed. */
  approachPath?: LatLngTuple[] | null;
  /** The walker's position (blue dot + accuracy circle). */
  userFix?: GpsFix | null;
  /** Live navigation: keep the walker centred. */
  followUser?: boolean;
  /** Index of the current step — its turn point is highlighted. */
  activeStep?: number;
  /** Show the "ตำแหน่งของฉัน" button (default true). */
  showLocateButton?: boolean;
};

export function CampusLeafletMap({
  buildings,
  selectedId,
  onSelect,
  center,
  zoom = 17,
  className,
  showMarkers = true,
  renderMarkerHtml,
  markerIconSize = [100, 88],
  route,
  approachPath,
  userFix,
  followUser = false,
  activeStep,
  showLocateButton = true,
}: CampusLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const meLayerRef = useRef<L.LayerGroup | null>(null);
  const stepMarkerRef = useRef<L.CircleMarker | null>(null);
  const hadRouteRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const renderMarkerHtmlRef = useRef(renderMarkerHtml);
  renderMarkerHtmlRef.current = renderMarkerHtml;
  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const boundsRef = useRef<L.LatLngBounds>(campusBounds(buildings));

  const iconFor = (building: CampusBuilding, active: boolean) => {
    const custom = renderMarkerHtmlRef.current;
    if (!custom) return pinIcon(building.accent || "#123b52", active);
    const [w, h] = markerIconSize;
    return L.divIcon({ className: "", html: custom(building, active), iconSize: [w, h], iconAnchor: [w / 2, h / 2] });
  };

  /** Frame every building that has coordinates (the "campus view"). */
  const showWholeCampus = (animate: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const points = buildingsRef.current
      .map((b) => buildingLatLng(b))
      .filter((p): p is LatLng => p !== null)
      .map((p) => [p.lat, p.lng] as L.LatLngTuple);
    if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.15), { animate });
    else map.setView([center.lat, center.lng], zoom, { animate });
  };

  /** Blue "you are here" dot + accuracy circle. */
  const drawMe = (fix: GpsFix) => {
    const map = mapRef.current;
    if (!map) return;
    meLayerRef.current?.remove();
    meLayerRef.current = L.layerGroup([
      L.circle([fix.lat, fix.lng], {
        radius: fix.accuracy,
        color: "#1a73e8",
        weight: 1,
        fillColor: "#1a73e8",
        fillOpacity: 0.12,
        interactive: false,
      }),
      L.marker([fix.lat, fix.lng], { icon: meIcon, zIndexOffset: 2000, interactive: false }),
    ]).addTo(map);
  };

  // 1. Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const bounds = boundsRef.current;
    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
      maxBounds: bounds,
      maxBoundsViscosity: 1, // hard stop at the edge
    });
    // Can't zoom out past "whole campus fills the view" — recomputed when the box resizes.
    const fitMinZoom = () => map.setMinZoom(Math.max(15, map.getBoundsZoom(bounds, false)));
    fitMinZoom();
    map.on("resize", fitMinZoom);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
    setReady(true);
    setTimeout(() => {
      map.invalidateSize();
      fitMinZoom();
    }, 200);
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      routeLayerRef.current = null;
      meLayerRef.current = null;
    };
    // center/zoom are the initial camera only — not dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. (Re)build markers when the building list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    if (!showMarkers) return;

    for (const building of buildings) {
      const point = buildingLatLng(building);
      if (!point) continue;
      const marker = L.marker([point.lat, point.lng], {
        icon: iconFor(building, building.id === selectedId),
        title: building.name,
        zIndexOffset: building.id === selectedId ? 1000 : 0,
      })
        .addTo(map)
        .bindTooltip(building.shortName, { direction: "top", offset: [0, -34] });
      marker.on("click", () => onSelectRef.current?.(building.id));
      markersRef.current.set(building.id, marker);
    }

    if (!selectedId && !route) showWholeCampus(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, buildings, showMarkers]);

  // 3. On selection: restyle markers and fly to the chosen building.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !showMarkers) return;

    markersRef.current.forEach((marker, id) => {
      const building = buildings.find((item) => item.id === id);
      if (!building) return;
      const active = id === selectedId;
      marker.setIcon(iconFor(building, active));
      marker.setZIndexOffset(active ? 1000 : 0);
    });

    const selected = buildings.find((building) => building.id === selectedId);
    const point = selected ? buildingLatLng(selected) : null;
    if (point && !route) map.flyTo([point.lat, point.lng], 18, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId, buildings, showMarkers]);

  // 4. Draw the route (casing + line), the off-campus approach and the destination.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    routeLayerRef.current?.remove();
    routeLayerRef.current = null;

    if (!route) {
      // Clearing a route returns the camera to the campus.
      if (hadRouteRef.current) showWholeCampus(true);
      hadRouteRef.current = false;
      return;
    }
    hadRouteRef.current = true;

    const layer = L.layerGroup();
    if (approachPath && approachPath.length >= 2) {
      L.polyline(approachPath, { color: "#1a73e8", weight: 4, opacity: 0.75, dashArray: "8 10" }).addTo(layer);
    }
    L.polyline(route.path, { color: "#ffffff", weight: 10, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(layer);
    L.polyline(route.path, { color: "#1a73e8", weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(layer);
    const end = route.path[route.path.length - 1];
    L.circleMarker(end, { radius: 9, color: "#fff", weight: 3, fillColor: "#e8563f", fillOpacity: 1 }).addTo(layer);
    layer.addTo(map);
    routeLayerRef.current = layer;

    // Frame the on-campus part only — the off-campus approach is outside the locked area.
    if (!followUser) map.fitBounds(L.latLngBounds(route.path).pad(0.15), { animate: true, maxZoom: 19 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, route, approachPath]);

  // 5. Highlight the current step's turn point.
  useEffect(() => {
    const map = mapRef.current;
    stepMarkerRef.current?.remove();
    stepMarkerRef.current = null;
    if (!ready || !map || !route || activeStep === undefined) return;
    const step = route.steps[activeStep + 1]; // the next maneuver ahead of the walker
    if (!step) return;
    stepMarkerRef.current = L.circleMarker(step.at, { radius: 7, color: "#1a73e8", weight: 3, fillColor: "#fff", fillOpacity: 1 }).addTo(map);
  }, [ready, route, activeStep]);

  // 6. The walker's position; in live mode keep them centred.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !userFix) return;
    drawMe(userFix);
    if (followUser && boundsRef.current.contains([userFix.lat, userFix.lng])) {
      map.setView([userFix.lat, userFix.lng], Math.max(map.getZoom(), 18), { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userFix, followUser]);

  const locateMe = async () => {
    if (locating) return;
    setLocating(true);
    setLocateNote("กำลังหาตำแหน่ง…");
    try {
      const fix = await getBestPosition();
      const map = mapRef.current;
      if (!map) return;
      drawMe(fix);
      if (!boundsRef.current.contains([fix.lat, fix.lng])) {
        setLocateNote(null); // the "outside campus" chip explains it
        setOutsideFix(fix);
        return;
      }
      setOutsideFix(null);
      if (fix.accuracy > GPS_VAGUE_M) {
        map.fitBounds(L.latLng(fix.lat, fix.lng).toBounds(fix.accuracy * 2), { animate: true });
      } else {
        map.flyTo([fix.lat, fix.lng], 18, { duration: 0.8 });
      }
      setLocateNote(fix.accuracy > GPS_WARN_M ? `คลาดเคลื่อน ~${formatDistance(fix.accuracy)}` : null);
    } catch (error) {
      setLocateNote(error instanceof Error ? error.message : "หาตำแหน่งไม่สำเร็จ");
    } finally {
      setLocating(false);
    }
  };

  // Where the walker is when they're outside the locked campus area (shown as a chip).
  const [outsideFix, setOutsideFix] = useState<GpsFix | null>(null);
  const shownFix = userFix ?? outsideFix;
  const outside = shownFix && !boundsRef.current.contains([shownFix.lat, shownFix.lng])
    ? (() => {
        const c = boundsRef.current.getCenter();
        const from = L.latLng(shownFix.lat, shownFix.lng);
        const dy = c.lat - from.lat;
        const dx = (c.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
        const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360; // you → campus
        const fromCampus = (bearing + 180) % 360; // campus → you
        return { distance: from.distanceTo(c), direction: COMPASS_TH[Math.round(fromCampus / 45) % 8], bearing };
      })()
    : null;

  // Auto-hide the locate note after a while.
  useEffect(() => {
    if (!locateNote || locating) return;
    const timer = window.setTimeout(() => setLocateNote(null), 6000);
    return () => window.clearTimeout(timer);
  }, [locateNote, locating]);

  return (
    <div className={cn("absolute inset-0 h-full w-full", className)}>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {outside && (
        <div className="pointer-events-none absolute bottom-14 left-1/2 z-[1000] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-[11px] font-black text-[var(--ink)] shadow-lg">
          <Navigation2 size={14} className="shrink-0 text-[#1a73e8]" style={{ transform: `rotate(${outside.bearing}deg)` }} />
          คุณอยู่นอกวิทยาลัย · ห่าง ~{formatDistance(outside.distance)} ทางทิศ{outside.direction}
        </div>
      )}
      {showLocateButton && (
        <div className="pointer-events-none absolute right-[10px] top-[84px] z-[1000] flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={locateMe}
            className="pointer-events-auto flex h-[34px] w-[34px] items-center justify-center rounded-[4px] border-2 border-[rgba(0,0,0,0.2)] bg-white text-[#1a73e8] shadow-sm hover:bg-[#f4f4f4]"
            aria-label="ตำแหน่งของฉัน"
            title="ตำแหน่งของฉัน"
          >
            {locating ? <Loader2 size={17} className="animate-spin" /> : <LocateFixed size={17} />}
          </button>
          {locateNote && (
            <span className="max-w-[220px] rounded-lg bg-white/95 px-2.5 py-1.5 text-right text-[10px] font-bold leading-4 text-[var(--ink)] shadow">
              {locateNote}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
