// /admin/walkways — draw the campus walkway network that turn-by-turn routes follow.
//   select: click a point/line to name it, drag a point to move it
//   draw:   click the map to add points in a chain, click a point to join, click a line to split it
//   erase:  click a point (removes its lines too) or a line
//   test:   click the map = start, then pick a destination building
// Undo / redo (Ctrl+Z / Ctrl+Y), satellite view, checks for unreachable buildings.
// (Same behaviour as client/src/pages/admin/WalkwaysAdmin.tsx.) Leaflet is window.L.

import { walkNetworkSchema } from "/shared/adminSchemas.js";
import { CAMPUS_OVERVIEW } from "/shared/campus.js";
import { connectBuildingEntrance, networkComponents, networkLength, planCampusRoute, projectOnSegment, splitEdge } from "/shared/walkNetwork.js";
import { apiGet, apiPost } from "../api.js";
import { buildingLatLng, formatDistance } from "../directions.js";
import { icon as turnIcon } from "../icons.js";
import { confirmDialog, html, icon, raw, toast, toastError, validate } from "./ui.js";

const L = window.L;

const MODES = [
  { mode: "select", label: "เลือก / ย้าย", hint: "คลิกจุดหรือเส้นเพื่อแก้ชื่อ · ลากจุดเพื่อย้าย", icon: "pointer" },
  { mode: "draw", label: "วาดทางเดิน", hint: "คลิกบนแผนที่เพื่อวางจุดต่อกันเป็นเส้น · คลิกจุดเดิมเพื่อต่อทาง · คลิกบนเส้นเพื่อแยกทาง · Esc = จบเส้น", icon: "footprints" },
  { mode: "erase", label: "ลบ", hint: "คลิกจุด (ลบพร้อมเส้นที่ต่ออยู่) หรือคลิกเส้นเพื่อลบ", icon: "eraser" },
  { mode: "test", label: "ทดลองเส้นทาง", hint: "คลิกบนแผนที่ = จุดเริ่ม แล้วเลือกอาคารปลายทาง", icon: "route" },
];

let idCounter = 0;
const newId = () => `n-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function nodeIcon(node, selected, chain) {
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

/** Drop empty optional fields so saved JSON stays clean. */
function cleanNode(node) {
  const out = { id: node.id, lat: node.lat, lng: node.lng };
  if (node.name?.trim()) out.name = node.name;
  if (node.buildingId) out.buildingId = node.buildingId;
  if (node.gate) out.gate = true;
  return out;
}

export async function render(page, { canEdit }) {
  const [remote, buildings] = await Promise.all([apiGet("admin/walkNetwork/get"), apiGet("admin/buildings/list")]);
  const { source, ...loaded } = remote;

  const s = {
    network: loaded,
    source,
    history: [],
    future: [],
    dirty: false,
    mode: canEdit ? "draw" : "test",
    selection: null, // { kind: "node", id } | { kind: "edge", index }
    chainFrom: null,
    satellite: true,
    testStart: null,
    testTarget: "",
  };

  page.innerHTML = html`<p class="help" style="margin-bottom:16px">วาดทางเดินจริงของวิทยาลัยลงบนแผนที่ (แนะนำโหมดดาวเทียม) ระบบนำทางจะพาเดินตามเส้นเหล่านี้เท่านั้น พร้อมบอกทางเลี้ยวทีละขั้น
      จุด<b style="color:#e8563f">สีส้มแดง</b> = ทางเข้าอาคาร · จุด<b style="color:#16a34a">สีเขียว</b> = ประตูวิทยาลัย
      (คนที่อยู่นอกวิทยาลัยจะถูกพามาที่ประตูก่อน) · ตั้งชื่อจุดสำคัญ เช่น "โรงอาหาร" เพื่อให้คำบอกทางเป็น "เลี้ยวซ้าย ที่โรงอาหาร"</p>
    <div class="toolbar" style="justify-content:flex-start" data-part="tools"></div>
    <p data-part="hint" style="margin:0 0 12px;color:var(--blue);font-size:13px;font-weight:700"></p>
    <div style="display:grid;gap:16px;grid-template-columns:minmax(0,1fr)" class="walk-layout">
      <div class="mini-map" data-part="map" style="height:70vh;min-height:480px"></div>
      <aside class="stack" data-part="side"></aside>
    </div>
    <style>@media (min-width:1280px){.walk-layout{grid-template-columns:minmax(0,1fr) 320px!important}}</style>`;

  const part = (name) => page.querySelector(`[data-part="${name}"]`);

  /* ---------------- map */

  const map = L.map(part("map"), { center: [CAMPUS_OVERVIEW.mapCenter.lat, CAMPUS_OVERVIEW.mapCenter.lng], zoom: 18, maxZoom: 21, doubleClickZoom: false });
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 21, maxNativeZoom: 19, attribution: "&copy; OpenStreetMap" });
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 21, maxNativeZoom: 19, attribution: "Imagery &copy; Esri" });
  sat.addTo(map);
  const layer = L.layerGroup().addTo(map);
  setTimeout(() => map.invalidateSize(), 200);

  /* ---------------- edits */

  /** Apply an edit with undo support. */
  const apply = (next) => {
    s.history = [...s.history.slice(-99), s.network];
    s.future = [];
    s.network = next;
    s.dirty = true;
    redraw();
  };
  const undo = () => {
    const prev = s.history[s.history.length - 1];
    if (!prev) return;
    s.future = [s.network, ...s.future];
    s.history = s.history.slice(0, -1);
    s.network = prev;
    s.dirty = true;
    s.selection = null;
    s.chainFrom = null;
    redraw();
  };
  const redo = () => {
    const next = s.future[0];
    if (!next) return;
    s.history = [...s.history, s.network];
    s.future = s.future.slice(1);
    s.network = next;
    s.dirty = true;
    redraw();
  };

  const edit = {
    addNode(at) {
      const id = newId();
      const next = { ...s.network, nodes: [...s.network.nodes, { id, lat: at.lat, lng: at.lng }] };
      if (s.chainFrom) next.edges = [...s.network.edges, { a: s.chainFrom, b: id }];
      s.chainFrom = id;
      apply(next);
    },
    clickNode(id) {
      const net = s.network;
      if (s.mode === "select") {
        s.selection = { kind: "node", id };
        redraw();
      }
      if (s.mode === "erase" && canEdit) {
        if (s.chainFrom === id) s.chainFrom = null;
        s.selection = null;
        apply({ ...net, nodes: net.nodes.filter((n) => n.id !== id), edges: net.edges.filter((e) => e.a !== id && e.b !== id) });
      }
      if (s.mode === "draw" && canEdit) {
        const from = s.chainFrom;
        s.chainFrom = id;
        if (from && from !== id && !net.edges.some((e) => (e.a === from && e.b === id) || (e.a === id && e.b === from))) apply({ ...net, edges: [...net.edges, { a: from, b: id }] });
        else redraw();
      }
    },
    clickEdge(index, at) {
      const net = s.network;
      const edge = net.edges[index];
      if (s.mode === "select") {
        s.selection = { kind: "edge", index };
        redraw();
      }
      if (s.mode === "erase" && canEdit) {
        s.selection = null;
        apply({ ...net, edges: net.edges.filter((_, i) => i !== index) });
      }
      if (s.mode === "draw" && canEdit) {
        // Split the line where it was clicked, then continue the chain from there.
        const a = net.nodes.find((n) => n.id === edge.a);
        const b = net.nodes.find((n) => n.id === edge.b);
        if (!a || !b) return;
        const point = projectOnSegment(at, a, b).point;
        const id = newId();
        let next = splitEdge(net, edge.a, edge.b, point, id);
        if (!next) return;
        if (s.chainFrom) next = { ...next, edges: [...next.edges, { a: s.chainFrom, b: id }] };
        s.chainFrom = id;
        apply(next);
      }
    },
    moveNode(id, at) {
      apply({ ...s.network, nodes: s.network.nodes.map((n) => (n.id === id ? { ...n, lat: at.lat, lng: at.lng } : n)) });
    },
    clickMap(at) {
      if (s.mode === "draw" && canEdit) edit.addNode(at);
      else if (s.mode === "test") {
        s.testStart = at;
        redraw();
      } else {
        s.selection = null;
        redraw();
      }
    },
  };
  map.on("click", (e) => edit.clickMap(e.latlng));

  /* ---------------- checks */

  const testRoute = () => {
    const b = buildings.find((x) => x.id === s.testTarget);
    const p = b && buildingLatLng(b);
    return s.testStart && p ? planCampusRoute(s.network, s.testStart, { ...p, buildingId: b.id, name: b.name }) : null;
  };

  const stats = () => {
    const net = s.network;
    const comp = networkComponents(net);
    const entrances = new Map(net.nodes.filter((n) => n.buildingId).map((n) => [n.buildingId, n]));
    const withCoords = buildings.filter((b) => buildingLatLng(b));
    const missing = withCoords.filter((b) => !entrances.has(b.id));
    // The biggest connected part is "the campus"; entrances outside it are unreachable.
    const sizes = new Map();
    comp.forEach((c) => sizes.set(c, (sizes.get(c) ?? 0) + 1));
    const main = [...sizes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    const islands = withCoords.filter((b) => entrances.has(b.id) && comp.get(entrances.get(b.id).id) !== main);
    return { length: networkLength(net), missing, islands, gates: net.nodes.filter((n) => n.gate).length };
  };

  /* ---------------- drawing */

  function drawMap(route) {
    layer.clearLayers();
    const net = s.network;
    const byId = new Map(net.nodes.map((n) => [n.id, n]));
    for (const b of buildings) {
      const p = buildingLatLng(b);
      if (!p) continue;
      L.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 1, fillColor: b.accent, fillOpacity: 0.9, interactive: false })
        .bindTooltip(b.shortName, { permanent: true, direction: "right", className: "bname", offset: [6, 0] })
        .addTo(layer);
    }
    net.edges.forEach((e, index) => {
      const a = byId.get(e.a);
      const b = byId.get(e.b);
      if (!a || !b) return;
      const selected = s.selection?.kind === "edge" && s.selection.index === index;
      const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: selected ? "#f59e0b" : "#1a73e8", weight: selected ? 7 : 5, opacity: 0.9 });
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: "#000", opacity: 0, weight: 18 }) // wide invisible hit area
        .on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          edit.clickEdge(index, ev.latlng);
        })
        .addTo(layer);
      line.addTo(layer);
      if (e.name) line.bindTooltip(e.name, { sticky: true });
    });
    if (route) L.polyline(route.path, { color: "#e8563f", weight: 6, opacity: 0.9 }).addTo(layer);
    if (s.testStart) L.circleMarker([s.testStart.lat, s.testStart.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#16a34a", fillOpacity: 1 }).addTo(layer);
    for (const node of net.nodes) {
      const selected = s.selection?.kind === "node" && s.selection.id === node.id;
      const marker = L.marker([node.lat, node.lng], { icon: nodeIcon(node, selected, s.chainFrom === node.id), draggable: canEdit && s.mode === "select", zIndexOffset: selected ? 1000 : 0 });
      marker.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        edit.clickNode(node.id);
      });
      marker.on("dragend", () => edit.moveNode(node.id, marker.getLatLng()));
      if (node.name) marker.bindTooltip(node.name, { direction: "top" });
      marker.addTo(layer);
    }
  }

  function toolsHtml() {
    const modes = MODES.filter(({ mode }) => canEdit || mode === "select" || mode === "test");
    return html`<div class="tabs">${modes.map((m) =>
        raw(html`<button type="button" class="${s.mode === m.mode ? "on" : ""}" data-w="mode" data-mode="${m.mode}">${m.label}</button>`))}</div>
      ${canEdit
        ? raw(html`<button type="button" class="icon-btn" data-w="undo" ${s.history.length ? "" : "disabled"} aria-label="ย้อนกลับ" title="ย้อนกลับ (Ctrl+Z)">${raw(icon("undo"))}</button>
            <button type="button" class="icon-btn" data-w="redo" ${s.future.length ? "" : "disabled"} aria-label="ทำซ้ำ" title="ทำซ้ำ (Ctrl+Y)">${raw(icon("redo"))}</button>`)
        : ""}
      <label class="switch" style="font-size:13px;font-weight:700"><input type="checkbox" data-w="satellite" ${s.satellite ? "checked" : ""} /> ภาพดาวเทียม</label>
      ${canEdit
        ? raw(html`<span style="margin-left:auto;display:flex;gap:8px">
            <button type="button" class="btn outline" data-w="reset">${raw(icon("refresh"))} คืนค่าเริ่มต้น</button>
            <button type="button" class="btn" data-w="save" ${s.dirty ? "" : "disabled"}>${raw(icon("save"))} ${s.dirty ? "บันทึก" : "บันทึกแล้ว"}</button></span>`)
        : ""}`;
  }

  function sideHtml(route) {
    const st = stats();
    const net = s.network;
    const focusChips = (list) => list.map((b) => raw(html`<button type="button" class="chip" data-w="focus" data-id="${b.id}">${b.shortName}</button>`));
    let out = html`<div class="card" style="font-size:13px">
      <strong>สถานะโครงข่าย</strong> ${s.source === "default" && !s.dirty ? raw('<span class="pill" style="color:var(--warn);background:var(--warn-bg)">ค่าเริ่มต้นจาก OSM</span>') : ""}
      <p class="muted" style="margin:8px 0 0">${net.nodes.length} จุด · ${net.edges.length} เส้น · ทางเดินรวม ${formatDistance(st.length)} · ประตู ${st.gates}</p>
      ${st.missing.length
        ? raw(html`<div class="banner" style="margin:12px 0 0;display:block"><strong>ยังไม่มีทางเข้า ${st.missing.length} อาคาร</strong>
            <div class="chips" style="margin-top:6px">${focusChips(st.missing)}</div>
            ${canEdit ? raw(html`<button type="button" class="btn outline small" style="margin-top:8px" data-w="connect">${raw(icon("wand"))} ต่อทางเข้าอัตโนมัติ (ต่อกับทางที่ใกล้ที่สุด)</button>`) : ""}</div>`)
        : ""}
      ${st.islands.length
        ? raw(html`<div class="banner" style="margin:12px 0 0;display:block"><strong>ไปไม่ถึงจากทางหลัก ${st.islands.length} อาคาร — วาดทางเชื่อมให้ติดกัน</strong>
            <div class="chips" style="margin-top:6px">${focusChips(st.islands)}</div></div>`)
        : ""}
      ${!st.missing.length && !st.islands.length ? raw('<p style="margin:8px 0 0;color:#16a34a;font-weight:700">✓ ทุกอาคารมีทางเข้าและเดินถึงกันได้</p>') : ""}
    </div>`;

    const node = s.selection?.kind === "node" ? net.nodes.find((n) => n.id === s.selection.id) : null;
    const edge = s.selection?.kind === "edge" ? net.edges[s.selection.index] : null;
    if (canEdit && s.mode === "select" && node) {
      out += html`<div class="card stack" style="font-size:13px"><strong>จุดที่เลือก</strong>
        <label class="field"><span>ชื่อจุด (ใช้ในคำบอกทาง)</span><input data-w="node-name" value="${node.name ?? ""}" placeholder="เช่น โรงอาหาร, เสาธง" /></label>
        <label class="field"><span>เป็นทางเข้าของอาคาร</span><select data-w="node-building"><option value="">— ไม่ใช่ทางเข้าอาคาร —</option>
          ${buildings.map((b) => raw(html`<option value="${b.id}" ${node.buildingId === b.id ? "selected" : ""}>${b.name}</option>`))}</select></label>
        <label class="switch" style="font-weight:700"><input type="checkbox" data-w="node-gate" ${node.gate ? "checked" : ""} /> เป็นประตูเข้า-ออกวิทยาลัย</label></div>`;
    }
    if (canEdit && s.mode === "select" && edge) {
      out += html`<div class="card stack" style="font-size:13px"><strong>เส้นทางเดินที่เลือก</strong>
        <label class="field"><span>ชื่อทางเดิน (ไม่บังคับ)</span><input data-w="edge-name" value="${edge.name ?? ""}" placeholder="เช่น ทางเดินมีหลังคา" /></label>
        <p class="muted" style="margin:0">ตั้งชื่อต่อเนื่องหลายเส้นได้ คำบอกทางจะเป็น "เลี้ยวซ้ายเข้า&lt;ชื่อ&gt;"</p></div>`;
    }
    if (s.mode === "test") {
      const target = buildings.find((b) => b.id === s.testTarget);
      out += html`<div class="card stack" style="font-size:13px"><strong>ทดลองเส้นทาง</strong>
        <p class="muted" style="margin:0">${s.testStart ? "จุดเริ่ม: จุดสีเขียวบนแผนที่ (คลิกใหม่เพื่อย้าย)" : "คลิกบนแผนที่เพื่อวางจุดเริ่ม"}</p>
        <select class="input" data-w="test-target"><option value="">— เลือกอาคารปลายทาง —</option>
          ${buildings.map((b) => raw(html`<option value="${b.id}" ${s.testTarget === b.id ? "selected" : ""}>${b.name}</option>`))}</select>
        ${s.testStart && target && !route ? raw('<p style="margin:0;color:var(--danger);font-weight:700">ไม่พบเส้นทาง — จุดเริ่มกับอาคารนี้ไม่ได้เชื่อมกัน</p>') : ""}
        ${route
          ? raw(html`<p style="margin:0;font-weight:700">เดิน ${formatDistance(route.distance)} · ~${Math.max(1, Math.round(route.duration / 60))} นาที${route.offCampus ? " (เริ่มจากประตู)" : ""}</p>
              <ol style="margin:0;padding:0;list-style:none;display:grid;gap:4px">${route.steps.map((st2) =>
                raw(html`<li style="display:flex;gap:8px;align-items:center"><span style="color:var(--blue);display:grid;width:16px">${raw(turnIcon(st2.maneuver))}</span>
                  <span style="flex:1">${st2.instruction}</span>${st2.distance > 0 ? raw(html`<b class="muted">${formatDistance(st2.distance)}</b>`) : ""}</li>`))}</ol>`)
          : ""}</div>`;
    }
    return out;
  }

  function redraw() {
    const route = testRoute();
    drawMap(route);
    part("tools").innerHTML = toolsHtml();
    const m = MODES.find((x) => x.mode === s.mode);
    part("hint").textContent = m.hint + (s.mode === "draw" && s.chainFrom ? " · กำลังวาดต่อจากจุดสีเหลือง" : "");
    part("map").style.cursor = s.mode === "draw" || s.mode === "test" ? "crosshair" : "";
    // Keep the cursor in a name box while typing in it.
    const typing = document.activeElement?.dataset?.w;
    if (typing !== "node-name" && typing !== "edge-name") part("side").innerHTML = sideHtml(route);
  }

  /* ---------------- controls */

  const updateNode = (patch) => {
    const sel = s.selection;
    if (sel?.kind !== "node") return;
    apply({ ...s.network, nodes: s.network.nodes.map((n) => (n.id === sel.id ? cleanNode({ ...n, ...patch }) : n)) });
  };

  page.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-w]");
    if (!b) return;
    switch (b.dataset.w) {
      case "mode":
        s.mode = b.dataset.mode;
        if (s.mode !== "draw") s.chainFrom = null;
        redraw();
        break;
      case "undo":
        undo();
        break;
      case "redo":
        redo();
        break;
      case "focus": {
        const building = buildings.find((x) => x.id === b.dataset.id);
        const p = building && buildingLatLng(building);
        if (p) map.flyTo([p.lat, p.lng], 20);
        break;
      }
      case "connect": {
        let next = s.network;
        const missing = stats().missing;
        for (const building of missing) {
          const p = buildingLatLng(building);
          next = connectBuildingEntrance(next, { id: building.id, name: building.shortName, lat: p.lat, lng: p.lng }).network;
        }
        apply(next);
        toast(`ต่อทางเข้าให้ ${missing.length} อาคาร — ตรวจดูว่าเส้นที่ต่อไม่ผ่านกำแพงหรือสนาม`);
        break;
      }
      case "save": {
        const input = validate(walkNetworkSchema, s.network);
        if (!input) return;
        b.disabled = true;
        try {
          await apiPost("admin/walkNetwork/save", input);
          toast("บันทึกทางเดินแล้ว — เส้นทางบนหน้าเว็บใช้ข้อมูลใหม่ทันที");
          s.dirty = false;
          s.source = "saved";
        } catch (error) {
          toastError(error);
        }
        redraw();
        break;
      }
      case "reset": {
        if (!(await confirmDialog("คืนค่าทางเดินเริ่มต้น?", "ลบทางเดินที่บันทึกไว้ทั้งหมด แล้วกลับไปใช้ทางเดินเริ่มต้นจาก OpenStreetMap", "คืนค่าเริ่มต้น"))) return;
        try {
          await apiPost("admin/walkNetwork/reset");
          toast("คืนค่าเป็นทางเดินเริ่มต้นจาก OpenStreetMap แล้ว");
          const fresh = await apiGet("admin/walkNetwork/get");
          const { source: src, ...net } = fresh;
          Object.assign(s, { network: net, source: src, history: [], future: [], dirty: false, selection: null, chainFrom: null });
          redraw();
        } catch (error) {
          toastError(error);
        }
        break;
      }
    }
  });

  page.addEventListener("change", (e) => {
    const w = e.target.dataset.w;
    if (w === "satellite") {
      s.satellite = e.target.checked;
      if (s.satellite) {
        osm.remove();
        sat.addTo(map);
      } else {
        sat.remove();
        osm.addTo(map);
      }
    }
    if (w === "node-building") updateNode({ buildingId: e.target.value || undefined });
    if (w === "node-gate") updateNode({ gate: e.target.checked || undefined });
    if (w === "test-target") {
      s.testTarget = e.target.value;
      redraw();
    }
  });
  page.addEventListener("input", (e) => {
    const w = e.target.dataset.w;
    if (w === "node-name") updateNode({ name: e.target.value });
    if (w === "edge-name" && s.selection?.kind === "edge") {
      const name = e.target.value;
      const index = s.selection.index;
      apply({ ...s.network, edges: s.network.edges.map((ed, i) => (i === index ? (name.trim() ? { ...ed, name } : { a: ed.a, b: ed.b }) : ed)) });
    }
  });

  // Esc ends the drawing chain; Ctrl+Z / Ctrl+Y undo / redo.
  const onKey = (event) => {
    if (event.target?.closest?.("input, textarea, select")) return;
    if (event.key === "Escape") {
      s.chainFrom = null;
      redraw();
    }
    if (!canEdit) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
  };
  window.addEventListener("keydown", onKey);
  // Leaving with unsaved drawing → ask first.
  const onLeave = (event) => {
    if (s.dirty) event.preventDefault();
  };
  window.addEventListener("beforeunload", onLeave);

  redraw();

  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("beforeunload", onLeave);
    map.remove();
  };
}
