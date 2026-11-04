import { useEffect, useRef, useState } from "react";
import { Compass, Minus, Plus, RotateCcw, Square } from "lucide-react";
import type { CampusBuilding } from "@shared/campus";
import type { CampusRoute, LatLngTuple } from "@shared/walkNetwork";
import type { GpsFix } from "@/lib/directions";
import { CampusScene, DARK_PALETTE, LIGHT_PALETTE, webglAvailable } from "@/lib/campus3d";
import { cn } from "@/lib/utils";

/**
 * 3D campus map — three.js, buildings extruded from OpenStreetMap footprints
 * (shared/data/campusFootprints.json) to their real number of floors.
 *
 * Takes the same data props as CampusLeafletMap, so a page can swap one for the
 * other: same buildings, selection, walking route and GPS fix.
 *
 * Touch: one finger = pan, two fingers = zoom/rotate/tilt. Mouse: left = pan,
 * right = rotate/tilt, wheel = zoom. Tap a building or its label to select it.
 */
export type CampusMap3DProps = {
  buildings: CampusBuilding[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Origin of the 3D scene (the campus map centre). */
  center: { lat: number; lng: number };
  className?: string;
  /** Custom label HTML (e.g. department-logo badge); default is a coloured name pill. */
  renderMarkerHtml?: (building: CampusBuilding, active: boolean) => string;
  route?: CampusRoute | null;
  approachPath?: LatLngTuple[] | null;
  userFix?: GpsFix | null;
  followUser?: boolean;
  activeStep?: number;
  /** Permanent label on the walker's dot, e.g. "คุณอยู่ที่นี่". */
  userLabel?: string;
  dark?: boolean;
  /** Shadows look nicer but cost GPU time (default true). */
  shadows?: boolean;
  /** Distance (px) of the control buttons from the top. */
  controlsTop?: number;
  /** WebGL isn't available on this PC/browser — the page should show the 2D map instead. */
  onUnsupported?: () => void;
};

function defaultLabel(building: CampusBuilding, active: boolean) {
  return `<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:999px;padding:4px 10px 4px 5px;background:#fff;color:#082c4a;font-weight:800;font-size:11px;box-shadow:0 4px 12px rgba(8,44,74,.22);${active ? `outline:3px solid ${building.accent}` : ""}">
    <span style="width:14px;height:14px;border-radius:50%;background:${building.accent};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.08)"></span>${building.shortName}</span>`;
}

/** One label per drawn building; `ids` = every campus unit inside it (e.g. offices in one block). */
type Label = { el: HTMLDivElement; ids: string[]; anchor: { x: number; y: number; z: number }; size?: [number, number] };

export function CampusMap3D({
  buildings,
  selectedId,
  onSelect,
  center,
  className,
  renderMarkerHtml,
  route,
  approachPath,
  userFix,
  followUser = false,
  activeStep,
  userLabel,
  dark = false,
  shadows = true,
  controlsTop = 16,
  onUnsupported,
}: CampusMap3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const userTagRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<CampusScene | null>(null);
  const labelListRef = useRef<Label[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [failed, setFailed] = useState(false);
  const routeKeyRef = useRef<string>("");

  // 1. Create the scene once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!webglAvailable()) {
      setFailed(true);
      onUnsupported?.();
      return;
    }
    let scene: CampusScene;
    try {
      scene = new CampusScene(canvas, {
        origin: center,
        palette: dark ? DARK_PALETTE : LIGHT_PALETTE,
        shadows,
        onPick: (id) => onSelectRef.current?.(id),
      });
    } catch (err) {
      console.warn("[CampusMap3D] WebGL failed", err);
      setFailed(true);
      onUnsupported?.();
      return;
    }
    sceneRef.current = scene;

    const pos = { x: 0, y: 0, depth: 0 };
    scene.onFrame = () => {
      // Labels: follow the roof tops, shrink with distance, nearer ones on top.
      // Where two labels collide the farther one is hidden (the selected one always shows).
      const shown: { l: number; t: number; r: number; b: number }[] = [];
      const placed: { label: Label; x: number; y: number; depth: number; selected: boolean }[] = [];
      for (const label of labelListRef.current) {
        if (!scene.toScreenXYZ(label.anchor.x, label.anchor.y + 1.5, label.anchor.z, pos)) {
          label.el.style.display = "none";
          continue;
        }
        placed.push({ label, x: pos.x, y: pos.y, depth: pos.depth, selected: label.ids.includes(selectedRef.current ?? "") });
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
      const tag = userTagRef.current;
      const ua = scene.userAnchor();
      if (tag) {
        if (ua && scene.toScreenXYZ(ua.x, ua.y + 4, ua.z, pos)) {
          tag.style.display = "";
          tag.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
        } else tag.style.display = "none";
      }
      if (needleRef.current) needleRef.current.style.transform = `rotate(${-scene.heading()}deg)`;
    };

    const ro = new ResizeObserver(() => scene.resize(canvas.clientWidth, canvas.clientHeight));
    ro.observe(canvas);
    scene.resize(canvas.clientWidth, canvas.clientHeight);
    return () => {
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // The scene is built once; later prop changes go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const renderRef = useRef(renderMarkerHtml);
  renderRef.current = renderMarkerHtml;
  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;
  const firstBuildRef = useRef(true);
  const firstSelectRef = useRef(true);

  // 2. Buildings + labels (rebuilt when the list changes, e.g. edited in admin).
  useEffect(() => {
    const scene = sceneRef.current;
    const host = labelsRef.current;
    if (!scene || !host) return;
    const placed = scene.setBuildings(buildings);
    if (firstBuildRef.current) {
      firstBuildRef.current = false;
      scene.jumpHome();
    }
    host.replaceChildren();
    const byId = new Map(buildings.map((b) => [b.id, b]));
    const labels: Label[] = [];
    for (const p of placed) {
      // One label per shape: several units in one building share it (see shownId).
      if (!p.ids.some((id) => byId.has(id))) continue;
      const el = document.createElement("div");
      el.className = "absolute left-0 top-0 cursor-pointer select-none will-change-transform";
      el.style.transformOrigin = "50% 100%";
      const label: Label = { el, ids: p.ids, anchor: { x: p.anchor.x, y: p.anchor.y, z: p.anchor.z } };
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current?.(shownId(label));
      });
      host.appendChild(el);
      labels.push(label);
    }
    labelListRef.current = labels;
    paintLabels();
    scene.setSelected(selectedRef.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings]);

  /** The unit a shared label stands for: the selected one if it's inside, else the first. */
  function shownId(label: Label) {
    const sel = selectedRef.current;
    return sel && label.ids.includes(sel) ? sel : label.ids[0];
  }

  function paintLabels() {
    const byId = new Map(buildingsRef.current.map((b) => [b.id, b]));
    for (const label of labelListRef.current) {
      const b = byId.get(shownId(label)) ?? label.ids.map((id) => byId.get(id)).find(Boolean);
      if (!b) continue;
      const html = (renderRef.current ?? defaultLabel)(b, b.id === selectedRef.current);
      if (label.el.dataset.html !== html) {
        label.el.innerHTML = html;
        label.el.dataset.html = html;
        // Unscaled size, for the collision check (measured once per content change).
        const prev = label.el.style.display;
        label.el.style.display = "";
        label.size = [label.el.offsetWidth, label.el.offsetHeight];
        label.el.style.display = prev;
      }
    }
    sceneRef.current?.invalidate();
  }

  // 3. Selection: highlight + fly there. A unit sharing a building with others highlights that building.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    // While a route is shown the route framing wins; otherwise fly to the building.
    // The page's first (automatic) selection doesn't move the camera — the campus overview stays.
    scene.setSelected(selectedId, !route && !firstSelectRef.current);
    firstSelectRef.current = false;
    paintLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // 4. Route (+ fit it on screen the first time it appears).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setRoute(route, approachPath, activeStep);
    const key = route ? `${route.path[0]?.join()}|${route.path[route.path.length - 1]?.join()}` : "";
    if (route && key !== routeKeyRef.current && !followUser) scene.frameRoute(route);
    routeKeyRef.current = key;
  }, [route, approachPath, activeStep, followUser]);

  // 5. The walker.
  useEffect(() => {
    sceneRef.current?.setUser(userFix, followUser);
  }, [userFix, followUser]);

  // 6. Day / night.
  useEffect(() => {
    sceneRef.current?.setPalette(dark ? DARK_PALETTE : LIGHT_PALETTE);
  }, [dark]);

  if (failed) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center bg-[#dff3ef] p-6 text-center text-sm font-bold text-[#082c4a]", className)}>
        เครื่องนี้แสดงแผนที่ 3D ไม่ได้ (ไม่รองรับ WebGL) — ใช้แผนที่ 2D แทน
      </div>
    );
  }

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 text-[#082c4a] shadow-[0_6px_16px_rgba(8,44,74,0.18)] backdrop-blur transition-colors hover:bg-white active:scale-95";

  return (
    <div className={cn("relative isolate h-full w-full overflow-hidden", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-none outline-none" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0 z-0 overflow-hidden [&>div]:pointer-events-auto" />
      <div ref={userTagRef} className="pointer-events-none absolute left-0 top-0 z-[1]" style={{ display: "none" }}>
        {userLabel && <span className="whitespace-nowrap rounded-full bg-[#1a73e8] px-2.5 py-1 text-[11px] font-black text-white shadow-md">{userLabel}</span>}
      </div>

      <div className="absolute right-4 z-[1000] flex flex-col gap-2" style={{ top: controlsTop }}>
        <button type="button" className={btn} onClick={() => sceneRef.current?.resetView()} title="ทิศเหนือ / มุมมองเริ่มต้น" aria-label="มุมมองเริ่มต้น">
          <span ref={needleRef} className="relative flex h-6 w-6 items-center justify-center transition-transform duration-75">
            <Compass size={22} />
            <span className="absolute -top-2.5 text-[9px] font-black text-[#e8563f]">N</span>
          </span>
        </button>
        <button type="button" className={btn} onClick={() => sceneRef.current?.zoomBy(0.7)} aria-label="ซูมเข้า">
          <Plus size={20} />
        </button>
        <button type="button" className={btn} onClick={() => sceneRef.current?.zoomBy(1.4)} aria-label="ซูมออก">
          <Minus size={20} />
        </button>
        <button type="button" className={btn} onClick={() => sceneRef.current?.topDown()} title="มองจากด้านบน" aria-label="มองจากด้านบน">
          <Square size={18} />
        </button>
        <button type="button" className={btn} onClick={() => sceneRef.current?.resetView()} title="มุมมองเริ่มต้น" aria-label="กลับมุมมองเริ่มต้น">
          <RotateCcw size={18} />
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-1 right-2 z-[1000] rounded bg-white/70 px-1.5 text-[9px] font-semibold text-[#36566d]">
        © OpenStreetMap contributors
      </div>
    </div>
  );
}
