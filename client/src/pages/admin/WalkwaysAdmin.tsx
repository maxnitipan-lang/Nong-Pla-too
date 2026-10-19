import { Button } from "@/components/ui/button";
import { ManeuverIcon } from "@/components/RoutePanel";
import { trpc } from "@/lib/trpc";
import { buildingLatLng, formatDistance } from "@/lib/directions";
import { cn } from "@/lib/utils";
import { CAMPUS_OVERVIEW, type CampusBuilding } from "@shared/campus";
import { walkNetworkSchema } from "@shared/adminSchemas";
import {
  connectBuildingEntrance,
  networkComponents,
  networkLength,
  planCampusRoute,
  projectOnSegment,
  splitEdge,
  type CampusRoute,
  type LatLng,
  type WalkNetwork,
  type WalkNode,
} from "@shared/walkNetwork";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Eraser, Footprints, Link2, MousePointer2, Redo2, RotateCcw, Route, Save, Undo2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminShell, DbBanner, useAdminAccess } from "./AdminShell";

type Mode = "select" | "draw" | "erase" | "test";
type Selection = { kind: "node"; id: string } | { kind: "edge"; index: number } | null;

const MODES: { mode: Mode; label: string; hint: string; icon: typeof MousePointer2 }[] = [
  { mode: "select", label: "เลือก / ย้าย", hint: "คลิกจุดหรือเส้นเพื่อแก้ชื่อ · ลากจุดเพื่อย้าย", icon: MousePointer2 },
  { mode: "draw", label: "วาดทางเดิน", hint: "คลิกบนแผนที่เพื่อวางจุดต่อกันเป็นเส้น · คลิกจุดเดิมเพื่อต่อทาง · คลิกบนเส้นเพื่อแยกทาง · Esc = จบเส้น", icon: Footprints },
  { mode: "erase", label: "ลบ", hint: "คลิกจุด (ลบพร้อมเส้นที่ต่ออยู่) หรือคลิกเส้นเพื่อลบ", icon: Eraser },
  { mode: "test", label: "ทดลองเส้นทาง", hint: "คลิกบนแผนที่ = จุดเริ่ม แล้วเลือกอาคารปลายทาง", icon: Route },
];

let idCounter = 0;
const newId = () => `n-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function nodeIcon(node: WalkNode, selected: boolean, chain: boolean) {
  const size = node.buildingId || node.gate ? 16 : 12;
  const bg = node.gate ? "#16a34a" : node.buildingId ? "#e8563f" : chain ? "#f59e0b" : "#1a73e8";
  const ring = selected ? "box-shadow:0 0 0 4px rgba(245,158,11,.6);" : "";
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid #fff;${ring}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function WalkwaysAdmin() {
  const { canEdit } = useAdminAccess();
  const utils = trpc.useUtils();
  const { data: remote } = trpc.admin.walkNetwork.get.useQuery();
  const { data: buildingsData } = trpc.admin.buildings.list.useQuery();
  const buildings = buildingsData ?? [];

  const [network, setNetwork] = useState<WalkNetwork | null>(null);
  const [history, setHistory] = useState<WalkNetwork[]>([]);
  const [future, setFuture] = useState<WalkNetwork[]>([]);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>("draw");
  const [selection, setSelection] = useState<Selection>(null);
  const [chainFrom, setChainFrom] = useState<string | null>(null);
  const [satellite, setSatellite] = useState(true);
  const [testStart, setTestStart] = useState<LatLng | null>(null);
  const [testTarget, setTestTarget] = useState("");

  // Load (and reload after a reset) — never clobber unsaved edits.
  useEffect(() => {
    if (!remote || dirty) return;
    const { source: _source, ...net } = remote;
    setNetwork(net);
    setHistory([]);
    setFuture([]);
  }, [remote, dirty]);

  /** Apply an edit with undo support. */
  const apply = useCallback((next: WalkNetwork) => {
    setNetwork((current) => {
      if (current) setHistory((h) => [...h.slice(-99), current]);
      return next;
    });
    setFuture([]);
    setDirty(true);
  }, []);

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev || !network) return;
    setFuture((f) => [network, ...f]);
    setHistory((h) => h.slice(0, -1));
    setNetwork(prev);
    setDirty(true);
    setSelection(null);
    setChainFrom(null);
  };
  const redo = () => {
    const next = future[0];
    if (!next || !network) return;
    setHistory((h) => [...h, network]);
    setFuture((f) => f.slice(1));
    setNetwork(next);
    setDirty(true);
  };

  const save = trpc.admin.walkNetwork.save.useMutation({
    onSuccess: () => {
      toast.success("บันทึกทางเดินแล้ว — เส้นทางบนหน้าเว็บใช้ข้อมูลใหม่ทันที");
      setDirty(false);
      utils.admin.walkNetwork.get.invalidate();
      utils.campus.walkNetwork.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const reset = trpc.admin.walkNetwork.reset.useMutation({
    onSuccess: () => {
      toast.success("คืนค่าเป็นทางเดินเริ่มต้นจาก OpenStreetMap แล้ว");
      setDirty(false);
      utils.admin.walkNetwork.get.invalidate();
      utils.campus.walkNetwork.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    if (!network) return;
    const parsed = walkNetworkSchema.safeParse(network);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "ข้อมูลทางเดินไม่ถูกต้อง");
      return;
    }
    save.mutate(parsed.data);
  };

  // ------------------------------------------------------------------ edits
  const edit = useRef({
    addNode(at: LatLng) {},
    clickNode(id: string) {},
    clickEdge(index: number, at: LatLng) {},
    moveNode(id: string, at: LatLng) {},
    clickMap(at: LatLng) {},
  });

  edit.current = {
    addNode(at) {
      if (!network) return;
      const id = newId();
      const next: WalkNetwork = { ...network, nodes: [...network.nodes, { id, lat: at.lat, lng: at.lng }] };
      if (chainFrom) next.edges = [...network.edges, { a: chainFrom, b: id }];
      apply(next);
      setChainFrom(id);
    },
    clickNode(id) {
      if (!network) return;
      if (mode === "select") setSelection({ kind: "node", id });
      if (mode === "erase") {
        apply({ ...network, nodes: network.nodes.filter((n) => n.id !== id), edges: network.edges.filter((e) => e.a !== id && e.b !== id) });
        if (chainFrom === id) setChainFrom(null);
        setSelection(null);
      }
      if (mode === "draw") {
        if (chainFrom && chainFrom !== id) {
          const exists = network.edges.some((e) => (e.a === chainFrom && e.b === id) || (e.a === id && e.b === chainFrom));
          if (!exists) apply({ ...network, edges: [...network.edges, { a: chainFrom, b: id }] });
        }
        setChainFrom(id);
      }
    },
    clickEdge(index, at) {
      if (!network) return;
      const edge = network.edges[index];
      if (mode === "select") setSelection({ kind: "edge", index });
      if (mode === "erase") {
        apply({ ...network, edges: network.edges.filter((_, i) => i !== index) });
        setSelection(null);
      }
      if (mode === "draw") {
        // Split the edge where it was clicked, then continue the chain from there.
        const a = network.nodes.find((n) => n.id === edge.a);
        const b = network.nodes.find((n) => n.id === edge.b);
        if (!a || !b) return;
        const point = projectOnSegment(at, a, b).point;
        const id = newId();
        let next = splitEdge(network, edge.a, edge.b, point, id);
        if (!next) return;
        if (chainFrom) next = { ...next, edges: [...next.edges, { a: chainFrom, b: id }] };
        apply(next);
        setChainFrom(id);
      }
    },
    moveNode(id, at) {
      if (!network) return;
      apply({ ...network, nodes: network.nodes.map((n) => (n.id === id ? { ...n, lat: at.lat, lng: at.lng } : n)) });
    },
    clickMap(at) {
      if (mode === "draw") this.addNode(at);
      else if (mode === "test") setTestStart(at);
      else setSelection(null);
    },
  };

  // Esc ends the drawing chain; Ctrl+Z / Ctrl+Y undo/redo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (event.key === "Escape") setChainFrom(null);
      if (!canEdit) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => { if (mode !== "draw") setChainFrom(null); }, [mode]);
  // View-only accounts start (and stay) out of the editing modes.
  useEffect(() => { if (!canEdit && (mode === "draw" || mode === "erase")) setMode("test"); }, [canEdit, mode]);

  // ------------------------------------------------------------------ map
  // Callback ref: the map box only exists once AdminShell has let an admin in.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<{ osm: L.TileLayer; sat: L.TileLayer } | null>(null);
  const drawRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!container || mapRef.current) return;
    const map = L.map(container, { center: [CAMPUS_OVERVIEW.mapCenter.lat, CAMPUS_OVERVIEW.mapCenter.lng], zoom: 18, maxZoom: 21, doubleClickZoom: false });
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 21, maxNativeZoom: 19, attribution: "&copy; OpenStreetMap" });
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 21, maxNativeZoom: 19, attribution: "Imagery &copy; Esri" });
    baseRef.current = { osm, sat };
    sat.addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => edit.current.clickMap(e.latlng));
    drawRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setMapReady(true);
    setTimeout(() => map.invalidateSize(), 200);
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [container]);

  useEffect(() => {
    const map = mapRef.current;
    const base = baseRef.current;
    if (!map || !base) return;
    if (satellite) { base.osm.remove(); base.sat.addTo(map); } else { base.sat.remove(); base.osm.addTo(map); }
  }, [satellite, mapReady]);

  const testBuilding = buildings.find((b) => b.id === testTarget);
  const testRoute: CampusRoute | null = useMemo(() => {
    if (!network || !testStart || !testBuilding) return null;
    const p = buildingLatLng(testBuilding);
    return p ? planCampusRoute(network, testStart, { ...p, buildingId: testBuilding.id, name: testBuilding.name }) : null;
  }, [network, testStart, testBuilding]);

  // Redraw everything on change (a campus graph is a few hundred items — cheap).
  useEffect(() => {
    const layer = drawRef.current;
    if (!layer || !network) return;
    layer.clearLayers();
    const byId = new Map(network.nodes.map((n) => [n.id, n]));

    for (const b of buildings) {
      const p = buildingLatLng(b);
      if (!p) continue;
      L.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 1, fillColor: b.accent, fillOpacity: 0.9, interactive: false })
        .bindTooltip(b.shortName, { permanent: true, direction: "right", className: "!text-[10px] !font-bold !py-0 !px-1", offset: [6, 0] })
        .addTo(layer);
    }

    network.edges.forEach((e, index) => {
      const a = byId.get(e.a);
      const b = byId.get(e.b);
      if (!a || !b) return;
      const selected = selection?.kind === "edge" && selection.index === index;
      const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: selected ? "#f59e0b" : "#1a73e8", weight: selected ? 7 : 5, opacity: 0.9 });
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: "#000", opacity: 0, weight: 18 }) // wide invisible hit area
        .on("click", (ev: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); edit.current.clickEdge(index, ev.latlng); })
        .addTo(layer);
      line.addTo(layer);
      if (e.name) line.bindTooltip(e.name, { sticky: true });
    });

    if (testRoute) {
      L.polyline(testRoute.path, { color: "#e8563f", weight: 6, opacity: 0.9 }).addTo(layer);
    }
    if (testStart) L.circleMarker([testStart.lat, testStart.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#16a34a", fillOpacity: 1 }).addTo(layer);

    for (const node of network.nodes) {
      const selected = selection?.kind === "node" && selection.id === node.id;
      const marker = L.marker([node.lat, node.lng], { icon: nodeIcon(node, selected, chainFrom === node.id), draggable: canEdit && mode === "select", zIndexOffset: selected ? 1000 : 0 });
      marker.on("click", (ev: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); edit.current.clickNode(node.id); });
      marker.on("dragend", () => edit.current.moveNode(node.id, marker.getLatLng()));
      if (node.name) marker.bindTooltip(node.name, { direction: "top" });
      marker.addTo(layer);
    }
  }, [network, buildings, selection, chainFrom, mode, testRoute, testStart, mapReady]);

  // ------------------------------------------------------------------ checks
  const stats = useMemo(() => {
    if (!network) return null;
    const comp = networkComponents(network);
    const entrances = new Map(network.nodes.filter((n) => n.buildingId).map((n) => [n.buildingId!, n]));
    const withCoords = buildings.filter((b) => buildingLatLng(b));
    const missing = withCoords.filter((b) => !entrances.has(b.id));
    // The biggest component is "the campus"; entrances outside it are unreachable.
    const sizes = new Map<number, number>();
    comp.forEach((c) => sizes.set(c, (sizes.get(c) ?? 0) + 1));
    const main = Array.from(sizes.entries()).sort((x, y) => y[1] - x[1])[0]?.[0];
    const islands = withCoords.filter((b) => entrances.has(b.id) && comp.get(entrances.get(b.id)!.id) !== main);
    return { length: networkLength(network), missing, islands, gates: network.nodes.filter((n) => n.gate).length };
  }, [network, buildings]);

  const connectMissing = () => {
    if (!network || !stats) return;
    let next = network;
    for (const b of stats.missing) {
      const p = buildingLatLng(b)!;
      next = connectBuildingEntrance(next, { id: b.id, name: b.shortName, lat: p.lat, lng: p.lng }).network;
    }
    apply(next);
    toast.success(`ต่อทางเข้าให้ ${stats.missing.length} อาคาร — ตรวจดูว่าเส้นที่ต่อไม่ผ่านกำแพงหรือสนาม`);
  };

  const focus = (b: CampusBuilding) => {
    const p = buildingLatLng(b);
    if (p) mapRef.current?.flyTo([p.lat, p.lng], 20);
  };

  const selectedNode = selection?.kind === "node" ? network?.nodes.find((n) => n.id === selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? network?.edges[selection.index] : undefined;
  const updateNode = (patch: Partial<WalkNode>) => {
    if (!network || !selectedNode) return;
    apply({ ...network, nodes: network.nodes.map((n) => (n.id === selectedNode.id ? cleanNode({ ...n, ...patch }) : n)) });
  };
  const updateEdgeName = (name: string) => {
    if (!network || selection?.kind !== "edge") return;
    apply({ ...network, edges: network.edges.map((e, i) => (i === selection.index ? (name.trim() ? { ...e, name } : { a: e.a, b: e.b }) : e)) });
  };

  const hint = MODES.find((m) => m.mode === mode)!.hint;

  return (
    <AdminShell section="walkways" title="ทางเดิน (นำทางในวิทยาลัย)">
      <DbBanner />
      <p className="mb-4 max-w-3xl text-sm leading-7 text-[var(--muted-foreground)]">
        วาดทางเดินจริงของวิทยาลัยลงบนแผนที่ (แนะนำโหมดดาวเทียม) ระบบนำทางจะพาเดินตามเส้นเหล่านี้เท่านั้น พร้อมบอกทางเลี้ยวทีละขั้น
        จุด<span className="font-bold text-[#e8563f]">สีส้มแดง</span> = ทางเข้าอาคาร · จุด<span className="font-bold text-[#16a34a]">สีเขียว</span> = ประตูวิทยาลัย
        (คนที่อยู่นอกวิทยาลัยจะถูกพามาที่ประตูก่อน) · ตั้งชื่อจุดสำคัญ เช่น "โรงอาหาร" เพื่อให้คำบอกทางเป็น "เลี้ยวซ้าย ที่โรงอาหาร"
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {MODES.filter(({ mode: m }) => canEdit || m === "select" || m === "test").map(({ mode: m, label, icon: Icon }) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold", mode === m ? "bg-[var(--ink)] text-white" : "bg-[var(--muted)] text-[var(--ink)]")}>
            <Icon size={14} /> {label}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-[var(--border)]" />
        {canEdit && <><button type="button" onClick={undo} disabled={!history.length} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--muted)] disabled:opacity-40" aria-label="ย้อนกลับ" title="ย้อนกลับ (Ctrl+Z)"><Undo2 size={15} /></button>
        <button type="button" onClick={redo} disabled={!future.length} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--muted)] disabled:opacity-40" aria-label="ทำซ้ำ" title="ทำซ้ำ (Ctrl+Y)"><Redo2 size={15} /></button></>}
        <label className="ml-1 flex items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={satellite} onChange={(e) => setSatellite(e.target.checked)} /> ภาพดาวเทียม
        </label>
        {canEdit && <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() => { if (window.confirm("ลบทางเดินที่บันทึกไว้ทั้งหมด แล้วกลับไปใช้ทางเดินเริ่มต้นจาก OpenStreetMap?")) reset.mutate(); }}
            disabled={reset.isPending}
          >
            <RotateCcw size={15} /> คืนค่าเริ่มต้น
          </Button>
          <Button onClick={submit} disabled={!dirty || save.isPending}>
            <Save size={15} /> {save.isPending ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}
          </Button>
        </div>}
      </div>
      <p className="mb-3 text-xs font-bold text-[#1a73e8]">{hint}{mode === "draw" && chainFrom ? " · กำลังวาดต่อจากจุดสีเหลือง" : ""}</p>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="relative isolate h-[70vh] min-h-[480px] overflow-hidden rounded-2xl border border-[var(--border)]">
          <div ref={setContainer} className={cn("absolute inset-0", mode === "draw" || mode === "test" ? "cursor-crosshair" : "")} />
        </div>

        <aside className="space-y-4">
          {stats && (
            <div className="rounded-2xl border border-[var(--border)] bg-card p-4 text-xs">
              <p className="font-bold text-[var(--ink)]">สถานะโครงข่าย {remote?.source === "default" && !dirty && <span className="ml-1 rounded-full bg-[#fff6e5] px-2 py-0.5 text-[10px] text-[#8a6412]">ค่าเริ่มต้นจาก OSM</span>}</p>
              <p className="mt-2 text-[var(--muted-foreground)]">{network?.nodes.length} จุด · {network?.edges.length} เส้น · ทางเดินรวม {formatDistance(stats.length)} · ประตู {stats.gates}</p>
              {stats.missing.length > 0 && (
                <div className="mt-3 rounded-xl bg-[#fff1eb] p-3">
                  <p className="font-bold text-[#c46242]">ยังไม่มีทางเข้า {stats.missing.length} อาคาร</p>
                  <div className="mt-1 flex flex-wrap gap-1">{stats.missing.map((b) => <button key={b.id} type="button" onClick={() => focus(b)} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold">{b.shortName}</button>)}</div>
                  {canEdit && <button type="button" onClick={connectMissing} className="mt-2 flex items-center gap-1 font-bold text-[#1a73e8]"><Wand2 size={13} /> ต่อทางเข้าอัตโนมัติ (ต่อกับทางที่ใกล้ที่สุด)</button>}
                </div>
              )}
              {stats.islands.length > 0 && (
                <div className="mt-3 rounded-xl bg-[#fff1eb] p-3">
                  <p className="font-bold text-[#c46242]">ไปไม่ถึงจากทางหลัก {stats.islands.length} อาคาร — วาดทางเชื่อมให้ติดกัน</p>
                  <div className="mt-1 flex flex-wrap gap-1">{stats.islands.map((b) => <button key={b.id} type="button" onClick={() => focus(b)} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold">{b.shortName}</button>)}</div>
                </div>
              )}
              {!stats.missing.length && !stats.islands.length && <p className="mt-2 font-bold text-[#16a34a]">✓ ทุกอาคารมีทางเข้าและเดินถึงกันได้</p>}
            </div>
          )}

          {canEdit && mode === "select" && selectedNode && (
            <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-card p-4 text-xs">
              <p className="font-bold text-[var(--ink)]">จุดที่เลือก</p>
              <label className="block">
                <span className="mb-1 block font-bold">ชื่อจุด (ใช้ในคำบอกทาง)</span>
                <input value={selectedNode.name ?? ""} onChange={(e) => updateNode({ name: e.target.value })} placeholder="เช่น โรงอาหาร, เสาธง" className="h-9 w-full rounded-md border border-[var(--border)] bg-card px-2" />
              </label>
              <label className="block">
                <span className="mb-1 block font-bold">เป็นทางเข้าของอาคาร</span>
                <select value={selectedNode.buildingId ?? ""} onChange={(e) => updateNode({ buildingId: e.target.value || undefined })} className="h-9 w-full rounded-md border border-[var(--border)] bg-card px-2">
                  <option value="">— ไม่ใช่ทางเข้าอาคาร —</option>
                  {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 font-bold">
                <input type="checkbox" checked={Boolean(selectedNode.gate)} onChange={(e) => updateNode({ gate: e.target.checked || undefined })} /> เป็นประตูเข้า-ออกวิทยาลัย
              </label>
            </div>
          )}
          {canEdit && mode === "select" && selectedEdge && (
            <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-card p-4 text-xs">
              <p className="font-bold text-[var(--ink)]">เส้นทางเดินที่เลือก</p>
              <label className="block">
                <span className="mb-1 block font-bold">ชื่อทางเดิน (ไม่บังคับ)</span>
                <input value={selectedEdge.name ?? ""} onChange={(e) => updateEdgeName(e.target.value)} placeholder="เช่น ทางเดินมีหลังคา" className="h-9 w-full rounded-md border border-[var(--border)] bg-card px-2" />
              </label>
              <p className="flex items-center gap-1 text-[var(--muted-foreground)]"><Link2 size={12} /> ตั้งชื่อต่อเนื่องหลายเส้นได้ คำบอกทางจะเป็น "เลี้ยวซ้ายเข้า&lt;ชื่อ&gt;"</p>
            </div>
          )}

          {mode === "test" && (
            <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-card p-4 text-xs">
              <p className="font-bold text-[var(--ink)]">ทดลองเส้นทาง</p>
              <p className="text-[var(--muted-foreground)]">{testStart ? "จุดเริ่ม: จุดสีเขียวบนแผนที่ (คลิกใหม่เพื่อย้าย)" : "คลิกบนแผนที่เพื่อวางจุดเริ่ม"}</p>
              <select value={testTarget} onChange={(e) => setTestTarget(e.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-card px-2">
                <option value="">— เลือกอาคารปลายทาง —</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {testStart && testBuilding && !testRoute && <p className="font-bold text-[#c46242]">ไม่พบเส้นทาง — จุดเริ่มกับอาคารนี้ไม่ได้เชื่อมกัน</p>}
              {testRoute && (
                <>
                  <p className="font-bold text-[var(--ink)]">เดิน {formatDistance(testRoute.distance)} · ~{Math.max(1, Math.round(testRoute.duration / 60))} นาที{testRoute.offCampus ? " (เริ่มจากประตู)" : ""}</p>
                  <ol className="space-y-1">
                    {testRoute.steps.map((s, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <ManeuverIcon maneuver={s.maneuver} className="h-4 w-4 shrink-0 text-[#1a73e8]" />
                        <span className="flex-1">{s.instruction}</span>
                        {s.distance > 0 && <span className="font-bold text-[var(--muted-foreground)]">{formatDistance(s.distance)}</span>}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}

/** Drop empty optional fields so saved JSON stays clean. */
function cleanNode(node: WalkNode): WalkNode {
  const out: WalkNode = { id: node.id, lat: node.lat, lng: node.lng };
  if (node.name?.trim()) out.name = node.name;
  if (node.buildingId) out.buildingId = node.buildingId;
  if (node.gate) out.gate = true;
  return out;
}
