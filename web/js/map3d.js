// 3D campus map — three.js, buildings raised from OpenStreetMap footprints to their
// real number of floors. Same methods as CampusMap (map.js), so the map screen can
// swap one for the other: buildings, selection, walking route, the walker's position.
// (Same behaviour as client/src/components/CampusMap3D.tsx.)
//
// Touch: one finger = pan, two fingers = zoom/rotate/tilt. Mouse: left = pan,
// right = rotate/tilt, wheel = zoom. Tap a building or its label to select it.
//
// Loaded on demand (import("./map3d.js")) so three.js only downloads when 3D is shown.

import { CampusScene, DARK_PALETTE, LIGHT_PALETTE, setFootprints, webglAvailable } from "./campus3d.js";
import { esc } from "./util.js";

let footprintsLoaded = null;
function loadFootprints() {
  footprintsLoaded ??= fetch("/shared/data/campusFootprints.json")
    .then((r) => (r.ok ? r.json() : null))
    .then(setFootprints)
    .catch(() => setFootprints(null)); // still draws campus buildings as boxes
  return footprintsLoaded;
}

const COMPASS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';
const RESET_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
const TOP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="16" height="16" x="4" y="4" rx="2"/></svg>';

/**
 * Create the 3D map in `container`. Resolves to null when WebGL isn't available
 * (the page should keep the 2D map); `options.onUnsupported` is called then too.
 */
export async function createCampusMap3D(container, options) {
  if (!webglAvailable()) {
    options.onUnsupported?.();
    return null;
  }
  await loadFootprints();
  try {
    return new CampusMap3D(container, options);
  } catch (error) {
    console.warn("[map3d] WebGL failed", error);
    container.innerHTML = "";
    options.onUnsupported?.();
    return null;
  }
}

export class CampusMap3D {
  /**
   * @param {HTMLElement} container
   * @param {object} options  buildings, center, onSelect, markerHtml, userLabel, dark, controlsTop, shadows
   */
  constructor(container, options) {
    this.options = { controlsTop: 16, shadows: true, ...options };
    this.container = container;
    this.selectedId = null;
    this.route = null;
    this.routeKey = "";
    this.follow = false;
    this.activeStep = undefined;
    this.labels = [];
    this.firstSelect = true;

    container.classList.add("campus-map3d");
    container.innerHTML = `<canvas class="map3d-canvas"></canvas>
      <div class="map3d-labels"></div>
      <div class="map3d-user" hidden>${this.options.userLabel ? `<span>${esc(this.options.userLabel)}</span>` : ""}</div>
      <div class="map3d-controls" style="top:${this.options.controlsTop}px">
        <button type="button" data-3d="north" title="ทิศเหนือ / มุมมองเริ่มต้น" aria-label="มุมมองเริ่มต้น"><span class="map3d-needle">${COMPASS_SVG}<b>N</b></span></button>
        <button type="button" data-3d="in" aria-label="ซูมเข้า">+</button>
        <button type="button" data-3d="out" aria-label="ซูมออก">−</button>
        <button type="button" data-3d="top" title="มองจากด้านบน" aria-label="มองจากด้านบน">${TOP_SVG}</button>
        <button type="button" data-3d="reset" title="มุมมองเริ่มต้น" aria-label="กลับมุมมองเริ่มต้น">${RESET_SVG}</button>
      </div>
      <div class="map3d-credit">© OpenStreetMap contributors</div>`;
    this.canvas = container.querySelector(".map3d-canvas");
    this.labelHost = container.querySelector(".map3d-labels");
    this.userTag = container.querySelector(".map3d-user");
    this.needle = container.querySelector(".map3d-needle");

    const scene = new CampusScene(this.canvas, {
      origin: options.center,
      palette: options.dark ? DARK_PALETTE : LIGHT_PALETTE,
      shadows: this.options.shadows,
      onPick: (id) => this.options.onSelect?.(id),
    });
    this.scene = scene;
    const pos = { x: 0, y: 0, depth: 0 };
    scene.onFrame = () => this.placeLabels(pos);

    this.resizeObserver = new ResizeObserver(() => scene.resize(this.canvas.clientWidth, this.canvas.clientHeight));
    this.resizeObserver.observe(this.canvas);
    scene.resize(this.canvas.clientWidth, this.canvas.clientHeight);

    container.querySelector(".map3d-controls").addEventListener("click", (event) => {
      const b = event.target.closest("[data-3d]");
      if (!b) return;
      const act = b.dataset["3d"];
      if (act === "north" || act === "reset") scene.resetView();
      else if (act === "in") scene.zoomBy(0.7);
      else if (act === "out") scene.zoomBy(1.4);
      else if (act === "top") scene.topDown();
    });

    this.setBuildings(options.buildings, true);
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.scene.dispose();
    this.container.innerHTML = "";
    this.container.classList.remove("campus-map3d");
  }

  /** Labels follow the roof tops, shrink with distance; where two collide the farther one hides. */
  placeLabels(pos) {
    const scene = this.scene;
    const shown = [];
    const placed = [];
    for (const label of this.labels) {
      if (!scene.toScreenXYZ(label.anchor.x, label.anchor.y + 1.5, label.anchor.z, pos)) {
        label.el.style.display = "none";
        continue;
      }
      placed.push({ label, x: pos.x, y: pos.y, depth: pos.depth, selected: label.ids.includes(this.selectedId ?? "") });
    }
    placed.sort((a, b) => Number(b.selected) - Number(a.selected) || a.depth - b.depth);
    for (const { label, x, y, depth, selected } of placed) {
      const scale = Math.max(0.5, Math.min(1.05, 300 / depth));
      const w = (label.size?.[0] ?? 60) * scale;
      const h = (label.size?.[1] ?? 40) * scale;
      const rect = { l: x - w / 2, t: y - h, r: x + w / 2, b: y };
      const overlap = shown.some((o) => Math.min(o.r, rect.r) - Math.max(o.l, rect.l) > w * 0.35 && Math.min(o.b, rect.b) - Math.max(o.t, rect.t) > h * 0.35);
      if (overlap && !selected) {
        label.el.style.display = "none";
        continue;
      }
      shown.push(rect);
      label.el.style.display = "";
      label.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      label.el.style.zIndex = String(selected ? 100000 : Math.round(100000 - depth * 10));
    }
    const ua = scene.userAnchor();
    if (ua && scene.toScreenXYZ(ua.x, ua.y + 4, ua.z, pos)) {
      this.userTag.hidden = false;
      this.userTag.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
    } else this.userTag.hidden = true;
    this.needle.style.transform = `rotate(${-scene.heading()}deg)`;
  }

  /** The unit a shared label stands for: the selected one if it's inside, else the first. */
  shownId(label) {
    return this.selectedId && label.ids.includes(this.selectedId) ? this.selectedId : label.ids[0];
  }

  setBuildings(buildings, first = false) {
    const key = buildings.map((b) => `${b.id}@${b.latitude},${b.longitude}`).join("|");
    if (key === this.buildingsKey) return;
    this.buildingsKey = key;
    this.buildings = buildings;
    const placed = this.scene.setBuildings(buildings);
    if (first) this.scene.jumpHome();
    this.labelHost.replaceChildren();
    const byId = new Map(buildings.map((b) => [b.id, b]));
    this.labels = [];
    for (const p of placed) {
      // One label per shape: several units in one building share it.
      if (!p.ids.some((id) => byId.has(id))) continue;
      const el = document.createElement("div");
      el.className = "map3d-label";
      const label = { el, ids: p.ids, anchor: { x: p.anchor.x, y: p.anchor.y, z: p.anchor.z } };
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.options.onSelect?.(this.shownId(label));
      });
      this.labelHost.append(el);
      this.labels.push(label);
    }
    this.paintLabels();
    this.scene.setSelected(this.selectedId, false);
  }

  paintLabels() {
    const byId = new Map(this.buildings.map((b) => [b.id, b]));
    for (const label of this.labels) {
      const b = byId.get(this.shownId(label)) ?? label.ids.map((id) => byId.get(id)).find(Boolean);
      if (!b) continue;
      const markup = this.options.markerHtml(b, b.id === this.selectedId);
      if (label.el.dataset.html !== markup) {
        label.el.innerHTML = markup;
        label.el.dataset.html = markup;
        // Unscaled size, for the collision check (measured once per content change).
        const prev = label.el.style.display;
        label.el.style.display = "";
        label.size = [label.el.offsetWidth, label.el.offsetHeight];
        label.el.style.display = prev;
      }
    }
    this.scene.invalidate();
  }

  /** Highlight + fly there (not on the page's first automatic selection, nor while a route is shown). */
  setSelected(id) {
    if (id === this.selectedId && !this.firstSelect) return;
    this.selectedId = id;
    this.scene.setSelected(id ?? undefined, !this.route && !this.firstSelect);
    this.firstSelect = false;
    this.paintLabels();
  }

  /** Live mode only follows the walker on (or right next to) the route — far away, the camera stays on campus. */
  followsUser(fix = this.lastFix) {
    if (!this.follow || !fix || !this.route) return false;
    const mPerLat = 111_320;
    const mPerLng = 111_320 * Math.cos((fix.lat * Math.PI) / 180);
    return this.route.path.some(([lat, lng]) => Math.hypot((lat - fix.lat) * mPerLat, (lng - fix.lng) * mPerLng) < 250);
  }

  setRoute(route, approachPath, follow) {
    this.follow = Boolean(follow);
    this.route = route;
    this.scene.setRoute(route, approachPath, this.activeStep);
    const key = route ? `${route.path[0]?.join()}|${route.path[route.path.length - 1]?.join()}` : "";
    if (route && key !== this.routeKey && !this.followsUser()) this.scene.frameRoute(route);
    this.routeKey = key;
    this.approachPath = approachPath;
  }

  setActiveStep(index) {
    if (index === this.activeStep) return;
    this.activeStep = index ?? undefined;
    this.scene.setRoute(this.route, this.approachPath, this.activeStep);
  }

  setUser(fix) {
    this.lastFix = fix ?? null;
    this.scene.setUser(fix, this.followsUser(fix));
  }

  setDark(dark) {
    this.scene.setPalette(dark ? DARK_PALETTE : LIGHT_PALETTE);
  }

  /** (2D-only feature) kept so the page can call it on either map. */
  locateMe() {}
}
