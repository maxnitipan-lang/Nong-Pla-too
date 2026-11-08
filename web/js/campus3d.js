// (Converted from client/src/lib/campus3d.ts. In the browser "three" and "three/addons/…" come
// from web/vendor/three via the import map in the HTML page.)
/**
 * Three.js scene for the 3D campus map (used by components/CampusMap3D.tsx).
 *
 * Plain three.js, no React: the component owns one CampusScene and pushes data
 * into it (buildings, route, GPS fix, selection). 1 scene unit = 1 metre;
 * x = east, z = south, y = up, origin = the campus map centre.
 *
 * Building shapes come from OpenStreetMap (shared/data/campusFootprints.json,
 * made by scripts/buildCampusFootprintsFromOsm.ts). Each campus building pin is
 * matched to the footprint it stands in; its height comes from `floors`.
 */
import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { building3dStyle } from "../../shared/building3dStyles.js";
import { FOOTBALL_FIELD, pitchMarkings } from "../../shared/campusAreas.js";

// OpenStreetMap outlines of the campus buildings and roads (shared/data/campusFootprints.json).
// The page fetches the file and hands it over with setFootprints() before drawing the scene.
let FOOTPRINTS = { buildings: [], roads: [] };
export function setFootprints(data) {
  FOOTPRINTS = data ?? { buildings: [], roads: [] };
}

/** Storey height used to turn `floors` into metres. */
export const FLOOR_M = 3.6;
/** A pin this close to a footprint (but not inside it) still claims it. */
const MATCH_M = 12;
/** Box used for a building with no OSM footprint near its pin. */
const FALLBACK_SIZE = [18, 12];

export const LIGHT_PALETTE = {
  sky: "#dff3ef",
  ground: "#e6efe9",
  campus: "#cfe8de",
  road: "#ffffff",
  roadMajor: "#f6efe2",
  grass: "#6fbf5f",
  grassLine: "#ffffff",
  context: "#eef1f3",
  contextRoof: "#f7f8f9",
  edge: "#0b3550",
};

export const DARK_PALETTE = {
  sky: "#0b1d2b",
  ground: "#10273a",
  campus: "#143247",
  road: "#2b4a61",
  roadMajor: "#36566d",
  grass: "#2f6b3e",
  grassLine: "#cfe8d6",
  context: "#24405a",
  contextRoof: "#2d4c66",
  edge: "#9fd3e6",
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** lat/lng → local metres (equirectangular around `origin`; plenty for a campus). */
export function makeProjector(origin) {
  const mPerLat = 110_574;
  const mPerLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return (lat, lng) => [(lng - origin.lng) * mPerLng, -(lat - origin.lat) * mPerLat];
}

function pointInPolygon([x, z], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function distToPolygon(p, poly) {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

function polygonCentroid(poly) {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    const f = x0 * z1 - x1 * z0;
    a += f;
    cx += (x0 + x1) * f;
    cz += (z0 + z1) * f;
  }
  if (Math.abs(a) < 1e-6) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

/** Flat prism from a ground polygon (x/z metres), from y=base to y=base+height. Group 0 = roof/floor, group 1 = walls. */
function prism(poly, height, base = 0) {
  // Shape is drawn in (x, -z) so that rotating -90° about X lays it on the ground with the right handedness.
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, base, 0);
  return geo;
}

/**
 * A flat ribbon (road, walking route) along a polyline, `width` metres wide at
 * height y. Joins are mitred (capped), so corners don't crack.
 */
function ribbon(path, width, y) {
  const pts = path.filter((p, i) => i === 0 || Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) > 0.05);
  if (pts.length < 2) return null;
  const half = width / 2;
  const pos = [];
  const idx = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    // Average direction of the two neighbouring segments → mitre normal.
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    let scale = 1;
    if (i > 0 && i < pts.length - 1) {
      const ax = pts[i][0] - prev[0];
      const az = pts[i][1] - prev[1];
      const al = Math.hypot(ax, az) || 1;
      const cos = (ax / al) * dx + (az / al) * dz;
      scale = Math.min(2.5, 1 / Math.max(0.2, cos));
    }
    const nx = -dz * half * scale;
    const nz = dx * half * scale;
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz);
    if (i > 0) {
      const a = (i - 1) * 2;
      // Counter-clockwise seen from above, so the face points up (+y) and isn't culled.
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Split a polyline into dash pieces (for the off-campus "approach" leg). */
function dashes(path, on, off) {
  const out = [];
  let cur = [path[0]];
  let drawing = true;
  let left = on;
  for (let i = 1; i < path.length; i++) {
    let [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    let seg = Math.hypot(bx - ax, bz - az);
    while (seg > left) {
      const t = left / seg;
      const mx = ax + (bx - ax) * t;
      const mz = az + (bz - az) * t;
      if (drawing) {
        cur.push([mx, mz]);
        out.push(cur);
      } else cur = [[mx, mz]];
      drawing = !drawing;
      seg -= left;
      ax = mx;
      az = mz;
      left = drawing ? on : off;
    }
    left -= seg;
    if (drawing) cur.push([bx, bz]);
  }
  if (drawing && cur.length > 1) out.push(cur);
  return out;
}

/** Canvas texture of window rows — walls are UV-mapped in metres, so 1 repeat = 4 m wide × 1 storey. */
function windowTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#b9c8d3";
  g.fillRect(10, 20, 44, 26);
  g.fillStyle = "#d9e3ea";
  g.fillRect(0, 56, 64, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 4, 1 / FLOOR_M);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function disposeObject(obj) {
  obj.traverse(o => {
    const mesh = o;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach(m => m.dispose());
    else mat?.dispose();
  });
}

export function orientedBox(poly) {
  let best = null;
  let bestArea = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    const u = [(x1 - x0) / len, (z1 - z0) / len];
    const v = [-u[1], u[0]];
    let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, z] of poly) {
      const pu = x * u[0] + z * u[1];
      const pv = x * v[0] + z * v[1];
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const c = [cu * u[0] + cv * v[0], cu * u[1] + cv * v[1]];
      const a = (maxU - minU) / 2;
      const b = (maxV - minV) / 2;
      best = a >= b ? { c, u, v, a, b } : { c, u: v, v: [-u[0], -u[1]], a: b, b: a };
    }
  }
  return best ?? { c: poly[0] ?? [0, 0], u: [1, 0], v: [0, 1], a: 1, b: 1 };
}

/** Rotated rectangle polygon (length 2a along u, width 2b along v). */
function boxPoly({ c, u, v, a, b }) {
  return [
    [-a, -b],
    [a, -b],
    [a, b],
    [-a, b],
  ].map(([x, z]) => [c[0] + u[0] * x + v[0] * z, c[1] + u[1] * x + v[1] * z]);
}

function roofRiseFor(style, poly) {
  if (!style || !style.roofType || style.roofType === "flat") return 0;
  const { b } = orientedBox(poly);
  return style.roofType === "gable" ? Math.min(b * 0.45, 4.5) : Math.min(b * 0.55, 7);
}

export function placeBuildings(buildings, project, styleOf = building3dStyle) {
  const shapes = FOOTPRINTS.buildings.map(f => ({ f, poly: f.ring.map(([lat, lng]) => project(lat, lng)) }));
  const claimed = new Map();
  const loose = [];

  for (const b of buildings) {
    const lat = Number(b.latitude);
    const lng = Number(b.longitude);
    if (!b.latitude || !b.longitude || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const p = project(lat, lng);
    // A building with its own size in the style isn't in OSM — always draw its box.
    if (styleOf(b.id).size) {
      loose.push({ b, p });
      continue;
    }
    let best = -1;
    let bestD = MATCH_M;
    shapes.forEach((s, i) => {
      if (s.f.kind === "roof") return; // a shelter roof is never "the building"
      const d = distToPolygon(p, s.poly);
      // Prefer an unclaimed footprint when two are about as close.
      const penalty = claimed.has(i) && d > 0 ? 6 : 0;
      if (d + penalty < bestD) {
        bestD = d + penalty;
        best = i;
      }
    });
    if (best >= 0) claimed.set(best, [...(claimed.get(best) ?? []), b]);
    else loose.push({ b, p });
  }

  const wallHeight = owners => {
    const style = styleOf(owners[0].id);
    if (style.height) return style.height;
    const floors = style.floors ?? Math.max(...owners.map(o => Math.max(1, o.floors || 1)));
    return floors * FLOOR_M + 0.8;
  };

  const placed = [];
  const context = [];
  const angles = [];
  shapes.forEach((s, i) => {
    const owners = claimed.get(i);
    const roofOnly = s.f.kind === "roof";
    const c = polygonCentroid(s.poly);
    if (owners) {
      const style = styleOf(owners[0].id);
      const height = wallHeight(owners);
      const roofRise = roofRiseFor(style, s.poly);
      placed.push({
        ids: owners.map(o => o.id),
        poly: s.poly,
        height,
        roofRise,
        roofOnly: false,
        accent: owners[0].accent,
        style,
        anchor: new THREE.Vector3(c[0], height + roofRise, c[1]),
      });
    } else {
      const levels = s.f.levels ?? (roofOnly ? 1 : s.f.kind === "apartments" ? 3 : 1);
      const height = roofOnly ? 4.2 : levels * FLOOR_M + 0.6;
      context.push({
        ids: [],
        poly: s.poly,
        height,
        roofRise: 0,
        roofOnly,
        style: null,
        anchor: new THREE.Vector3(c[0], height, c[1]),
      });
    }
    if (s.f.kind === "college") {
      const { u } = orientedBox(s.poly);
      angles.push(((Math.atan2(u[1], u[0]) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
    }
  });
  // Buildings OSM doesn't have are turned to the campus grid (the usual angle of the college blocks).
  angles.sort((x, y) => x - y);
  const grid = angles.length ? angles[Math.floor(angles.length / 2)] : 0;
  for (const { b, p } of loose) {
    const style = styleOf(b.id);
    // Open areas (the football field): a pin and label on the ground, no building box.
    if (style.open) {
      placed.push({ ids: [b.id], poly: boxPoly({ c: p, u: [1, 0], v: [0, 1], a: 4, b: 4 }), height: 0.4, roofRise: 0, roofOnly: false, open: true, accent: b.accent, style, anchor: new THREE.Vector3(p[0], 1, p[1]) });
      continue;
    }
    const [len, wid] = style.size ?? FALLBACK_SIZE;
    const angle = grid + ((style.turn ?? 0) * Math.PI) / 180;
    const u = [Math.cos(angle), Math.sin(angle)];
    const poly = boxPoly({ c: p, u, v: [-u[1], u[0]], a: len / 2, b: wid / 2 });
    const height = wallHeight([b]);
    const roofRise = roofRiseFor(style, poly);
    placed.push({
      ids: [b.id],
      poly,
      height,
      roofRise,
      roofOnly: false,
      accent: b.accent,
      style,
      anchor: new THREE.Vector3(p[0], height + roofRise, p[1]),
    });
  }
  return { placed, context };
}

// ---------------------------------------------------------------------------
// Roofs
// ---------------------------------------------------------------------------

/** Triangle soup → geometry with two material groups (0 = roof, 1 = wall/trim). */
function soup(roofTris, sideTris) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([...roofTris, ...sideTris], 3));
  geo.addGroup(0, roofTris.length / 3, 0);
  geo.addGroup(roofTris.length / 3, sideTris.length / 3, 1);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Roof on top of the walls. Pitched/arched roofs are built on the footprint's
 * oriented box (ridge along the long side) with a 1 m overhang; flat roofs are
 * a thin slab slightly bigger than the footprint (the eave).
 */
function roofGeometry(p) {
  const type = p.style?.roofType ?? "flat";
  const H = p.height;
  if (type === "flat" || p.roofRise <= 0) {
    const c = polygonCentroid(p.poly);
    const eave = p.poly.map(([x, z]) => {
      const dx = x - c[0];
      const dz = z - c[1];
      const l = Math.hypot(dx, dz) || 1;
      return [x + (dx / l) * 1.1, z + (dz / l) * 1.1];
    });
    return prism(eave, 0.7, H - 0.2);
  }
  const box = orientedBox(p.poly);
  const o = 1;
  const A = box.a + o;
  const B = box.b + o;
  const r = p.roofRise;
  const at = (x, y, z) => [box.c[0] + box.u[0] * x + box.v[0] * z, y, box.c[1] + box.u[1] * x + box.v[1] * z];
  const tri = (out, ...pts) => pts.forEach(q => out.push(...q));
  const roof = [];
  const ends = [];
  if (type === "gable") {
    const e = H - 0.15; // eave height (a touch below the wall top, so no gap shows)
    tri(roof, at(-A, e, -B), at(A, e, -B), at(A, H + r, 0), at(-A, e, -B), at(A, H + r, 0), at(-A, H + r, 0));
    tri(roof, at(-A, e, B), at(-A, H + r, 0), at(A, H + r, 0), at(-A, e, B), at(A, H + r, 0), at(A, e, B));
    // Gable-end triangles, flush with the walls.
    for (const x of [-box.a, box.a]) tri(ends, at(x, H, -box.b), at(x, H, box.b), at(x, H + r * (box.b / B), 0));
  } else {
    const N = 14;
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI;
      const t1 = ((i + 1) / N) * Math.PI;
      const [z0, y0] = [B * Math.cos(t0), H - 0.15 + r * Math.sin(t0)];
      const [z1, y1] = [B * Math.cos(t1), H - 0.15 + r * Math.sin(t1)];
      tri(roof, at(-A, y0, z0), at(A, y0, z0), at(A, y1, z1), at(-A, y0, z0), at(A, y1, z1), at(-A, y1, z1));
      // Arched end walls (fan from the middle of the wall top).
      for (const x of [-box.a, box.a]) {
        const k = box.b / B;
        tri(
          ends,
          at(x, H - 0.15, 0),
          at(x, H - 0.15 + r * Math.sin(t0) * 0.97, z0 * k),
          at(x, H - 0.15 + r * Math.sin(t1) * 0.97, z1 * k)
        );
      }
    }
  }
  return soup(roof, ends);
}

export class CampusScene {
  renderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 3, 4000);
  controls;
  project;

  palette;
  world = new THREE.Group();
  ground = new THREE.Group();
  buildingGroup = new THREE.Group();
  routeGroup = new THREE.Group();
  userGroup = new THREE.Group();
  hemi = new THREE.HemisphereLight("#ffffff", "#b9cfc6", 1.6);
  sun = new THREE.DirectionalLight("#fff6e8", 2.2);
  windows = windowTexture();
  visuals = [];
  byId = new Map();
  selected;
  tween = null;
  dirty = true;
  raf = 0;
  bounds = new THREE.Box3(new THREE.Vector3(-250, 0, -250), new THREE.Vector3(250, 0, 250));
  home = { target: new THREE.Vector3(), camera: new THREE.Vector3(0, 320, 380) };
  pulse = null;
  lawn = null;
  halo = null;
  down = null;
  opts;
  /** Called after each rendered frame (labels follow the camera). */
  onFrame = null;

  constructor(canvas, opts) {
    this.opts = opts;
    this.palette = opts.palette;
    this.project = makeProjector(opts.origin);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    if (opts.shadows !== false) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.sun.position.set(-160, 260, 120);
    this.sun.castShadow = opts.shadows !== false;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -420;
    this.sun.shadow.camera.right = 420;
    this.sun.shadow.camera.top = 420;
    this.sun.shadow.camera.bottom = -420;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.world.add(this.ground, this.buildingGroup, this.routeGroup, this.userGroup);
    this.scene.add(this.world);

    this.controls = new MapControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 45;
    this.controls.maxDistance = 900;
    this.controls.maxPolarAngle = 1.22; // never look from below the horizon
    this.controls.zoomToCursor = true;
    this.controls.addEventListener("change", () => {
      this.clampTarget();
      this.dirty = true;
    });
    this.controls.addEventListener("start", () => (this.tween = null));

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);

    this.applyPalette();
    this.buildGround();
    this.loop();
  }

  // ----- lifecycle -----------------------------------------------------------

  resize(width, height) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    this.controls.dispose();
    disposeObject(this.world);
    this.windows.dispose();
    this.renderer.dispose();
  }

  invalidate() {
    this.dirty = true;
  }

  setPalette(palette) {
    this.palette = palette;
    this.applyPalette();
    disposeObject(this.ground);
    this.ground.clear();
    this.buildGround();
    this.lawn?.material?.color.set(palette.campus);
    this.paintSelection();
  }

  applyPalette() {
    const dark = this.palette === DARK_PALETTE;
    this.scene.background = new THREE.Color(this.palette.sky);
    this.scene.fog = new THREE.Fog(this.palette.sky, 700, 1800);
    this.hemi.intensity = dark ? 0.9 : 1.6;
    this.hemi.groundColor.set(dark ? "#0d2233" : "#b9cfc6");
    this.sun.intensity = dark ? 0.9 : 2.2;
    this.sun.color.set(dark ? "#9fc4ff" : "#fff6e8");
    this.dirty = true;
  }

  // ----- static layers -----------------------------------------------------------

  buildGround() {
    const groundMat = new THREE.MeshStandardMaterial({ color: this.palette.ground, roughness: 1 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), groundMat);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    this.ground.add(plane);

    // Roads from OSM, merged into two meshes (campus driveways / public roads).
    const minor = [];
    const major = [];
    for (const r of FOOTPRINTS.roads) {
      const isMajor = ["primary", "secondary", "secondary_link", "tertiary"].includes(r.kind);
      const g = ribbon(
        r.path.map(([lat, lng]) => this.project(lat, lng)),
        r.width,
        isMajor ? 0.22 : 0.26
      );
      if (g) (isMajor ? major : minor).push(g);
    }
    for (const [geos, color] of [
      [major, this.palette.roadMajor],
      [minor, this.palette.road],
    ]) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos);
      geos.forEach(g => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
      mesh.receiveShadow = true;
      this.ground.add(mesh);
    }
    this.buildField();
    this.dirty = true;
  }

  /** The football field: grass over the ground, with white pitch markings. */
  buildField() {
    const pts = FOOTBALL_FIELD.map(([lat, lng]) => this.project(lat, lng));
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const grass = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color: this.palette.grass, roughness: 1 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.3; // above the roads (0.22–0.26)
    grass.receiveShadow = true;
    this.ground.add(grass);
    const lines = pitchMarkings()
      .map(line => ribbon(line.map(([lat, lng]) => this.project(lat, lng)), 0.6, 0.34))
      .filter(Boolean);
    if (!lines.length) return;
    const merged = mergeGeometries(lines);
    lines.forEach(g => g.dispose());
    if (merged) this.ground.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: this.palette.grassLine })));
  }

  /** Rebuild every building from the current list (pins/floors may have been edited in admin). */
  setBuildings(buildings) {
    disposeObject(this.buildingGroup); // buildings, lawn and selection ring
    this.buildingGroup.clear();
    this.halo = null;
    this.visuals = [];
    this.byId.clear();

    const { placed, context } = placeBuildings(buildings, this.project);

    // Soft campus "lawn" under the real buildings, so the college reads as one place.
    const box = new THREE.Box3();
    for (const p of placed) for (const [x, z] of p.poly) box.expandByPoint(new THREE.Vector3(x, 0, z));
    if (box.isEmpty()) box.set(new THREE.Vector3(-150, 0, -150), new THREE.Vector3(150, 0, 150));
    const pad = 24;
    const lawnShape = roundedRect(box.min.x - pad, box.min.z - pad, box.max.x + pad, box.max.z + pad, 26);
    const lawn = new THREE.Mesh(
      new THREE.ShapeGeometry(lawnShape),
      new THREE.MeshStandardMaterial({ color: this.palette.campus, roughness: 1 })
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = 0.12;
    this.lawn = lawn;
    lawn.receiveShadow = true;
    this.buildingGroup.add(lawn);

    for (const p of [...context, ...placed]) {
      const isCampus = p.ids.length > 0;
      const showWindows = isCampus && !p.roofOnly && p.style?.windows !== false;
      const wall = new THREE.MeshStandardMaterial({
        roughness: 0.85,
        map: showWindows ? this.windows : null,
        side: THREE.DoubleSide,
      });
      const roof = new THREE.MeshStandardMaterial({
        roughness: 0.7,
        metalness: p.style?.roofType && p.style.roofType !== "flat" ? 0.15 : 0,
        side: THREE.DoubleSide,
      });
      const trim = new THREE.MeshStandardMaterial({ roughness: 0.8 });
      const group = new THREE.Group();
      group.userData.ids = p.ids;
      const parts = [];
      if (p.open) {
        // nothing to build — the grass is drawn with the ground
      } else if (p.roofOnly) {
        parts.push(new THREE.Mesh(prism(p.poly, 0.5, p.height - 0.5), [roof, trim]));
      } else {
        // Walls (group 0 = top cap, hidden under the roof; group 1 = sides).
        parts.push(new THREE.Mesh(prism(p.poly, p.height), [roof, wall]));
        if (isCampus) {
          // Flat roof = eave slab in the trim colour with the roof colour on top; pitched/arched = roof + wall-coloured ends.
          const flat = (p.style?.roofType ?? "flat") === "flat" || p.roofRise <= 0;
          parts.push(new THREE.Mesh(roofGeometry(p), flat ? [roof, trim] : [roof, wall]));
          // A low base band in the trim colour (orange stripes, mint plinth, ...).
          const c = polygonCentroid(p.poly);
          const band = p.poly.map(([x, z]) => {
            const dx = x - c[0];
            const dz = z - c[1];
            const l = Math.hypot(dx, dz) || 1;
            return [x + (dx / l) * 0.12, z + (dz / l) * 0.12];
          });
          parts.push(new THREE.Mesh(prism(band, 0.9, 0), [trim, trim]));
        }
      }
      const edges = [];
      for (const m of parts) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.ids = p.ids;
        const e = new THREE.LineSegments(
          new THREE.EdgesGeometry(m.geometry, 30),
          new THREE.LineBasicMaterial({ color: this.palette.edge, transparent: true, opacity: isCampus ? 0.25 : 0.12 })
        );
        m.add(e);
        edges.push(e);
        group.add(m);
      }
      this.buildingGroup.add(group);
      const visual = { placed: p, mesh: group, wall, roof, trim, edges };
      this.visuals.push(visual);
      for (const id of p.ids) this.byId.set(id, visual);
    }

    // Camera limits + the "home" view framing the campus.
    this.bounds = box.clone().expandByScalar(160);
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 120);
    this.home.target.copy(center);
    this.home.camera.set(center.x - size * 0.35, size * 0.95, center.z + size * 0.95);
    this.paintSelection();
    this.dirty = true;
    return placed;
  }

  // ----- selection / camera ---------------------------------------------------

  setSelected(id, fly = true) {
    this.selected = id;
    this.paintSelection();
    const v = id ? this.byId.get(id) : undefined;
    if (v && fly) this.flyTo(new THREE.Vector3(v.placed.anchor.x, 0, v.placed.anchor.z), 280);
  }

  /** Base colours: the photo colours (shared/building3dStyles.ts), toned down at night. */
  colorsFor(p) {
    if (!p.style) {
      const wall = new THREE.Color(this.palette.context);
      const roof = new THREE.Color(this.palette.contextRoof);
      return { wall, roof, trim: roof.clone() };
    }
    const night = this.palette === DARK_PALETTE ? 0.45 : 0;
    const c = hex => new THREE.Color(hex).lerp(new THREE.Color(this.palette.sky), night);
    return { wall: c(p.style.wall), roof: c(p.style.roof), trim: c(p.style.trim ?? p.style.roof) };
  }

  paintSelection() {
    const sel = this.selected ? this.byId.get(this.selected) : undefined;
    for (const v of this.visuals) {
      const active = v === sel;
      const isCampus = v.placed.ids.length > 0;
      const dim = !!sel && !active && isCampus;
      const base = this.colorsFor(v.placed);
      const glow = new THREE.Color(v.placed.accent ?? "#1a73e8");
      for (const [mat, color] of [
        [v.wall, base.wall],
        [v.roof, base.roof],
        [v.trim, base.trim],
      ]) {
        mat.color.copy(color);
        // The selected building keeps its real colours but glows in its department colour.
        mat.emissive.copy(active ? glow : new THREE.Color("#000000"));
        mat.emissiveIntensity = active ? 0.08 : 0;
        if (mat.transparent !== dim) {
          mat.transparent = dim;
          mat.needsUpdate = true;
        }
        mat.opacity = dim ? 0.86 : 1;
      }
      for (const e of v.edges) {
        const edge = e.material;
        edge.opacity = active ? 0.95 : isCampus ? 0.25 : 0.12;
        edge.color.set(active ? glow : this.palette.edge);
      }
    }
    // Department-coloured ring on the ground around the selected building.
    if (this.halo) {
      disposeObject(this.halo);
      this.halo.removeFromParent();
      this.halo = null;
    }
    if (sel) {
      const c = polygonCentroid(sel.placed.poly);
      const ring = sel.placed.poly.map(([x, z]) => {
        const dx = x - c[0];
        const dz = z - c[1];
        const l = Math.hypot(dx, dz) || 1;
        return [x + (dx / l) * 3, z + (dz / l) * 3];
      });
      const g = ribbon([...ring, ring[0], ring[1]], 1.8, 0.3);
      if (g) {
        this.halo = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: sel.placed.accent ?? "#1a73e8" }));
        this.buildingGroup.add(this.halo);
      }
    }
    this.dirty = true;
  }

  /** Smoothly move the view to look at `target` from `distance` m, keeping the current heading. */
  flyTo(target, distance, ms = 900) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (distance) offset.setLength(distance);
    this.tween = {
      from: this.controls.target.clone(),
      to: target.clone(),
      camFrom: this.camera.position.clone(),
      camTo: target.clone().add(offset),
      t0: performance.now(),
      ms,
    };
    this.dirty = true;
  }

  resetView(ms = 900) {
    this.tween = {
      from: this.controls.target.clone(),
      to: this.home.target.clone(),
      camFrom: this.camera.position.clone(),
      camTo: this.home.camera.clone(),
      t0: performance.now(),
      ms,
    };
    this.dirty = true;
  }

  /** Look straight down (map-like), keeping the current target. */
  topDown(ms = 700) {
    const t = this.controls.target.clone();
    const d = Math.max(220, this.camera.position.distanceTo(t));
    this.tween = {
      from: t.clone(),
      to: t,
      camFrom: this.camera.position.clone(),
      camTo: t.clone().add(new THREE.Vector3(0, d, 0.01)),
      t0: performance.now(),
      ms,
    };
    this.dirty = true;
  }

  zoomBy(factor) {
    const t = this.controls.target;
    const offset = this.camera.position.clone().sub(t);
    const len = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.flyTo(t.clone(), len, 300);
  }

  jumpHome() {
    this.controls.target.copy(this.home.target);
    this.camera.position.copy(this.home.camera);
    this.controls.update();
    this.dirty = true;
  }

  /** Compass heading of the camera (0 = looking north), degrees. */
  heading() {
    const d = this.controls.target.clone().sub(this.camera.position);
    return (Math.atan2(d.x, -d.z) * 180) / Math.PI;
  }

  clampTarget() {
    const t = this.controls.target;
    const c = t
      .clone()
      .clamp(
        new THREE.Vector3(this.bounds.min.x, 0, this.bounds.min.z),
        new THREE.Vector3(this.bounds.max.x, 0, this.bounds.max.z)
      );
    if (!c.equals(t)) {
      const delta = c.clone().sub(t);
      t.add(delta);
      this.camera.position.add(delta);
    }
  }

  // ----- route + walker ---------------------------------------------------------

  setRoute(route, approach, activeStep) {
    disposeObject(this.routeGroup);
    this.routeGroup.clear();
    this.pulse = null;
    const toXZ = path => path.map(([lat, lng]) => this.project(lat, lng));

    if (approach && approach.length > 1) {
      const geos = dashes(toXZ(approach), 5, 4)
        .map(d => ribbon(d, 2.2, 0.5))
        .filter(g => !!g);
      const merged = geos.length ? mergeGeometries(geos) : null;
      geos.forEach(g => g.dispose());
      if (merged)
        this.routeGroup.add(
          new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: "#1a73e8", transparent: true, opacity: 0.8 }))
        );
    }
    if (route && route.path.length > 1) {
      const xz = toXZ(route.path);
      const casing = ribbon(xz, 4.4, 0.55);
      const line = ribbon(xz, 2.8, 0.62);
      if (casing) this.routeGroup.add(new THREE.Mesh(casing, new THREE.MeshBasicMaterial({ color: "#ffffff" })));
      if (line) this.routeGroup.add(new THREE.Mesh(line, new THREE.MeshBasicMaterial({ color: "#1a73e8" })));

      const [ex, ez] = xz[xz.length - 1];
      const pin = new THREE.Group();
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 9, 10),
        new THREE.MeshStandardMaterial({ color: "#ffffff" })
      );
      stem.position.y = 4.5;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(2.4, 24, 16),
        new THREE.MeshStandardMaterial({ color: "#e8563f", emissive: "#e8563f", emissiveIntensity: 0.25 })
      );
      head.position.y = 10;
      head.castShadow = true;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3, 4.4, 40),
        new THREE.MeshBasicMaterial({ color: "#e8563f", transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.5;
      this.pulse = ring;
      pin.add(stem, head, ring);
      pin.position.set(ex, 0, ez);
      this.routeGroup.add(pin);

      const step = activeStep != null ? route.steps[activeStep] : undefined;
      if (step) {
        const [sx, sz] = this.project(step.at[0], step.at[1]);
        const dot = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.2, 0.5, 28),
          new THREE.MeshBasicMaterial({ color: "#ffffff" })
        );
        const inner = new THREE.Mesh(
          new THREE.CylinderGeometry(1.3, 1.3, 0.6, 28),
          new THREE.MeshBasicMaterial({ color: "#1a73e8" })
        );
        dot.position.set(sx, 0.6, sz);
        inner.position.set(sx, 0.65, sz);
        this.routeGroup.add(dot, inner);
      }
    }
    this.dirty = true;
  }

  /** Fit the whole route on screen (called once when a new route arrives). */
  frameRoute(route) {
    const box = new THREE.Box3();
    for (const [lat, lng] of route.path) {
      const [x, z] = this.project(lat, lng);
      box.expandByPoint(new THREE.Vector3(x, 0, z));
    }
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const dist = THREE.MathUtils.clamp(Math.max(size.x, size.z) * 1.5, 140, 700);
    this.flyTo(box.getCenter(new THREE.Vector3()), dist);
  }

  setUser(fix, follow) {
    disposeObject(this.userGroup);
    this.userGroup.clear();
    if (!fix) {
      this.dirty = true;
      return;
    }
    const [x, z] = this.project(fix.lat, fix.lng);
    const acc = new THREE.Mesh(
      new THREE.CircleGeometry(Math.min(Math.max(fix.accuracy, 4), 300), 48),
      new THREE.MeshBasicMaterial({ color: "#1a73e8", transparent: true, opacity: 0.14, depthWrite: false })
    );
    acc.rotation.x = -Math.PI / 2;
    acc.position.set(x, 0.5, z);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 0.7, 32),
      new THREE.MeshStandardMaterial({ color: "#ffffff" })
    );
    ring.position.set(x, 0.7, z);
    const dot = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 0.9, 32),
      new THREE.MeshStandardMaterial({ color: "#1a73e8", emissive: "#1a73e8", emissiveIntensity: 0.35 })
    );
    dot.position.set(x, 0.8, z);
    this.userGroup.add(acc, ring, dot);
    this.userGroup.userData.anchor = new THREE.Vector3(x, 2, z);
    if (follow) this.flyTo(new THREE.Vector3(x, 0, z), undefined, 600);
    this.dirty = true;
  }

  userAnchor() {
    return this.userGroup.userData.anchor ?? null;
  }

  // ----- picking ---------------------------------------------------------------

  onPointerDown = e => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  onPointerUp = e => {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // that was a drag
    const id = this.pick(e.clientX, e.clientY);
    if (id) this.opts.onPick?.(id);
  };

  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(
      this.visuals.map(v => v.mesh),
      true
    );
    for (const h of hits) {
      if (h.object.isLineSegments) continue;
      const ids = h.object.userData.ids;
      if (ids?.length) return ids[0];
    }
    return undefined;
  }

  tmp = new THREE.Vector3();

  /** Scene point → CSS pixels inside the canvas; false when it's behind the camera. */
  toScreenXYZ(x, y, z, out) {
    const v = this.tmp.set(x, y, z);
    out.depth = this.camera.position.distanceTo(v);
    v.project(this.camera);
    if (v.z > 1 || v.z < -1) return false;
    const el = this.renderer.domElement;
    out.x = ((v.x + 1) / 2) * el.clientWidth;
    out.y = ((1 - v.y) / 2) * el.clientHeight;
    return true;
  }

  // ----- loop --------------------------------------------------------------------

  loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.controls.target.lerpVectors(this.tween.from, this.tween.to, e);
      this.camera.position.lerpVectors(this.tween.camFrom, this.tween.camTo, e);
      if (k >= 1) this.tween = null;
      this.dirty = true;
    }
    if (this.pulse) {
      const s = 1 + ((now / 1200) % 1) * 0.9;
      this.pulse.scale.setScalar(s);
      this.pulse.material.opacity = 0.6 * (1 - ((now / 1200) % 1));
      this.dirty = true;
    }
    // Damping keeps moving for a moment after the finger lifts; update() returns true while it does.
    if (this.controls.update()) this.dirty = true;
    if (!this.dirty || document.hidden) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  };
}

function roundedRect(x0, z0, x1, z1, r) {
  // Drawn in (x, -z), same convention as prism().
  const s = new THREE.Shape();
  const [a, b, c, d] = [x0, -z1, x1, -z0];
  s.moveTo(a + r, b);
  s.lineTo(c - r, b);
  s.quadraticCurveTo(c, b, c, b + r);
  s.lineTo(c, d - r);
  s.quadraticCurveTo(c, d, c - r, d);
  s.lineTo(a + r, d);
  s.quadraticCurveTo(a, d, a, d - r);
  s.lineTo(a, b + r);
  s.quadraticCurveTo(a, b, a + r, b);
  return s;
}

/** True when this browser/PC can draw WebGL at all (old kiosk PCs sometimes can't). */
export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
