/**
 * Nong Platoo Ontour — the redesigned UI (from the Figma Make prototype in D:\UI),
 * wired to the real app: campus buildings + news from the API, the walkway map
 * with turn-by-turn routes, and the น้องปลาทู chat/voice assistant.
 *
 * One look, two behaviours:
 *  - mode="kiosk" ( / ): routes start at the kiosk's location, QR hand-off to a phone,
 *    and the screen resets itself after 90 s without a touch.
 *  - mode="phone" ( /app ): GPS distance + live navigation, deep links from the kiosk QR.
 */
import "./platoo-ui.css";
import "./platoo-extra.css";
import { CampusAIWidget, openAssistant, openVoiceAssistant, resetAssistant } from "@/components/CampusAIWidget";
import { CampusLeafletMap } from "@/components/CampusLeafletMap";
import { MapModeToggle, useMapMode } from "@/components/MapModeToggle";
import { QrCode, phoneRouteUrl } from "@/components/QrCode";
import { NavBanner, RoutePanel } from "@/components/RoutePanel";
import { DEPARTMENT_LOGOS } from "@/config/kioskAssets";
import { useTheme } from "@/contexts/ThemeContext";
import { useCampusNavigation, type CampusNavigation } from "@/hooks/useCampusNavigation";
import { useIdle } from "@/hooks/useIdle";
import { buildingLatLng, buildingSearchText, formatDistance, hasCoords, walkingDeepLink, type GpsFix } from "@/lib/directions";
import { offlineData, useOnlineStatus } from "@/lib/offlineData";
import { trpc } from "@/lib/trpc";
import { CAMPUS_BUILDINGS, CAMPUS_CATEGORIES, CAMPUS_OVERVIEW, DEFAULT_DEPARTMENTS, type CampusBuilding, type CampusNewsItem, type DepartmentProfile } from "@shared/campus";
import { distanceM, planCampusRoute } from "@shared/walkNetwork";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Icon } from "./Icons";
import { InstallCard } from "./InstallCard";

// three.js is big — only download it when the 3D map is actually shown.
const CampusMap3D = lazy(() => import("@/components/CampusMap3D").then((m) => ({ default: m.CampusMap3D })));

type View = "home" | "map" | "news" | "departments";
type Mode = "kiosk" | "phone";
type Walk = { distance: number; minutes: number; offCampus: boolean } | null;

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: "home", label: "หน้าหลัก", icon: "home" },
  { id: "map", label: "แผนที่", icon: "map" },
  { id: "news", label: "ข่าวสาร", icon: "news" },
  { id: "departments", label: "สาขาวิชา", icon: "school" },
];

const GPS_OK_KEY = "nong-platoo-gps-ok";
const COLLEGE_NEWS_URL = "https://www.sstc.ac.th/news_325_1";

/* ------------------------------------------------------------------ data helpers */

/** Departments listed on a building (only floors that exist). */
const departmentsOf = (b: CampusBuilding) => (b.departments ?? []).filter((d) => d.floor <= b.floors);
const logoOf = (d: DepartmentProfile) => d.logo || DEPARTMENT_LOGOS[d.code];
const pinColor = (b: CampusBuilding) => departmentsOf(b)[0]?.accent ?? b.accent;

type DepartmentEntry = { department: DepartmentProfile; building?: CampusBuilding };

/** Every department from the admin data, once each, with the building it's in. */
function collectDepartments(buildings: CampusBuilding[]): DepartmentEntry[] {
  const seen = new Map<string, DepartmentEntry>();
  for (const building of buildings) {
    for (const department of departmentsOf(building)) {
      const key = department.code || department.name;
      if (!seen.has(key)) seen.set(key, { department, building });
    }
  }
  if (seen.size === 0) return DEFAULT_DEPARTMENTS.map((department) => ({ department }));
  return [...seen.values()];
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]!);

/** "18 ก.ย. 2569" → { day: "18", month: "ก.ย." }; anything else → null. */
function splitThaiDate(date: string): { day: string; month: string } | null {
  const m = date.match(/(\d{1,2})\s+([ก-๙]{1,3}\.[ก-๙]{1,2}\.?)/);
  return m ? { day: m[1].padStart(2, "0"), month: m[2] } : null;
}

/** Live position while the phone app is open (after the visitor agreed once). */
function useLiveLocation(enabled: boolean) {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setError(null);
        setFix({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์" : null),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return { fix, error };
}

/** Keep the screen on while navigating (Android Chrome / recent Safari). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [active]);
}

/* ------------------------------------------------------------------ app */

export function PlatooApp({ mode }: { mode: Mode }) {
  const kioskMode = mode === "kiosk";
  const params = new URLSearchParams(useSearch());
  const { theme, toggleTheme } = useTheme();
  const online = useOnlineStatus();

  // Data (with an offline copy so the kiosk keeps working when the internet drops).
  const { data } = trpc.campus.buildings.useQuery(undefined, { staleTime: 1000 * 60 * 10 });
  const { data: newsData } = trpc.campus.news.useQuery(undefined, { staleTime: 1000 * 60 * 10 });
  const { data: settings } = trpc.campus.settings.useQuery(undefined, { staleTime: 1000 * 60 * 10, enabled: kioskMode });
  const [cachedBuildings] = useState(() => offlineData.getBuildings());
  const [cachedNews] = useState(() => offlineData.getNews());
  const buildings: CampusBuilding[] = data?.length ? data : cachedBuildings?.length ? cachedBuildings : CAMPUS_BUILDINGS;
  const news: CampusNewsItem[] = newsData?.length ? newsData : cachedNews?.length ? cachedNews : [];
  useEffect(() => { if (data?.length) offlineData.saveBuildings(data); }, [data]);
  useEffect(() => { if (newsData?.length) offlineData.saveNews(newsData); }, [newsData]);
  const departments = useMemo(() => collectDepartments(buildings), [buildings]);

  const kiosk = kioskMode ? settings?.kiosk ?? null : null;
  const nav = useCampusNavigation(buildings, { fixedStart: kiosk });

  // Phone GPS.
  const [gpsOn, setGpsOn] = useState(() => {
    if (kioskMode) return false;
    try { return window.localStorage.getItem(GPS_OK_KEY) === "1"; } catch { return false; }
  });
  const { fix: liveFix, error: gpsError } = useLiveLocation(gpsOn);
  const here = kioskMode ? null : nav.live ? nav.fix : liveFix ?? nav.fix;
  const enableGps = () => {
    try { window.localStorage.setItem(GPS_OK_KEY, "1"); } catch { /* ignore */ }
    setGpsOn(true);
  };
  useWakeLock(nav.live);

  const [view, setView] = useState<View>(() => (params.get("place") ? "map" : "home"));
  const [selectedId, setSelectedId] = useState<string | null>(params.get("place"));
  const selected = buildings.find((b) => b.id === selectedId) ?? null;

  const go = (next: View) => { setView(next); window.scrollTo({ top: 0 }); };
  const selectBuilding = (id: string | null) => {
    if (nav.targetId && nav.targetId !== id) nav.clear();
    setSelectedId(id);
  };

  // Phone: tap "นำทาง" → GPS on, route, then live turn-by-turn once the route is ready.
  const pendingLive = useRef(false);
  const startNavigation = (id: string) => {
    setSelectedId(id);
    setView("map");
    if (kioskMode) { void nav.routeTo(id); return; }
    enableGps();
    pendingLive.current = true;
    void nav.routeTo(id);
  };
  useEffect(() => {
    if (pendingLive.current && nav.status === "ready" && nav.route) {
      pendingLive.current = false;
      nav.startLive();
    }
    if (nav.status === "error") pendingLive.current = false;
  }, [nav.status, nav.route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep links from the kiosk QR: /app?place=<id>&go=1 → straight into navigation; ?voice=1 → mic.
  const goOnLoad = useRef(!kioskMode && params.get("go") === "1" && Boolean(params.get("place")));
  useEffect(() => {
    if (params.get("voice") === "1") setTimeout(openVoiceAssistant, 600);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (goOnLoad.current && buildings.length) {
      goOnLoad.current = false;
      startNavigation(params.get("place")!);
    }
  }, [buildings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real walking distance/time for the selected place (phone, over the walkway network).
  const walk: Walk = useMemo(() => {
    if (!selected || !here) return null;
    const p = buildingLatLng(selected);
    if (!p) return null;
    const route = planCampusRoute(nav.network, here, { ...p, buildingId: selected.id, name: selected.name });
    if (!route) return null;
    const total = route.distance + (route.offCampus?.straightDistance ?? 0);
    return { distance: total, minutes: Math.max(1, Math.round(total / 1.25 / 60)), offCampus: Boolean(route.offCampus) };
  }, [selected, here, nav.network]);

  // Kiosk: nobody touched the screen for 90 s → wipe the visitor's session and show the attract screen.
  // (The phone never goes idle: the timer is set to the longest delay a browser allows.)
  const [idle, wake] = useIdle(kioskMode ? 90_000 : 0x7fffffff);
  useEffect(() => {
    if (!idle || !kioskMode) return;
    nav.clear();
    resetAssistant();
    setSelectedId(null);
    setView("home");
    window.scrollTo({ top: 0 });
  }, [idle]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="platoo-ui" data-theme={theme === "dark" ? "dark" : "light"}>
        <div className="app">
          <AppHeader view={view} onNavigate={go} dark={theme === "dark"} onToggleTheme={toggleTheme} online={online} />
          {view === "home" && (
            <HomeView buildingCount={buildings.length} departmentCount={departments.length} go={go} phone={!kioskMode} />
          )}
          {view === "map" && (
            <MapView
              mode={mode}
              buildings={buildings}
              selected={selected}
              onSelect={selectBuilding}
              nav={nav}
              kiosk={kiosk}
              here={here}
              walk={walk}
              gpsOn={gpsOn}
              gpsError={gpsError}
              onEnableGps={enableGps}
              onNavigate={startNavigation}
              dark={theme === "dark"}
            />
          )}
          {view === "news" && <NewsView news={news} />}
          {view === "departments" && (
            <DepartmentsView entries={departments} onShowBuilding={(id) => { selectBuilding(id); go("map"); }} />
          )}

          <button className="floating-ai" onClick={openAssistant} aria-label="เปิดผู้ช่วยน้องปลาทู">
            <img className="floating-platoo" src="/mascots/jump.webp" alt="" aria-hidden="true" />
            <span className="floating-ai-copy">
              <strong>ถามน้องปลาทู</strong>
              <small>แตะเพื่อเริ่มถาม</small>
            </span>
          </button>
          <nav className="mobile-nav" aria-label="เมนูสำหรับมือถือ">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => go(item.id)}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        {kioskMode && idle && <AttractScreen onWake={wake} />}
      </div>
      {/* The real chat/voice assistant (Gemini + FAQ), opened by the buttons above. */}
      <CampusAIWidget hideLauncher atKiosk={kioskMode} onShowRoute={startNavigation} onOpenMap={() => go("map")} />
    </>
  );
}

/* ------------------------------------------------------------------ header */

function AppHeader({ view, onNavigate, dark, onToggleTheme, online }: { view: View; onNavigate: (v: View) => void; dark: boolean; onToggleTheme?: () => void; online: boolean }) {
  return (
    <header className={`app-header ${view === "home" ? "kiosk-header" : ""}`}>
      <button className="brand" onClick={() => onNavigate("home")} aria-label="กลับหน้าหลัก">
        <img className="header-platoo" src="/mascots/greeting.webp" alt="น้องปลาทู" />
        <span className="header-brand-text">Nong Pla Too <em>Ontour</em></span>
      </button>
      {view !== "home" && (
        <nav className="desktop-nav" aria-label="เมนูหลัก">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onNavigate(item.id)}>{item.label}</button>
          ))}
        </nav>
      )}
      <div className="header-actions">
        <span className={`online-status ${online ? "" : "offline"}`}><i /> {online ? "ออนไลน์" : "ออฟไลน์"}</span>
        {onToggleTheme && (
          <button className="icon-button" onClick={onToggleTheme} aria-label={dark ? "ใช้ธีมสว่าง" : "ใช้ธีมมืด"}>
            <Icon name={dark ? "sun" : "moon"} />
          </button>
        )}
        <button className="install-button" onClick={() => onNavigate("map")}>
          <span>เปิดแผนที่</span>
          <Icon name="map" />
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ home */

function HomeView({ buildingCount, departmentCount, go, phone }: { buildingCount: number; departmentCount: number; go: (v: View) => void; phone: boolean }) {
  const menuItems = [
    { label: "ค้นหาสถานที่", description: "ดูอาคาร ห้องเรียน และเส้นทาง", icon: "pin", className: "kiosk-blue", mascot: "/mascots/search.webp", action: () => go("map") },
    { label: "ข่าวสาร", description: "ประกาศและกิจกรรมล่าสุด", icon: "news", className: "kiosk-teal", mascot: "/mascots/point.webp", action: () => go("news") },
    { label: "สาขาวิชา", description: "ดูแผนกและหลักสูตรทั้งหมด", icon: "school", className: "kiosk-gold", mascot: "/mascots/globe.webp", action: () => go("departments") },
    { label: "ถามด้วยเสียง", description: "พูดคุยกับน้องปลาทู", icon: "mic", className: "kiosk-sky", mascot: "/mascots/jump.webp", action: openVoiceAssistant },
  ];
  return (
    <main className="kiosk-home">
      <section className="kiosk-assistant">
        <span className="assistant-label">ผู้ช่วยนำทางอัจฉริยะวิทยาลัยเทคนิคสมุทรสงคราม</span>
        <div className="kiosk-mascot-wrap">
          <img className="platoo-main-image" src="/mascots/greeting.webp" alt="น้องปลาทูยกมือไหว้ทักทาย" />
          <button className="kiosk-mic" onClick={openVoiceAssistant} aria-label="ถามน้องปลาทูด้วยเสียง">
            <Icon name="mic" />
          </button>
        </div>
        <div className="kiosk-greeting">
          <strong>สวัสดีครับ ผมน้องปลาทู</strong>
          <span>แตะเมนูด้านข้าง หรือกดไมค์เพื่อพูดได้เลยครับ</span>
        </div>
        <div className="kiosk-stats">
          <div><strong>{buildingCount}</strong><span>สถานที่ในวิทยาลัย</span></div>
          <div><strong>{departmentCount}</strong><span>สาขาวิชา</span></div>
        </div>
      </section>

      <section className="kiosk-menu">
        <div className="kiosk-menu-heading">
          <span>ยินดีต้อนรับสู่ Nong Platoo Ontour</span>
          <h1>เลือกสิ่งที่ต้องการได้เลยครับ</h1>
        </div>
        <div className="kiosk-menu-grid">
          {menuItems.map((item) => (
            <button key={item.label} className={`kiosk-menu-card ${item.className}`} onClick={item.action}>
              <span className="kiosk-card-icon"><Icon name={item.icon} /></span>
              <span className="kiosk-card-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <span className="kiosk-card-arrow"><Icon name="arrow" /></span>
              <img className="button-mascot" src={item.mascot} alt="" aria-hidden="true" />
            </button>
          ))}
        </div>
        <button className="kiosk-map-button" onClick={() => go("map")}>
          <Icon name="map" />
          <span>เปิดแผนที่วิทยาลัยและดูทุกอาคาร</span>
          <Icon name="arrow" />
          <img className="map-button-mascot" src="/mascots/map.webp" alt="" aria-hidden="true" />
        </button>
        {phone && <InstallCard />}
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ map */

type MapViewProps = {
  mode: Mode;
  buildings: CampusBuilding[];
  selected: CampusBuilding | null;
  onSelect: (id: string | null) => void;
  nav: CampusNavigation;
  kiosk: { lat: number; lng: number; name: string } | null;
  here: GpsFix | null;
  walk: Walk;
  gpsOn: boolean;
  gpsError: string | null;
  onEnableGps: () => void;
  onNavigate: (id: string) => void;
  dark: boolean;
};

function MapView({ mode, buildings, selected, onSelect, nav, kiosk, here, walk, gpsOn, gpsError, onEnableGps, onNavigate, dark }: MapViewProps) {
  const kioskMode = mode === "kiosk";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ทั้งหมด");
  const [listOpen, setListOpen] = useState(false);
  const [mapMode, setMapMode] = useMapMode();
  const categories = ["ทั้งหมด", ...CAMPUS_CATEGORIES];
  const numberOf = useMemo(() => new Map(buildings.map((b, i) => [b.id, i + 1])), [buildings]);

  const places = useMemo(() => {
    const q = query.trim().toLowerCase();
    return buildings
      .filter((b) => (filter === "ทั้งหมด" || b.category === filter) && (!q || buildingSearchText(b).includes(q)))
      .map((b) => {
        const p = buildingLatLng(b);
        return { building: b, distance: here && p ? distanceM(here, p) : null };
      })
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || (numberOf.get(a.building.id)! - numberOf.get(b.building.id)!));
  }, [buildings, filter, query, here, numberOf]);

  const pick = (id: string) => { onSelect(id); setListOpen(false); };
  const navigating = nav.status !== "idle";
  const locationNote = kioskMode
    ? kiosk ? `เริ่มจาก: ${kiosk.name}` : ""
    : gpsError ?? (gpsOn ? (here ? "พบตำแหน่งของคุณแล้ว" : "กำลังค้นหาตำแหน่ง...") : "");

  const mapProps = {
    buildings: places.map((p) => p.building),
    selectedId: selected?.id,
    onSelect: pick,
    center: CAMPUS_OVERVIEW.mapCenter,
    renderMarkerHtml: (b: CampusBuilding, active: boolean) =>
      `<div class="leaflet-pin ${active ? "active" : ""}" style="--pin:${pinColor(b)}"><b><i>${numberOf.get(b.id) ?? ""}</i></b><small>${escapeHtml(b.shortName || b.name)}</small></div>`,
    markerIconSize: [120, 72] as [number, number],
    route: nav.route,
    approachPath: nav.approachPath,
    userFix: here ?? nav.fix,
    followUser: nav.live,
    activeStep: nav.progress?.stepIndex,
    userLabel: kiosk ? "คุณอยู่ที่นี่" : undefined,
  };

  return (
    <main className="page-shell map-page">
      <div className="map-page-heading">
        <div>
          <span className="map-kicker"><i /> แผนที่วิทยาลัย</span>
          <h1>วันนี้คุณอยากไปที่ไหน?</h1>
          <p>ค้นหาอาคาร ห้องเรียน หรือจุดบริการ แล้วกดนำทางได้ทันที</p>
        </div>
        <img className="section-mascot map-heading-mascot" src="/mascots/map.webp" alt="" aria-hidden="true" />
        <div className="map-heading-actions">
          {!kioskMode && (
            <button className="locate-button" onClick={onEnableGps}>
              <Icon name="pin" /> <span>ตำแหน่งของฉัน</span>
            </button>
          )}
          {locationNote && <small className={gpsError ? "gps-error" : ""}>{locationNote}</small>}
        </div>
      </div>

      <div className="map-layout">
        <aside className={`place-panel ${listOpen ? "panel-open" : ""}`}>
          <div className="mobile-sheet-handle" />
          <div className="panel-heading">
            <div>
              <strong>สถานที่ทั้งหมด</strong>
              <small>{here ? "เรียงจากใกล้คุณที่สุด" : "เลือกสถานที่เพื่อดูบนแผนที่"}</small>
            </div>
            <button className="mobile-panel-close" onClick={() => setListOpen(false)} aria-label="ปิดรายชื่อสถานที่"><Icon name="close" /></button>
          </div>
          <label className="search-box">
            <Icon name="search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาอาคาร ห้อง หรือสาขา..." />
            {query && <button onClick={() => setQuery("")} aria-label="ล้างคำค้นหา"><Icon name="close" /></button>}
          </label>
          <div className="filters">
            {categories.map((c) => <button key={c} className={filter === c ? "active" : ""} onClick={() => setFilter(c)}>{c}</button>)}
          </div>
          <div className="place-list">
            <p>พบ {places.length} สถานที่</p>
            {places.map(({ building, distance }) => (
              <button key={building.id} className={`place-item ${selected?.id === building.id ? "selected" : ""}`} onClick={() => pick(building.id)}>
                <span className="place-number" style={{ background: pinColor(building) }}>{numberOf.get(building.id)}</span>
                <span>
                  <strong>{building.name}</strong>
                  <small>{building.category} · {building.floors} ชั้น</small>
                  {distance !== null && <small className="distance">{formatDistance(distance)}</small>}
                </span>
                <Icon name="arrow" />
              </button>
            ))}
            {places.length === 0 && (
              <div className="empty-places">
                <Icon name="search" />
                <strong>ไม่พบสถานที่</strong>
                <small>ลองค้นหาด้วยชื่ออาคารหรือห้องอื่น หรือถามน้องปลาทู</small>
              </div>
            )}
          </div>
        </aside>

        <section className={`map-canvas real-map ${navigating ? "navigating" : ""}`}>
          <div className="map-surface">
            {mapMode === "3d" ? (
              <Suspense fallback={null}>
                <CampusMap3D {...mapProps} dark={dark} controlsTop={kioskMode ? 70 : 120} onUnsupported={() => setMapMode("2d")} />
              </Suspense>
            ) : (
              <CampusLeafletMap {...mapProps} controlsTop={kioskMode ? 70 : 120} />
            )}
            <div className="map-mode-slot"><MapModeToggle mode={mapMode} onChange={setMapMode} className="!static" /></div>
          </div>

          {navigating ? (
            <NavBanner nav={nav} />
          ) : (
            <>
              <div className="mobile-map-controls">
                <label className="map-search">
                  <Icon name="search" />
                  <input value={query} onFocus={() => setListOpen(true)} onChange={(e) => { setQuery(e.target.value); setListOpen(true); }} placeholder="ค้นหาสถานที่..." />
                  <button type="button" onClick={() => setListOpen(true)}>ดูทั้งหมด</button>
                </label>
                <div className="map-filter-row">
                  {categories.map((c) => <button key={c} className={filter === c ? "active" : ""} onClick={() => setFilter(c)}>{c}</button>)}
                </div>
              </div>
              <div className="map-guide">
                <Icon name="pin" />
                <span><strong>แตะหมุดบนแผนที่</strong><small>เพื่อดูข้อมูลและเส้นทาง</small></span>
              </div>
            </>
          )}

          {!selected && !navigating && (
            <button className="show-places-button" onClick={() => setListOpen(true)}>
              <Icon name="building" />
              <span><strong>ดูรายชื่อสถานที่</strong><small>{buildings.length} แห่งในวิทยาลัย</small></span>
              <Icon name="arrow" />
            </button>
          )}

          {selected && (
            <BuildingCard
              building={selected}
              number={numberOf.get(selected.id) ?? 0}
              mode={mode}
              nav={nav}
              kiosk={kiosk}
              walk={walk}
              hasFix={Boolean(here)}
              onClose={() => onSelect(null)}
              onNavigate={() => onNavigate(selected.id)}
            />
          )}
          {listOpen && (
            <button className="sheet-backdrop" onClick={() => setListOpen(false)} aria-label="ปิดรายชื่อสถานที่"><span /></button>
          )}
        </section>
      </div>
    </main>
  );
}

function BuildingCard({ building, number, mode, nav, kiosk, walk, hasFix, onClose, onNavigate }: {
  building: CampusBuilding;
  number: number;
  mode: Mode;
  nav: CampusNavigation;
  kiosk: { lat: number; lng: number; name: string } | null;
  walk: Walk;
  hasFix: boolean;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const kioskMode = mode === "kiosk";
  const rooms = building.floorsDetail.flatMap((f) => f.rooms).slice(0, 10);
  const share = async () => {
    const url = `${window.location.origin}/app?place=${building.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${building.name} · น้องปลาทู`, url });
      else await navigator.clipboard?.writeText(url);
    } catch { /* cancelled */ }
  };

  // While a route is shown, the card becomes the turn-by-turn panel.
  if (nav.status !== "idle") {
    return (
      <article className="building-card">
        <div className="route-panel-wrap"><RoutePanel nav={nav} className="border-0 bg-transparent p-1 shadow-none" /></div>
      </article>
    );
  }

  return (
    <article className="building-card">
      <button className="card-close" onClick={onClose} aria-label="ปิดรายละเอียด"><Icon name="close" /></button>
      <div className="building-card-head">
        <span className="place-number" style={{ background: pinColor(building) }}>{number}</span>
        <div>
          <span className="building-category">{building.category}</span>
          <h2>{building.name}</h2>
        </div>
      </div>
      {building.description && <p>{building.description}</p>}
      <div className="building-meta">
        <span><Icon name="building" /> {building.floors} ชั้น</span>
        {departmentsOf(building)[0] && <span><Icon name="school" /> {departmentsOf(building).map((d) => d.name).join(", ")}</span>}
      </div>
      {rooms.length > 0 && <div className="room-chips">{rooms.map((r) => <span key={r}>{r}</span>)}</div>}
      {!kioskMode && (
        <p className="walk-line">
          {walk ? `🚶 เดิน ${formatDistance(walk.distance)} · ~${walk.minutes} นาที${walk.offCampus ? " (จากนอกวิทยาลัย)" : ""}` : hasFix ? "กำลังคำนวณระยะทาง…" : "เปิดตำแหน่งเพื่อดูระยะทาง"}
        </p>
      )}
      <div className="card-actions">
        {hasCoords(building) ? (
          <button className="route-button" onClick={onNavigate}>
            <Icon name="route" /> {kioskMode ? (kiosk ? "ดูเส้นทางจากตู้นี้" : "ดูเส้นทาง") : "เริ่มนำทาง"}
          </button>
        ) : (
          <a className="route-button" href={walkingDeepLink(building)} target="_blank" rel="noreferrer"><Icon name="route" /> นำทาง (Google Maps)</a>
        )}
        <a className="card-icon-button" href={walkingDeepLink(building)} target="_blank" rel="noreferrer" aria-label="เปิดใน Google Maps"><Icon name="map" /></a>
        {!kioskMode && <button className="card-icon-button" onClick={() => void share()} aria-label="แชร์สถานที่"><Icon name="send" /></button>}
      </div>
      {kioskMode && (
        <div className="card-qr">
          <QrCode value={phoneRouteUrl(building.id, false)} className="w-20 shrink-0" label="QR เปิดอาคารนี้บนมือถือ" />
          <p><strong>ดูอาคารนี้บนมือถือ</strong>สแกนด้วยกล้องมือถือ แล้วกดนำทาง มือถือจะพาเดินด้วย GPS</p>
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ news */

function NewsView({ news }: { news: CampusNewsItem[] }) {
  const [featured, ...rest] = news;
  return (
    <main className="page-shell content-page">
      <div className="page-title">
        <span className="title-icon yellow"><Icon name="news" /></span>
        <div>
          <span>อัปเดตจากวิทยาลัย</span>
          <h1>ข่าวสารและกิจกรรม</h1>
        </div>
      </div>
      {!featured && <div className="empty-state">ยังไม่มีข่าวในตอนนี้ — ลองเปิดหน้านี้ใหม่อีกครั้งภายหลังครับ</div>}
      {featured && (
        <NewsLink item={featured} className="featured-news">
          <div>
            <span className="news-pill">{featured.tag || "ข่าวเด่น"}</span>
            <h2>{featured.title}</h2>
            {featured.excerpt && <p>{featured.excerpt}</p>}
            {(featured.date || featured.time) && <p>{[featured.date, featured.time].filter(Boolean).join(" · ")}</p>}
          </div>
          {featured.image ? (
            <div className="feature-art photo"><img src={featured.image} alt="" loading="lazy" /></div>
          ) : (
            <img className="featured-news-mascot" src="/mascots/jump.webp" alt="" aria-hidden="true" />
          )}
        </NewsLink>
      )}
      {rest.length > 0 && (
        <div className="news-grid">
          {rest.map((item) => {
            const date = splitThaiDate(item.date);
            return (
              <NewsLink item={item} className="news-card" key={item.id}>
                <div className={`date-block ${date ? "" : "no-date"}`}>
                  {date ? <><strong>{date.day}</strong><span>{date.month}</span></> : <Icon name="news" />}
                </div>
                <div>
                  <span className="tag">{item.tag}</span>
                  <h3>{item.title}</h3>
                  <p>{item.excerpt || [item.date, item.time].filter(Boolean).join(" · ")}</p>
                </div>
              </NewsLink>
            );
          })}
        </div>
      )}
      <a className="news-more" href={COLLEGE_NEWS_URL} target="_blank" rel="noreferrer">ดูข่าวทั้งหมดบนเว็บวิทยาลัย <Icon name="arrow" /></a>
    </main>
  );
}

function NewsLink({ item, className, children }: { item: CampusNewsItem; className: string; children: React.ReactNode }) {
  return item.link ? (
    <a className={className} href={item.link} target="_blank" rel="noreferrer">{children}</a>
  ) : (
    <article className={className}>{children}</article>
  );
}

/* ------------------------------------------------------------------ departments */

function DepartmentsView({ entries, onShowBuilding }: { entries: DepartmentEntry[]; onShowBuilding: (id: string) => void }) {
  const [open, setOpen] = useState<DepartmentEntry | null>(null);
  return (
    <main className="page-shell content-page">
      <div className="page-title">
        <span className="title-icon mint"><Icon name="school" /></span>
        <div>
          <span>เรียนรู้จากการลงมือทำ</span>
          <h1>ค้นพบสาขาที่เหมาะกับคุณ</h1>
        </div>
        <img className="section-mascot department-heading-mascot" src="/mascots/globe.webp" alt="" aria-hidden="true" />
      </div>
      <p className="page-intro">สำรวจหลักสูตรสายอาชีพที่ตอบโจทย์อนาคต พร้อมห้องปฏิบัติการและอุปกรณ์จริง</p>
      <div className="department-grid">
        {entries.map((entry) => {
          const { department: d, building } = entry;
          const logo = logoOf(d);
          return (
            <button className="department-card" key={d.code || d.id} onClick={() => setOpen(entry)}>
              <span className="department-icon" style={{ background: `${d.accent}18`, color: d.accent }}>
                {logo ? <img src={logo} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <Icon name="school" />}
              </span>
              <span className="dept-code">{d.code}</span>
              <strong>{d.name}</strong>
              <small>{building ? `${building.shortName || building.name} · ชั้น ${d.floor}` : `ชั้น ${d.floor}`}</small>
              <span className="dept-link">ดูข้อมูลสาขา <Icon name="arrow" /></span>
            </button>
          );
        })}
      </div>

      {open && (
        <>
          <button className="ai-backdrop visible" onClick={() => setOpen(null)} aria-label="ปิดข้อมูลสาขา" />
          <section className="dept-detail" role="dialog" aria-label={open.department.name}>
            <button className="card-close" onClick={() => setOpen(null)} aria-label="ปิด"><Icon name="close" /></button>
            <span className="department-icon" style={{ background: `${open.department.accent}18`, color: open.department.accent }}>
              {logoOf(open.department) ? <img src={logoOf(open.department)} alt="" /> : <Icon name="school" />}
            </span>
            <h2>{open.department.name}</h2>
            <p>{open.department.description}</p>
            {open.department.skills.length > 0 && (<><h3>ทักษะที่ได้</h3><div className="room-chips">{open.department.skills.map((s) => <span key={s}>{s}</span>)}</div></>)}
            {open.department.careers.length > 0 && (<><h3>อาชีพในอนาคต</h3><div className="room-chips">{open.department.careers.map((s) => <span key={s}>{s}</span>)}</div></>)}
            {open.department.activities?.length ? (<><h3>กิจกรรม</h3><div className="room-chips">{open.department.activities.map((s) => <span key={s}>{s}</span>)}</div></>) : null}
            {open.building && (
              <button className="route-button" onClick={() => { const id = open.building!.id; setOpen(null); onShowBuilding(id); }}>
                <Icon name="pin" /> ดูที่ตั้ง {open.building.shortName || open.building.name} ชั้น {open.department.floor}
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ kiosk idle screen */

function AttractScreen({ onWake }: { onWake: () => void }) {
  return (
    <button type="button" className="attract" onClick={onWake} aria-label="แตะหน้าจอเพื่อเริ่มใช้งาน">
      <img className="attract-mascot" src="/mascots/greeting.webp" alt="" />
      <div>
        <h2>สวัสดีครับ ผมน้องปลาทู</h2>
        <p>ผู้ช่วยนำทางและประชาสัมพันธ์ วิทยาลัยเทคนิคสมุทรสงคราม</p>
      </div>
      <span className="attract-tap">👆 แตะหน้าจอเพื่อเริ่มใช้งาน</span>
      <span className="attract-qr">
        <QrCode value={phoneRouteUrl()} className="w-28" label="QR เปิดแอปน้องปลาทูบนมือถือ" />
        <span><strong>ใช้บนมือถือก็ได้</strong>สแกนเพื่อเปิดแอปน้องปลาทู นำทางด้วย GPS ได้ทั้งวิทยาลัย</span>
      </span>
    </button>
  );
}
