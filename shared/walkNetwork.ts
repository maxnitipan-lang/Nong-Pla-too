// Campus walkway network + turn-by-turn routing (shared by server, client and admin).
//
// The college draws its real walkways as a graph: nodes (junctions, bends,
// building entrances, gates) joined by straight edges. Routing is Dijkstra over
// that graph, so the route follows real paths instead of cutting across fields
// the way a street router (ORS/OSM) or a straight line would. It runs entirely
// in the browser — works offline on the kiosk and needs no API key.

export type WalkNode = {
  id: string;
  lat: number;
  lng: number;
  /** Landmark name used in instructions: "เลี้ยวซ้าย ที่<name>". */
  name?: string;
  /** Set on a building's entrance node; routing to that building ends here. */
  buildingId?: string;
  /** A way in/out of the campus — people outside are routed to the nearest gate. */
  gate?: boolean;
};

export type WalkEdge = {
  a: string;
  b: string;
  /** Path name, e.g. "ทางเดินหน้าอาคาร 3" ("เลี้ยวซ้ายเข้า<name>"). */
  name?: string;
};

export type WalkNetwork = {
  version: 1;
  nodes: WalkNode[];
  edges: WalkEdge[];
};

export type LatLng = { lat: number; lng: number };
export type LatLngTuple = [number, number];

export type Maneuver =
  | "depart"
  | "straight"
  | "slight-left"
  | "left"
  | "sharp-left"
  | "slight-right"
  | "right"
  | "sharp-right"
  | "uturn"
  | "arrive";

export type RouteStep = {
  maneuver: Maneuver;
  /** Thai instruction, e.g. "เลี้ยวซ้าย ที่โรงอาหาร". */
  instruction: string;
  /** Metres to walk after this maneuver, until the next one. */
  distance: number;
  /** Where the maneuver happens. */
  at: LatLngTuple;
  /** Distance along the route (m) where this step starts — for live progress. */
  startAlong: number;
};

export type CampusRoute = {
  /** Walkable path as [lat, lng] (Leaflet order). */
  path: LatLngTuple[];
  /** Metres along `path`. */
  distance: number;
  /** Seconds at walking pace. */
  duration: number;
  steps: RouteStep[];
  /** The user is off campus: `path` starts at this gate / network point instead of their position. */
  offCampus?: { entry: LatLng; gateName?: string; straightDistance: number };
};

/** Average walking pace (m/s), ~4.5 km/h. */
export const WALK_SPEED_MPS = 1.25;
/** Farther than this from any walkway = the user is not on campus. */
export const OFF_CAMPUS_M = 120;
/** A building point this close to the path end is appended as the last leg. */
const BUILDING_LEG_MAX_M = 60;
/** Bearing change (degrees) that counts as a turn. */
const TURN_MIN_DEG = 30;
/** Segments shorter than this are merged into their neighbours before turn detection. */
const TINY_SEGMENT_M = 4;
/** Distance over which the heading into/out of a vertex is measured. */
const LOOK_M = 12;
/** Turns closer together than this are reported as one. */
const MERGE_TURNS_M = 10;

// ---------------------------------------------------------------------------
// Geometry (local equirectangular projection — plenty accurate for a campus)
// ---------------------------------------------------------------------------

const M_PER_DEG_LAT = 110_574;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

export function distanceM(a: LatLng, b: LatLng): number {
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT;
  const dx = (b.lng - a.lng) * mPerDegLng((a.lat + b.lat) / 2);
  return Math.hypot(dx, dy);
}

/** Compass bearing a → b in degrees, 0 = north, clockwise. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT;
  const dx = (b.lng - a.lng) * mPerDegLng((a.lat + b.lat) / 2);
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Closest point to `p` on segment a–b, with t ∈ [0,1] and the distance in metres. */
export function projectOnSegment(p: LatLng, a: LatLng, b: LatLng) {
  const k = mPerDegLng(p.lat);
  const ax = a.lng * k, ay = a.lat * M_PER_DEG_LAT;
  const bx = b.lng * k, by = b.lat * M_PER_DEG_LAT;
  const px = p.lng * k, py = p.lat * M_PER_DEG_LAT;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return { t, point, distance: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) };
}

const toLatLng = ([lat, lng]: LatLngTuple): LatLng => ({ lat, lng });
const toTuple = (p: LatLng): LatLngTuple => [p.lat, p.lng];

export function polylineLength(path: LatLngTuple[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceM(toLatLng(path[i - 1]), toLatLng(path[i]));
  return total;
}

/** Where `p` falls along a polyline: distance along it, and how far off it is. */
export function locateOnPath(path: LatLngTuple[], p: LatLng): { along: number; offBy: number } {
  let best = { along: 0, offBy: Infinity };
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const a = toLatLng(path[i - 1]);
    const b = toLatLng(path[i]);
    const seg = distanceM(a, b);
    const hit = projectOnSegment(p, a, b);
    if (hit.distance < best.offBy) best = { along: walked + seg * hit.t, offBy: hit.distance };
    walked += seg;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

type Adjacent = { to: string; w: number; name?: string };

function buildGraph(network: WalkNetwork) {
  const nodes = new Map(network.nodes.map((n) => [n.id, n]));
  const adj = new Map<string, Adjacent[]>();
  const link = (a: string, b: string, w: number, name?: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, w, name });
  };
  for (const e of network.edges) {
    const a = nodes.get(e.a);
    const b = nodes.get(e.b);
    if (!a || !b || a.id === b.id) continue;
    const w = distanceM(a, b);
    link(a.id, b.id, w, e.name);
    link(b.id, a.id, w, e.name);
  }
  return { nodes, adj };
}

type Snap = { a: WalkNode; b: WalkNode; t: number; point: LatLng; distance: number; name?: string };

/** Nearest point on any edge. */
export function snapToNetwork(network: WalkNetwork, p: LatLng): Snap | null {
  const nodes = new Map(network.nodes.map((n) => [n.id, n]));
  let best: Snap | null = null;
  for (const e of network.edges) {
    const a = nodes.get(e.a);
    const b = nodes.get(e.b);
    if (!a || !b) continue;
    const hit = projectOnSegment(p, a, b);
    if (!best || hit.distance < best.distance) best = { a, b, t: hit.t, point: hit.point, distance: hit.distance, name: e.name };
  }
  return best;
}

/** Dijkstra from `start` to the cheapest of `targets`. Small graphs → a linear scan beats a heap. */
function shortestPath(adj: Map<string, Adjacent[]>, start: string, targets: Set<string>) {
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, { from: string; name?: string }>();
  const open = new Set<string>([start]);
  const closed = new Set<string>();
  while (open.size) {
    let u = "";
    let du = Infinity;
    open.forEach((id) => {
      const d = dist.get(id)!;
      if (d < du) { du = d; u = id; }
    });
    open.delete(u);
    closed.add(u);
    if (targets.has(u)) {
      const ids = [u];
      const names: (string | undefined)[] = [];
      while (prev.has(ids[0])) {
        const p = prev.get(ids[0])!;
        names.unshift(p.name);
        ids.unshift(p.from);
      }
      return { ids, edgeNames: names, distance: du };
    }
    for (const { to, w, name } of adj.get(u) ?? []) {
      if (closed.has(to)) continue;
      const nd = du + w;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, { from: u, name });
        open.add(to);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type RouteTarget = LatLng & { buildingId?: string; name: string };

/**
 * Plan a walking route over the campus network from `from` to a building.
 * Returns null when the network is empty or the two points aren't connected.
 */
export function planCampusRoute(network: WalkNetwork, from: LatLng, target: RouteTarget): CampusRoute | null {
  if (!network.nodes.length || !network.edges.length) return null;
  const { nodes, adj } = buildGraph(network);
  const START = "__start";
  const END = "__end";

  // Attach a virtual node to the graph in the middle of an edge.
  const attach = (id: string, snap: Snap) => {
    const wa = distanceM(snap.point, snap.a);
    const wb = distanceM(snap.point, snap.b);
    const list = adj.get(id) ?? [];
    list.push({ to: snap.a.id, w: wa, name: snap.name }, { to: snap.b.id, w: wb, name: snap.name });
    adj.set(id, list);
    adj.get(snap.a.id)?.push({ to: id, w: wa, name: snap.name });
    adj.get(snap.b.id)?.push({ to: id, w: wb, name: snap.name });
    nodes.set(id, { id, lat: snap.point.lat, lng: snap.point.lng });
  };

  // --- start: the user's spot on the network, or the nearest gate when off campus
  const startSnap = snapToNetwork(network, from);
  if (!startSnap) return null;
  let offCampus: CampusRoute["offCampus"];
  let startId = START;
  if (startSnap.distance > OFF_CAMPUS_M) {
    const gates = network.nodes.filter((n) => n.gate);
    const gate = gates.sort((x, y) => distanceM(from, x) - distanceM(from, y))[0];
    if (gate) {
      startId = gate.id;
      offCampus = { entry: gate, gateName: gate.name, straightDistance: distanceM(from, gate) };
    } else {
      attach(START, startSnap);
      offCampus = { entry: startSnap.point, straightDistance: startSnap.distance };
    }
  } else {
    attach(START, startSnap);
  }

  // --- end: the building's entrance nodes, else the building point snapped onto the network
  const entrances = target.buildingId
    ? network.nodes.filter((n) => n.buildingId === target.buildingId).map((n) => n.id)
    : [];
  let targets: Set<string>;
  if (entrances.length) {
    targets = new Set(entrances);
  } else {
    const endSnap = snapToNetwork(network, target);
    if (!endSnap) return null;
    if (startId === START && endSnap.a.id === startSnap.a.id && endSnap.b.id === startSnap.b.id) {
      // Both on the same edge: walk straight along it.
      const w = distanceM(startSnap.point, endSnap.point);
      attach(END, endSnap);
      adj.get(START)!.push({ to: END, w, name: endSnap.name });
      adj.get(END)!.push({ to: START, w, name: endSnap.name });
    } else {
      attach(END, endSnap);
    }
    targets = new Set([END]);
  }

  const found = shortestPath(adj, startId, targets);
  if (!found) return null;

  // --- polyline
  const points: LatLng[] = found.ids.map((id) => nodes.get(id)!);
  const names: (string | undefined)[] = found.ids.map((id) => nodes.get(id)?.name);
  const edgeNames = [...found.edgeNames];
  if (!offCampus && startSnap.distance > 3) {
    points.unshift(from);
    names.unshift(undefined);
    edgeNames.unshift(undefined);
  }
  const last = points[points.length - 1];
  const tail = distanceM(last, target);
  if (tail > 3 && tail <= BUILDING_LEG_MAX_M) {
    points.push(target);
    names.push(undefined);
    edgeNames.push(undefined);
  }

  const path = points.map(toTuple);
  const distance = polylineLength(path);
  return {
    path,
    distance,
    duration: distance / WALK_SPEED_MPS,
    steps: buildSteps(points, names, edgeNames, target),
    offCampus,
  };
}

// ---------------------------------------------------------------------------
// Turn-by-turn
// ---------------------------------------------------------------------------

const COMPASS = ["ทิศเหนือ", "ทิศตะวันออกเฉียงเหนือ", "ทิศตะวันออก", "ทิศตะวันออกเฉียงใต้", "ทิศใต้", "ทิศตะวันตกเฉียงใต้", "ทิศตะวันตก", "ทิศตะวันตกเฉียงเหนือ"];
const compassName = (deg: number) => COMPASS[Math.round(deg / 45) % 8];

function classifyTurn(delta: number): Maneuver {
  const a = Math.abs(delta);
  if (a < TURN_MIN_DEG) return "straight";
  if (a > 160) return "uturn";
  const side = delta > 0 ? "right" : "left";
  if (a < 60) return `slight-${side}` as Maneuver;
  if (a < 125) return side as Maneuver;
  return `sharp-${side}` as Maneuver;
}

const MANEUVER_TEXT: Record<Maneuver, string> = {
  depart: "เริ่มเดิน",
  straight: "เดินตรงไป",
  "slight-left": "เบี่ยงซ้าย",
  left: "เลี้ยวซ้าย",
  "sharp-left": "เลี้ยวซ้ายหักศอก",
  "slight-right": "เบี่ยงขวา",
  right: "เลี้ยวขวา",
  "sharp-right": "เลี้ยวขวาหักศอก",
  uturn: "กลับหลังหัน",
  arrive: "ถึงแล้ว",
};

/**
 * Turn a polyline into steps. Tiny segments (snapping stubs, wobbly traces) are
 * merged first so they don't produce phantom "turns"; a named landmark at a
 * junction is mentioned ("เลี้ยวซ้าย ที่โรงอาหาร"), as is the name of the path
 * turned onto ("…เข้าทางเดินหน้าอาคาร 3").
 */
function buildSteps(
  points: LatLng[],
  nodeNames: (string | undefined)[],
  edgeNames: (string | undefined)[],
  target: RouteTarget,
): RouteStep[] {
  // Keep endpoints + vertices whose incoming segment is not tiny.
  const keep: number[] = [0];
  for (let i = 1; i < points.length - 1; i++) {
    if (distanceM(points[keep[keep.length - 1]], points[i]) >= TINY_SEGMENT_M || nodeNames[i]) keep.push(i);
  }
  if (points.length > 1) keep.push(points.length - 1);
  const pts = keep.map((i) => points[i]);
  const names = keep.map((i) => nodeNames[i]);
  // Name of the edge leaving each kept vertex = name of the first original edge after it.
  const leaving = keep.map((i) => edgeNames[i]);

  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1] + distanceM(pts[i - 1], pts[i]));
  const total = cumulative[cumulative.length - 1] ?? 0;

  const steps: RouteStep[] = [];
  if (pts.length < 2) {
    return [{ maneuver: "arrive", instruction: `ถึง${target.name}แล้ว`, distance: 0, at: toTuple(target), startAlong: 0 }];
  }

  const firstBearing = bearingDeg(pts[0], pts[1]);
  steps.push({
    maneuver: "depart",
    instruction: `เริ่มเดินไปทาง${compassName(firstBearing)}${leaving[0] ? ` ตาม${leaving[0]}` : ""}`,
    distance: 0,
    at: toTuple(pts[0]),
    startAlong: 0,
  });

  // Point `along` metres down the polyline (clamped to its ends).
  const pointAt = (along: number): LatLng => {
    if (along <= 0) return pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (cumulative[i] >= along) {
        const seg = cumulative[i] - cumulative[i - 1];
        const t = seg === 0 ? 0 : (along - cumulative[i - 1]) / seg;
        return { lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t, lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t };
      }
    }
    return pts[pts.length - 1];
  };
  // Headings measured over ~12 m either side of a vertex, so a wobbly trace
  // doesn't read as a string of tiny turns.
  const headingIn = (i: number) => bearingDeg(pointAt(cumulative[i] - LOOK_M), pts[i]);
  const headingOut = (i: number) => bearingDeg(pts[i], pointAt(cumulative[i] + LOOK_M));
  const turnDelta = (inDeg: number, outDeg: number) => ((outDeg - inDeg + 540) % 360) - 180;

  let lastTurn: { stepIndex: number; vertex: number } | null = null;
  for (let i = 1; i < pts.length - 1; i++) {
    const maneuver = classifyTurn(turnDelta(headingIn(i), headingOut(i)));
    if (maneuver === "straight") continue;
    const where = names[i] ? ` ที่${names[i]}` : "";
    const onto = leaving[i] && leaving[i] !== leaving[i - 1] ? ` เข้า${leaving[i]}` : "";
    // Two turns within a few metres = one maneuver (e.g. a jog around a corner).
    if (lastTurn && cumulative[i] - cumulative[lastTurn.vertex] < MERGE_TURNS_M) {
      const merged = classifyTurn(turnDelta(headingIn(lastTurn.vertex), headingOut(i)));
      if (merged === "straight") {
        steps.splice(lastTurn.stepIndex, 1);
        lastTurn = null;
      } else {
        const prev = steps[lastTurn.stepIndex];
        prev.maneuver = merged;
        prev.instruction = `${MANEUVER_TEXT[merged]}${onto}${where || (names[lastTurn.vertex] ? ` ที่${names[lastTurn.vertex]}` : "")}`;
      }
      continue;
    }
    steps.push({ maneuver, instruction: `${MANEUVER_TEXT[maneuver]}${onto}${where}`, distance: 0, at: toTuple(pts[i]), startAlong: cumulative[i] });
    lastTurn = { stepIndex: steps.length - 1, vertex: i };
  }

  // Which side the building is on, relative to the last walking direction.
  const n = pts.length;
  let side = "";
  if (n >= 2) {
    const heading = bearingDeg(pts[n - 2], pts[n - 1]);
    const toBuilding = bearingDeg(pts[n - 2], target);
    const rel = ((toBuilding - heading + 540) % 360) - 180;
    if (distanceM(pts[n - 1], target) > 8 && Math.abs(rel) > 20) side = rel > 0 ? " (อยู่ทางขวามือ)" : " (อยู่ทางซ้ายมือ)";
  }
  steps.push({ maneuver: "arrive", instruction: `ถึง${target.name}${side}`, distance: 0, at: toTuple(pts[n - 1]), startAlong: total });

  for (let i = 0; i < steps.length - 1; i++) steps[i].distance = steps[i + 1].startAlong - steps[i].startAlong;
  return steps;
}

/** Index of the step the walker is on, given their distance along the route. */
export function currentStepIndex(steps: RouteStep[], along: number): number {
  let idx = 0;
  for (let i = 0; i < steps.length; i++) if (steps[i].startAlong <= along + 1) idx = i;
  return idx;
}

export const EMPTY_WALK_NETWORK: WalkNetwork = { version: 1, nodes: [], edges: [] };

// ---------------------------------------------------------------------------
// Editing helpers (admin editor + OSM import script)
// ---------------------------------------------------------------------------

/**
 * Split edge a–b at `point` with a new node (returns the new node id), keeping
 * the edge name on both halves. Returns null if there is no such edge.
 */
export function splitEdge(network: WalkNetwork, a: string, b: string, point: LatLng, newId: string): WalkNetwork | null {
  const idx = network.edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  if (idx < 0) return null;
  const { name } = network.edges[idx];
  const edges = [...network.edges];
  edges.splice(idx, 1, { a, b: newId, ...(name ? { name } : {}) }, { a: newId, b, ...(name ? { name } : {}) });
  return { ...network, nodes: [...network.nodes, { id: newId, lat: point.lat, lng: point.lng }], edges };
}

/**
 * Give a building an entrance node at its coordinates, linked to the nearest
 * point of the network (splitting that edge). Returns the network unchanged if
 * the building already has an entrance or the network is empty.
 */
export function connectBuildingEntrance(
  network: WalkNetwork,
  building: { id: string; name: string; lat: number; lng: number },
): { network: WalkNetwork; linkDistance: number } {
  if (network.nodes.some((n) => n.buildingId === building.id)) return { network, linkDistance: 0 };
  const snap = snapToNetwork(network, building);
  if (!snap) return { network, linkDistance: Infinity };
  let next = network;
  let joinId: string;
  if (snap.t <= 0.02) joinId = snap.a.id;
  else if (snap.t >= 0.98) joinId = snap.b.id;
  else {
    joinId = `j-${building.id}`;
    next = splitEdge(next, snap.a.id, snap.b.id, snap.point, joinId) ?? next;
  }
  const entranceId = `entrance-${building.id}`;
  next = {
    ...next,
    nodes: [...next.nodes, { id: entranceId, lat: building.lat, lng: building.lng, buildingId: building.id, name: building.name }],
    edges: [...next.edges, { a: joinId, b: entranceId }],
  };
  return { network: next, linkDistance: snap.distance };
}

/** Connected-component id per node id. */
export function networkComponents(network: WalkNetwork): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const e of network.edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  const comp = new Map<string, number>();
  let c = 0;
  for (const n of network.nodes) {
    if (comp.has(n.id)) continue;
    const stack = [n.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (comp.has(id)) continue;
      comp.set(id, c);
      stack.push(...(adj.get(id) ?? []));
    }
    c++;
  }
  return comp;
}

export function networkLength(network: WalkNetwork): number {
  const byId = new Map(network.nodes.map((n) => [n.id, n]));
  return network.edges.reduce((sum, e) => {
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    return a && b ? sum + distanceM(a, b) : sum;
  }, 0);
}
