// Build a starter campus walkway network from an OpenStreetMap snapshot.
//
//   npx tsx scripts/buildWalkNetworkFromOsm.ts
//
// Input : scripts/data/campus-osm.json  (Overpass `out geom` of highway/building ways around campus)
// Output: shared/data/campusWalkNetwork.json  (the default network until an admin saves one)
//
// OSM only knows the campus driveways, not every footpath, so this is a starting
// point: the admin "ทางเดิน" editor is where the real walkways get drawn/fixed.

import fs from "node:fs";
import { CAMPUS_BUILDINGS } from "../shared/campus";
import { connectBuildingEntrance, distanceM, type WalkEdge, type WalkNetwork, type WalkNode } from "../shared/walkNetwork";

type OsmWay = { id: number; nodes: number[]; geometry: { lat: number; lon: number }[]; tags: Record<string, string> };

const WALKABLE = new Set(["service", "residential", "path", "footway", "pedestrian", "living_street", "unclassified", "track", "steps"]);
const ROADS = new Set(["secondary", "secondary_link", "tertiary", "primary"]);
const PAD_M = 50;

const osm = JSON.parse(fs.readFileSync("scripts/data/campus-osm.json", "utf8")) as { elements: OsmWay[] };
const ways = osm.elements.filter((w) => w.tags?.highway);

// Campus box = all buildings + padding.
const lats = CAMPUS_BUILDINGS.map((b) => Number(b.latitude));
const lngs = CAMPUS_BUILDINGS.map((b) => Number(b.longitude));
const padLat = PAD_M / 110_574;
const padLng = PAD_M / (111_320 * Math.cos((13.42 * Math.PI) / 180));
const box = { s: Math.min(...lats) - padLat, n: Math.max(...lats) + padLat, w: Math.min(...lngs) - padLng, e: Math.max(...lngs) + padLng };
const inside = (p: { lat: number; lon: number }) => p.lat >= box.s && p.lat <= box.n && p.lon >= box.w && p.lon <= box.e;

const nodes = new Map<string, WalkNode>();
const edges: WalkEdge[] = [];
const roadNodeIds = new Set(ways.filter((w) => ROADS.has(w.tags.highway)).flatMap((w) => w.nodes.map(String)));

for (const way of ways.filter((w) => WALKABLE.has(w.tags.highway))) {
  for (let i = 1; i < way.nodes.length; i++) {
    const pa = way.geometry[i - 1];
    const pb = way.geometry[i];
    if (!inside(pa) && !inside(pb)) continue;
    const a = String(way.nodes[i - 1]);
    const b = String(way.nodes[i]);
    if (!nodes.has(a)) nodes.set(a, { id: `osm-${a}`, lat: pa.lat, lng: pa.lon });
    if (!nodes.has(b)) nodes.set(b, { id: `osm-${b}`, lat: pb.lat, lng: pb.lon });
    edges.push({ a: `osm-${a}`, b: `osm-${b}`, ...(way.tags.name ? { name: way.tags.name } : {}) });
  }
}

// Where a campus driveway meets a public road = a gate.
for (const [osmId, node] of nodes) {
  if (roadNodeIds.has(osmId)) {
    node.gate = true;
    node.name = "ประตูวิทยาลัย";
  }
}

const network: WalkNetwork = { version: 1, nodes: [...nodes.values()], edges };

// Keep only the connected pieces that actually reach a building (drop stray fragments).
function components(net: WalkNetwork) {
  const adj = new Map<string, string[]>();
  for (const e of net.edges) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e.b]);
    adj.set(e.b, [...(adj.get(e.b) ?? []), e.a]);
  }
  const seen = new Map<string, number>();
  let c = 0;
  for (const n of net.nodes) {
    if (seen.has(n.id)) continue;
    const stack = [n.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.set(id, c);
      stack.push(...(adj.get(id) ?? []));
    }
    c++;
  }
  return seen;
}

// Entrance node per building, linked to the nearest point on the network.
let net: WalkNetwork = network;
let entranceCount = 0;
for (const b of CAMPUS_BUILDINGS) {
  const result = connectBuildingEntrance(net, { id: b.id, name: b.shortName, lat: Number(b.latitude), lng: Number(b.longitude) });
  if (!Number.isFinite(result.linkDistance)) continue;
  net = result.network;
  entranceCount++;
  console.log(`${b.id.padEnd(24)} link ${Math.round(result.linkDistance)} m`);
}
network.nodes = net.nodes;
network.edges = net.edges;

const comp = components(network);
const useful = new Set(network.nodes.filter((n) => n.buildingId).map((n) => comp.get(n.id)));
network.nodes = network.nodes.filter((n) => useful.has(comp.get(n.id)));
const kept = new Set(network.nodes.map((n) => n.id));
network.edges = network.edges.filter((e) => kept.has(e.a) && kept.has(e.b));

// Round coordinates to ~1 cm to keep the file small.
network.nodes = network.nodes.map((n) => ({ ...n, lat: Number(n.lat.toFixed(7)), lng: Number(n.lng.toFixed(7)) }));

fs.writeFileSync("shared/data/campusWalkNetwork.json", JSON.stringify(network, null, 1) + "\n");
const total = network.edges.reduce((s, e) => {
  const a = network.nodes.find((n) => n.id === e.a)!;
  const b = network.nodes.find((n) => n.id === e.b)!;
  return s + distanceM(a, b);
}, 0);
console.log(`\n${network.nodes.length} nodes, ${network.edges.length} edges, ${Math.round(total)} m of path, ${entranceCount} entrances, ${network.nodes.filter((n) => n.gate).length} gates, ${new Set(comp.values()).size} components before pruning`);
