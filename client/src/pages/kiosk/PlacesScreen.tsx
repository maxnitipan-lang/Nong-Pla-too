// Kiosk places page: search + filters on the left, campus map in the middle,
// the chosen building (route, details, QR for phones) on the right.
import { QrCode, phoneRouteUrl } from "@/components/common/QrCode";
import { CampusLeafletMap } from "@/components/map/CampusLeafletMap";
import { NavBanner, RoutePanel, navSummary } from "@/components/map/RoutePanel";
import type { CampusNavigation } from "@/hooks/useCampusNavigation";
import { buildingSearchText, hasCoords, walkingDeepLink } from "@/lib/directions";
import { CAMPUS_OVERVIEW } from "@shared/campus";
import type { CampusBuilding } from "@shared/campus";
import { ArrowLeft, ChevronRight, CircleHelp, ExternalLink, Layers3, Navigation, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { BuildingBadge, DepartmentPanel, buildingMarkerHtml, departmentFor } from "./departments";

const CATEGORIES = ["ทั้งหมด", "สายอุตสาหกรรม", "พาณิชยกรรม/คหกรรม/สามัญ", "บริหาร-สนับสนุน", "ส่วนกลาง-กิจกรรม"];
const ACTIVITIES = ["ทุกกิจกรรม", "เวิร์กช็อป", "แข่งขัน", "ฝึก", "เยี่ยมชม"];

type Props = {
  buildings: CampusBuilding[];
  selected: CampusBuilding | undefined;
  nav: CampusNavigation;
  /** The kiosk's own location (set in /admin/settings); routes start here. */
  kiosk: { name: string; lat: number; lng: number } | null;
  onSelect: (id: string) => void;
  onShowRoute: (id: string) => void;
  onBack: () => void;
};

export function PlacesScreen({ buildings, selected, nav, kiosk, onSelect, onShowRoute, onBack }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [activity, setActivity] = useState(ACTIVITIES[0]);

  const filtered = useMemo(
    () =>
      buildings.filter(building => {
        const matchesText = buildingSearchText(building).includes(query.trim().toLowerCase());
        const matchesCategory = category === CATEGORIES[0] || building.category === category;
        const matchesActivity =
          activity === ACTIVITIES[0] ||
          departmentFor(building).some(department => (department.activities ?? []).some(a => a.includes(activity)));
        return matchesText && matchesCategory && matchesActivity;
      }),
    [buildings, query, category, activity]
  );

  return (
    <section className="flex-1 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 flex items-center gap-2 text-xs font-black text-[#287c78]"
          >
            <ArrowLeft size={15} /> กลับหน้าเมนู
          </button>
          <p className="text-xs font-black tracking-[0.16em] text-[#398e89]">01 / CAMPUS PLACES</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--ink)] sm:text-4xl">
            ค้นหาสถานที่ในวิทยาลัย
          </h1>
          <p className="mt-2 text-sm font-bold text-[var(--muted-foreground)]">
            แตะโลโก้แผนกบนหมุด เพื่อดูอาคาร ชั้น ห้อง และกิจกรรมในจุดเดียว
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full bg-white px-4 py-3 text-xs font-black shadow-sm sm:flex">
          <Layers3 size={16} className="text-[#398e89]" /> {buildings.length} อาคาร
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr_390px]">
        {/* Left: search, filters, building list */}
        <aside className="order-2 rounded-[26px] bg-white p-4 shadow-sm xl:order-1">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="ค้นหาชื่ออาคารหรือแผนก"
              className="h-12 w-full rounded-2xl bg-[#f2f8f5] pl-10 pr-3 text-sm font-bold outline-none ring-1 ring-[#dcebe5] focus:ring-2 focus:ring-[#8acfc7]"
            />
          </div>
          <div className="mt-4 space-y-2">
            <FilterChips
              options={CATEGORIES}
              value={category}
              onChange={setCategory}
              activeClass="bg-[var(--ink)] text-white"
              idleClass="bg-[#edf7f3] text-[#287c78]"
            />
            <FilterChips
              options={ACTIVITIES}
              value={activity}
              onChange={setActivity}
              activeClass="bg-[#eb8b67] text-white"
              idleClass="bg-[#fff3ed] text-[#b85e46]"
            />
            {filtered.map(building => (
              <button
                key={building.id}
                type="button"
                onClick={() => onSelect(building.id)}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors ${building.id === selected?.id ? "bg-[#e4f4f0]" : "hover:bg-[#f5faf7]"}`}
              >
                <BuildingBadge building={building} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-[var(--ink)]">{building.name}</span>
                  <span className="mt-1 block text-[10px] font-bold text-[var(--muted-foreground)]">
                    {departmentFor(building).length} แผนก · {building.floors} ชั้น
                  </span>
                </span>
                <ChevronRight size={16} className="text-[var(--muted-foreground)]" />
              </button>
            ))}
          </div>
        </aside>

        {/* Middle: the map */}
        <div className="order-1 rounded-[26px] bg-[#dff3ef] p-3 shadow-sm xl:order-2">
          <div className="relative isolate h-[520px] overflow-hidden rounded-[21px] bg-[#cfe6df] sm:h-[620px]">
            <CampusLeafletMap
              buildings={buildings}
              selectedId={selected?.id}
              onSelect={onSelect}
              center={CAMPUS_OVERVIEW.mapCenter}
              renderMarkerHtml={buildingMarkerHtml}
              route={nav.route}
              approachPath={nav.approachPath}
              userFix={nav.fix}
              followUser={nav.live}
              activeStep={nav.progress?.stepIndex}
              userLabel={kiosk ? "คุณอยู่ที่นี่" : undefined}
            />
            <NavBanner nav={nav} />
            <div className="pointer-events-none absolute left-4 top-4 z-[1000] rounded-full bg-[var(--ink)] px-4 py-2 text-[10px] font-black text-white shadow-lg">
              โลโก้บนหมุด = แผนกหลักของอาคาร
            </div>
            {nav.status !== "idle" ? (
              <button
                type="button"
                onClick={nav.clear}
                className="absolute bottom-4 left-4 z-[1000] flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2.5 text-left text-[11px] font-black text-white shadow-lg"
              >
                <Navigation size={14} className="shrink-0" /> <span>{navSummary(nav)}</span>{" "}
                <X size={14} className="ml-1 shrink-0" />
              </button>
            ) : (
              <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-[10px] font-black text-[var(--ink)]">
                <Navigation size={13} className="text-[#eb8b67]" /> แตะหมุดเพื่อเปิดข้อมูลรวม
              </div>
            )}
          </div>
        </div>

        {/* Right: the chosen building */}
        <aside className="order-3 rounded-[26px] bg-white p-5 shadow-sm">
          {selected ? (
            <BuildingDetail building={selected} nav={nav} kiosk={kiosk} onShowRoute={onShowRoute} />
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center text-sm font-bold text-[var(--muted-foreground)]">
              <CircleHelp size={32} className="mb-3" />
              เลือกหมุดบนแผนที่
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function FilterChips({
  options,
  value,
  onChange,
  activeClass,
  idleClass,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  activeClass: string;
  idleClass: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map(option => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black ${value === option ? activeClass : idleClass}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Route panel, building info, navigation buttons and a QR to continue on a phone. */
function BuildingDetail({
  building,
  nav,
  kiosk,
  onShowRoute,
}: {
  building: CampusBuilding;
  nav: CampusNavigation;
  kiosk: Props["kiosk"];
  onShowRoute: (id: string) => void;
}) {
  return (
    <>
      <RoutePanel nav={nav} className="mb-4" />
      <DepartmentPanel building={building} />
      <div className="mt-5 grid grid-cols-2 gap-2">
        {hasCoords(building) ? (
          <button
            type="button"
            onClick={() => onShowRoute(building.id)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] text-xs font-black text-white"
          >
            <Navigation size={15} /> {kiosk ? "ดูเส้นทางจากตู้นี้" : "ดูเส้นทางในแอป"}
          </button>
        ) : (
          <a
            href={walkingDeepLink(building)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] text-xs font-black text-white"
          >
            <Navigation size={15} /> นำทาง (Google Maps)
          </a>
        )}
        <a
          href={walkingDeepLink(building)}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e4f4f0] text-xs font-black text-[#287c78]"
        >
          <ExternalLink size={15} /> Google Maps
        </a>
      </div>
      {nav.status === "idle" && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#f2f8f5] p-3">
          <QrCode value={phoneRouteUrl(building.id, false)} className="w-24 shrink-0" label="QR เปิดอาคารนี้บนมือถือ" />
          <p className="text-[11px] font-bold leading-5 text-[var(--muted-foreground)]">
            <span className="block text-xs font-black text-[var(--ink)]">ดูอาคารนี้บนมือถือ</span>
            สแกนด้วยกล้องมือถือ แล้วกดนำทาง — มือถือจะพาเดินด้วย GPS
          </p>
        </div>
      )}
    </>
  );
}
