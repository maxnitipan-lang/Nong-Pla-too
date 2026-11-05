// Campus map — Leaflet + OpenStreetMap tiles (free, no key). Draws the building pins,
// a walking route from CampusNavigation (plus a dashed leg from off campus to the gate)
// and the walker's position. Leaflet is loaded by a <script> tag as window.L.
// (Same behaviour as client/src/components/CampusLeafletMap.tsx.)

import { CAMPUS_BUILDINGS } from "/shared/campus.js";
import { buildingLatLng, formatDistance, getBestPosition } from "./directions.js";
import { icon } from "./icons.js";
import { esc } from "./util.js";

const L = window.L;

/** Show "คลาดเคลื่อน ~X" above this GPS accuracy. */
const GPS_WARN_M = 60;
/** Above this accuracy the position is too vague to zoom to — show its circle instead. */
const GPS_VAGUE_M = 300;
/** How far past the outermost buildings the map may be panned (metres). */
const CAMPUS_MARGIN_M = 160;

const COMPASS_TH = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];

/** Every building plus a margin: panning stops at its edge so the map never drifts off. */
function campusBounds(buildings) {
  const points = [...CAMPUS_BUILDINGS, ...buildings]
    .map(buildingLatLng)
    .filter(Boolean)
    .map((p) => L.latLng(p.lat, p.lng));
  const box = L.latLngBounds(points);
  const padLat = CAMPUS_MARGIN_M / 110_574;
  const padLng = CAMPUS_MARGIN_M / (111_320 * Math.cos((box.getCenter().lat * Math.PI) / 180));
  return L.latLngBounds([box.getSouth() - padLat, box.getWest() - padLng], [box.getNorth() + padLat, box.getEast() + padLng]);
}

const meIcon = () =>
  L.divIcon({
    className: "",
    html: '<span class="me-dot"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

export class CampusMap {
  /**
   * @param {HTMLElement} container  element that holds the map (fills it)
   * @param {object} options
   * @param {object[]} options.buildings
   * @param {{lat:number,lng:number}} options.center
   * @param {(id:string)=>void} [options.onSelect]
   * @param {(building:object, active:boolean)=>string} options.markerHtml
   * @param {[number,number]} [options.markerSize]
   * @param {string} [options.userLabel]   permanent label on the walker's dot (kiosk: "คุณอยู่ที่นี่")
   * @param {number} [options.controlsTop] px from the top for the locate button
   * @param {boolean} [options.zoomControl]
   */
  constructor(container, options) {
    this.options = { markerSize: [100, 88], controlsTop: 84, zoomControl: true, ...options };
    this.buildings = options.buildings;
    this.selectedId = null;
    this.route = null;
    this.markers = new Map();
    this.hadRoute = false;
    this.follow = false;

    container.classList.add("campus-map");
    container.innerHTML = `<div class="campus-map-canvas"></div>
      <div class="map-outside" hidden></div>
      <div class="map-locate" style="top:${this.options.controlsTop}px">
        <button type="button" class="map-locate-button" aria-label="ตำแหน่งของฉัน" title="ตำแหน่งของฉัน">${icon("pin")}</button>
        <span class="map-locate-note" hidden></span>
      </div>`;
    this.container = container;
    this.bounds = campusBounds(this.buildings);

    const map = L.map(container.querySelector(".campus-map-canvas"), {
      center: [options.center.lat, options.center.lng],
      zoom: 17,
      zoomControl: false,
      maxBounds: this.bounds,
      maxBoundsViscosity: 1, // hard stop at the edge
    });
    // Can't zoom out past "whole campus fills the view".
    const fitMinZoom = () => map.setMinZoom(Math.max(15, map.getBoundsZoom(this.bounds, false)));
    fitMinZoom();
    map.on("resize", fitMinZoom);
    if (this.options.zoomControl) L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    this.map = map;
    setTimeout(() => {
      map.invalidateSize();
      fitMinZoom();
    }, 200);

    container.querySelector(".map-locate-button").addEventListener("click", () => this.locateMe());
    this.drawMarkers();
    this.showWholeCampus(false);
  }

  destroy() {
    clearTimeout(this.noteTimer);
    this.map.remove();
    this.container.innerHTML = "";
  }

  iconFor(building, active) {
    const [w, h] = this.options.markerSize;
    return L.divIcon({ className: "", html: this.options.markerHtml(building, active), iconSize: [w, h], iconAnchor: [w / 2, h / 2] });
  }

  /** Frame every building that has coordinates. */
  showWholeCampus(animate) {
    const points = this.buildings.map(buildingLatLng).filter(Boolean).map((p) => [p.lat, p.lng]);
    if (points.length) this.map.fitBounds(L.latLngBounds(points).pad(0.15), { animate });
  }

  /** Show only these buildings (search / filter). */
  setBuildings(buildings) {
    const key = buildings.map((b) => `${b.id}@${b.latitude},${b.longitude}`).join("|");
    if (key === this.buildingsKey) return; // same pins (e.g. just a new GPS fix)
    this.buildingsKey = key;
    this.buildings = buildings;
    this.drawMarkers();
  }

  drawMarkers() {
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    for (const building of this.buildings) {
      const point = buildingLatLng(building);
      if (!point) continue;
      const active = building.id === this.selectedId;
      const marker = L.marker([point.lat, point.lng], { icon: this.iconFor(building, active), title: building.name, zIndexOffset: active ? 1000 : 0 }).addTo(this.map);
      marker.on("click", () => this.options.onSelect?.(building.id));
      this.markers.set(building.id, marker);
    }
  }

  /** Highlight a building and fly to it (unless a route is shown). */
  setSelected(id) {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.markers.forEach((marker, markerId) => {
      const building = this.buildings.find((b) => b.id === markerId);
      if (!building) return;
      const active = markerId === id;
      marker.setIcon(this.iconFor(building, active));
      marker.setZIndexOffset(active ? 1000 : 0);
    });
    const building = this.buildings.find((b) => b.id === id);
    const point = building ? buildingLatLng(building) : null;
    if (point && !this.route) this.map.flyTo([point.lat, point.lng], 18, { duration: 0.8 });
  }

  /** Draw (or clear) the walking route and the off-campus approach. */
  setRoute(route, approachPath, follow) {
    this.follow = Boolean(follow);
    if (route === this.route && approachPath === this.approachPath) return;
    this.route = route;
    this.approachPath = approachPath;
    this.routeLayer?.remove();
    this.routeLayer = null;
    if (!route) {
      if (this.hadRoute) this.showWholeCampus(true); // clearing a route returns to the campus
      this.hadRoute = false;
      this.setActiveStep(undefined);
      return;
    }
    this.hadRoute = true;
    const layer = L.layerGroup();
    if (approachPath && approachPath.length >= 2) L.polyline(approachPath, { color: "#1a73e8", weight: 4, opacity: 0.75, dashArray: "8 10" }).addTo(layer);
    L.polyline(route.path, { color: "#ffffff", weight: 10, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(layer);
    L.polyline(route.path, { color: "#1a73e8", weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(layer);
    const end = route.path[route.path.length - 1];
    L.circleMarker(end, { radius: 9, color: "#fff", weight: 3, fillColor: "#e8563f", fillOpacity: 1 }).addTo(layer);
    layer.addTo(this.map);
    this.routeLayer = layer;
    // Frame the on-campus part only — the off-campus approach is outside the locked area.
    if (!this.follow) this.map.fitBounds(L.latLngBounds(route.path).pad(0.15), { animate: true, maxZoom: 19 });
  }

  /** Mark the next turn ahead of the walker. */
  setActiveStep(index) {
    this.stepMarker?.remove();
    this.stepMarker = null;
    if (!this.route || index === undefined || index === null) return;
    const step = this.route.steps[index + 1];
    if (!step) return;
    this.stepMarker = L.circleMarker(step.at, { radius: 7, color: "#1a73e8", weight: 3, fillColor: "#fff", fillOpacity: 1 }).addTo(this.map);
  }

  /** The walker's blue dot + accuracy circle; in live mode keep them centred. */
  setUser(fix) {
    if (!fix) return;
    this.meLayer?.remove();
    const me = L.marker([fix.lat, fix.lng], { icon: meIcon(), zIndexOffset: 2000, interactive: false });
    if (this.options.userLabel) me.bindTooltip(this.options.userLabel, { permanent: true, direction: "top", offset: [0, -10], className: "me-label" });
    this.meLayer = L.layerGroup([L.circle([fix.lat, fix.lng], { radius: fix.accuracy, color: "#1a73e8", weight: 1, fillColor: "#1a73e8", fillOpacity: 0.12, interactive: false }), me]).addTo(this.map);
    if (this.follow && this.bounds.contains([fix.lat, fix.lng])) this.map.setView([fix.lat, fix.lng], Math.max(this.map.getZoom(), 18), { animate: true });
    this.showOutside(fix);
  }

  /** "You are outside campus, ~X away to the …" chip. */
  showOutside(fix) {
    const chip = this.container.querySelector(".map-outside");
    if (!fix || this.bounds.contains([fix.lat, fix.lng])) {
      chip.hidden = true;
      return;
    }
    const c = this.bounds.getCenter();
    const from = L.latLng(fix.lat, fix.lng);
    const dy = c.lat - from.lat;
    const dx = (c.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
    const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360; // you → campus
    const direction = COMPASS_TH[Math.round(((bearing + 180) % 360) / 45) % 8];
    chip.innerHTML = `<span style="transform:rotate(${bearing}deg)">➤</span> คุณอยู่นอกวิทยาลัย · ห่าง ~${esc(formatDistance(from.distanceTo(c)))} ทางทิศ${esc(direction)}`;
    chip.hidden = false;
  }

  note(text) {
    const el = this.container.querySelector(".map-locate-note");
    clearTimeout(this.noteTimer);
    el.textContent = text ?? "";
    el.hidden = !text;
    if (text) this.noteTimer = setTimeout(() => (el.hidden = true), 6000);
  }

  async locateMe() {
    if (this.locating) return;
    this.locating = true;
    this.note("กำลังหาตำแหน่ง…");
    try {
      const fix = await getBestPosition();
      this.setUser(fix);
      if (!this.bounds.contains([fix.lat, fix.lng])) {
        this.note(null); // the "outside campus" chip explains it
        return;
      }
      if (fix.accuracy > GPS_VAGUE_M) this.map.fitBounds(L.latLng(fix.lat, fix.lng).toBounds(fix.accuracy * 2), { animate: true });
      else this.map.flyTo([fix.lat, fix.lng], 18, { duration: 0.8 });
      this.note(fix.accuracy > GPS_WARN_M ? `คลาดเคลื่อน ~${formatDistance(fix.accuracy)}` : null);
    } catch (error) {
      this.note(error instanceof Error ? error.message : "หาตำแหน่งไม่สำเร็จ");
    } finally {
      this.locating = false;
    }
  }
}
