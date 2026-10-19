import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Flag, Footprints, Loader2, Navigation, Square, Undo2, Volume2, VolumeX, X } from "lucide-react";
import type { Maneuver } from "@shared/walkNetwork";
import type { CampusNavigation } from "@/hooks/useCampusNavigation";
import { formatDistance } from "@/lib/directions";
import { cn } from "@/lib/utils";
import { QrCode, phoneRouteUrl } from "@/components/QrCode";

const ICONS: Record<Maneuver, typeof ArrowUp> = {
  depart: Footprints,
  straight: ArrowUp,
  "slight-left": ArrowUpLeft,
  left: CornerUpLeft,
  "sharp-left": CornerUpLeft,
  "slight-right": ArrowUpRight,
  right: CornerUpRight,
  "sharp-right": CornerUpRight,
  uturn: Undo2,
  arrive: Flag,
};

const minutes = (m: number) => Math.max(1, Math.round(m / 1.25 / 60));

export function ManeuverIcon({ maneuver, className }: { maneuver: Maneuver; className?: string }) {
  const Icon = ICONS[maneuver];
  return <Icon className={className} />;
}

/** One-line summary for the pill on the map: off-campus leg + campus walk. */
export function navSummary(nav: CampusNavigation): string {
  if (nav.message) return nav.message;
  if (!nav.route) return "กำลังหาเส้นทาง…";
  if (nav.progress?.arrived) return "ถึงแล้ว · ปิดเส้นทาง";
  const campus = nav.progress?.remaining ?? nav.route.distance;
  if (nav.route.offCampus) {
    return `มาที่ประตู ~${formatDistance(nav.approachDistance)} + ในวิทยาลัย ~${formatDistance(campus)} · ปิดเส้นทาง`;
  }
  return `เดิน ~${formatDistance(campus)} · ~${minutes(campus)} นาที · ปิดเส้นทาง`;
}

/** Big "next instruction" banner laid over the top of the map while a route is shown. */
export function NavBanner({ nav }: { nav: CampusNavigation }) {
  const { route, progress, live } = nav;
  if (!route || !progress) return null;
  if (route.offCampus) {
    // Still outside: the only instruction is "get to the gate".
    return (
      <div className="pointer-events-none absolute left-3 right-14 top-3 z-[1001] flex items-center gap-3 rounded-2xl bg-[#1a73e8] px-4 py-3 text-white shadow-[0_10px_30px_rgba(26,115,232,0.35)]">
        <Navigation className="h-7 w-7 shrink-0" />
        <div className="min-w-0">
          <p className="text-lg font-black leading-tight">{formatDistance(nav.approachDistance)}</p>
          <p className="text-sm font-bold leading-snug">เดินมาที่{route.offCampus.gateName ?? "ทางเข้าวิทยาลัย"} แล้วเริ่มนำทางในวิทยาลัย</p>
        </div>
      </div>
    );
  }
  const idx = progress.stepIndex;
  const current = route.steps[idx];
  // While walking, show the *next* maneuver and how far away it is.
  const next = live && !progress.arrived ? route.steps[idx + 1] ?? current : current;
  const toNext = live && !progress.arrived ? Math.max(0, next.startAlong - progress.along) : current.distance;
  return (
    <div className="pointer-events-none absolute left-3 right-14 top-3 z-[1001] flex items-center gap-3 rounded-2xl bg-[#1a73e8] px-4 py-3 text-white shadow-[0_10px_30px_rgba(26,115,232,0.35)]">
      <ManeuverIcon maneuver={progress.arrived ? "arrive" : next.maneuver} className="h-8 w-8 shrink-0" />
      <div className="min-w-0">
        {!progress.arrived && next.maneuver !== "arrive" && <p className="text-lg font-black leading-tight">{formatDistance(toNext)}</p>}
        <p className="text-sm font-bold leading-snug">{progress.arrived ? route.steps[route.steps.length - 1].instruction : next.instruction}</p>
      </div>
    </div>
  );
}

/**
 * Route summary + turn-by-turn list + live navigation controls, like a maps app.
 * `compact` hides the step list (for tight layouts); the list still shows while navigating.
 */
export function RoutePanel({ nav, className }: { nav: CampusNavigation; className?: string }) {
  const { status, message, route, progress, live, target, approachDistance } = nav;
  if (status === "idle") return null;

  const busy = status === "locating" || status === "routing";
  const remaining = progress?.remaining ?? route?.distance ?? 0;

  return (
    <div className={cn("rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black tracking-[0.14em] text-[#1a73e8]">เส้นทางเดินในวิทยาลัย</p>
          <p className="mt-1 truncate text-sm font-black text-[var(--ink)]">ไป {target?.name ?? "…"}</p>
          {nav.fixedStart && <p className="truncate text-[11px] font-bold text-[var(--muted-foreground)]">เริ่มจาก: {nav.fixedStart.name} (คุณอยู่ที่นี่)</p>}
          {route && !busy && (
            <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">
              {progress?.arrived ? "ถึงแล้ว 🎉" : `เดิน ~${formatDistance(remaining)} · ~${minutes(remaining)} นาที`}
            </p>
          )}
        </div>
        <button type="button" onClick={nav.clear} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--ink)]" aria-label="ปิดเส้นทาง">
          <X size={15} />
        </button>
      </div>

      {(busy || message) && (
        <p className={cn("mt-3 flex items-center gap-2 text-xs font-bold", status === "error" ? "text-[#c46242]" : "text-[var(--muted-foreground)]")}>
          {busy && <Loader2 size={14} className="animate-spin" />} {message}
        </p>
      )}
      {status === "error" && nav.targetId && (
        <button type="button" onClick={() => void nav.routeTo(nav.targetId!)} className="mt-2 flex h-10 items-center gap-2 rounded-xl bg-[var(--ink)] px-4 text-xs font-black text-white">
          <Navigation size={14} /> ลองอีกครั้ง
        </button>
      )}

      {route?.offCampus && !busy && (
        <p className="mt-3 rounded-xl bg-[#fff6e5] px-3 py-2 text-[11px] font-bold leading-5 text-[#8a6412]">
          คุณอยู่นอกวิทยาลัย — เดินมาที่{route.offCampus.gateName ?? "ทางเข้าวิทยาลัย"}ก่อน (~{formatDistance(approachDistance)}, เส้นประบนแผนที่) แล้วเส้นทางในวิทยาลัยจะเริ่มนำทางให้อัตโนมัติ
        </p>
      )}

      {route && !busy && nav.fixedStart && nav.targetId && (
        // Kiosk: the walker leaves the kiosk — hand the route over to their phone.
        <div className="mt-3 flex items-center gap-4 rounded-2xl bg-[#e8f0fe] p-3">
          <QrCode value={phoneRouteUrl(nav.targetId)} className="w-32 shrink-0" label="QR สำหรับนำทางต่อบนมือถือ" />
          <div className="min-w-0">
            <p className="text-sm font-black text-[#1a4fa8]">สแกนเพื่อเดินตามเส้นทางนี้บนมือถือ</p>
            <p className="mt-1 text-[11px] font-bold leading-5 text-[var(--muted-foreground)]">
              มือถือจะนำทางทีละโค้งด้วย GPS พร้อมเสียงบอกทาง — ใช้กล้องมือถือสแกนได้เลย ไม่ต้องลงแอป
            </p>
          </div>
        </div>
      )}

      {route && !busy && !nav.fixedStart && (
        <div className="mt-3 flex gap-2">
          {live ? (
            <button type="button" onClick={nav.stopLive} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#c46242] text-xs font-black text-white">
              <Square size={14} /> หยุดนำทาง
            </button>
          ) : (
            !progress?.arrived && (
              <button type="button" onClick={nav.startLive} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1a73e8] text-xs font-black text-white">
                <Navigation size={15} /> เริ่มนำทาง
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => nav.setVoice((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--ink)]"
            aria-label={nav.voice ? "ปิดเสียงบอกทาง" : "เปิดเสียงบอกทาง"}
            title={nav.voice ? "ปิดเสียงบอกทาง" : "เปิดเสียงบอกทาง"}
          >
            {nav.voice ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      )}

      {route && !busy && (
        <ol className="mt-3 max-h-[300px] space-y-1 overflow-y-auto pr-1">
          {route.steps.map((step, index) => {
            const active = progress ? index === progress.stepIndex : index === 0;
            const done = progress ? index < progress.stepIndex : false;
            return (
              <li
                key={`${index}-${step.startAlong}`}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
                  active && live ? "bg-[#e8f0fe]" : "",
                  done ? "opacity-45" : "",
                )}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", step.maneuver === "arrive" ? "bg-[#e8563f] text-white" : "bg-[#e8f0fe] text-[#1a73e8]")}>
                  <ManeuverIcon maneuver={step.maneuver} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-xs font-bold leading-5 text-[var(--ink)]">{step.instruction}</span>
                {step.distance > 0 && <span className="shrink-0 text-[11px] font-black text-[var(--muted-foreground)]">{formatDistance(step.distance)}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
