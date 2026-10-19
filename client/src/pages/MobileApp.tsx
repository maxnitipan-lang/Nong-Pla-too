import { CampusAIWidget, openAssistant, openVoiceAssistant } from "@/components/CampusAIWidget";
import { CampusLeafletMap } from "@/components/CampusLeafletMap";
import { NavBanner, RoutePanel } from "@/components/RoutePanel";
import { useCampusNavigation } from "@/hooks/useCampusNavigation";
import { buildingLatLng, buildingSearchText, formatDistance, walkingDeepLink, type GpsFix } from "@/lib/directions";
import { offlineData } from "@/lib/offlineData";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CAMPUS_BUILDINGS, CAMPUS_CATEGORIES, CAMPUS_OVERVIEW, type CampusBuilding } from "@shared/campus";
import { distanceM, planCampusRoute } from "@shared/walkNetwork";
import {

  Building2,
  ChevronRight,
  Download,
  ExternalLink,
  Layers3,
  LocateFixed,
  Map as MapIcon,
  MessageCircle,
  Mic,
  Navigation,
  Newspaper,
  Search,
  Share,
  Share2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";

type Tab = "map" | "news";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const GPS_OK_KEY = "nong-platoo-gps-ok";
const INSTALL_DISMISSED_KEY = "nong-platoo-install-dismissed";

/** Live position while the app is open (after the visitor agreed once). */
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

/** Keep the screen on while navigating (supported on Android Chrome / recent Safari). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [active]);
}

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * The phone app ("/app", installable as a PWA): full-screen campus map with your
 * live GPS position, search, places sorted by walking distance, a place card
 * with distance/time, and turn-by-turn walking navigation with voice.
 */
export default function MobileApp() {
  const params = new URLSearchParams(useSearch());
  const { data } = trpc.campus.buildings.useQuery(undefined, { staleTime: 1000 * 60 * 10 });
  const { data: news } = trpc.campus.news.useQuery(undefined, { staleTime: 1000 * 60 * 10 });
  const [cachedBuildings] = useState(() => offlineData.getBuildings());
  const buildings: CampusBuilding[] = data?.length ? data : cachedBuildings?.length ? cachedBuildings : CAMPUS_BUILDINGS;
  useEffect(() => {
    if (data?.length) offlineData.saveBuildings(data);
  }, [data]);

  const nav = useCampusNavigation(buildings);
  const [gpsOn, setGpsOn] = useState(() => {
    try {
      return window.localStorage.getItem(GPS_OK_KEY) === "1";
    } catch {
      return false;
    }
  });
  const { fix: liveFix, error: gpsError } = useLiveLocation(gpsOn);
  const here = nav.live ? nav.fix : liveFix ?? nav.fix;

  const [tab, setTab] = useState<Tab>("map");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("ทั้งหมด");
  const [selectedId, setSelectedId] = useState<string | null>(params.get("place"));
  const [sheetOpen, setSheetOpen] = useState(true);
  const selected = buildings.find((b) => b.id === selectedId) ?? null;
  useWakeLock(nav.live);

  const enableGps = () => {
    try {
      window.localStorage.setItem(GPS_OK_KEY, "1");
    } catch {
      /* ignore */
    }
    setGpsOn(true);
  };

  // Deep link from the kiosk QR: /app?place=<id>&go=1 → straight into navigation.
  useEffect(() => {
    if (params.get("voice") === "1") setTimeout(openVoiceAssistant, 600);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const goOnLoad = useRef(params.get("go") === "1" && Boolean(params.get("place")));
  const startNavigation = (id: string) => {
    enableGps();
    setSelectedId(id);
    setSheetOpen(true);
    pendingLive.current = true;
    void nav.routeTo(id);
  };
  const pendingLive = useRef(false);
  useEffect(() => {
    if (goOnLoad.current && buildings.length) {
      goOnLoad.current = false;
      startNavigation(params.get("place")!);
    }
  }, [buildings.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pendingLive.current && nav.status === "ready" && nav.route) {
      pendingLive.current = false;
      nav.startLive();
    }
    if (nav.status === "error") pendingLive.current = false;
  }, [nav.status, nav.route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Places with distance from you (straight line — cheap enough to compute for the list).
  const places = useMemo(() => {
    const q = query.trim().toLowerCase();
    return buildings
      .filter((b) => (category === "ทั้งหมด" || b.category === category) && (!q || buildingSearchText(b).includes(q)))
      .map((b) => {
        const p = buildingLatLng(b);
        return { building: b, distance: here && p ? distanceM(here, p) : null };
      })
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.building.name.localeCompare(b.building.name, "th"));
  }, [buildings, category, query, here]);

  // Real walking distance/time for the selected place (over the walkway network).
  const walk = useMemo(() => {
    if (!selected || !here) return null;
    const p = buildingLatLng(selected);
    if (!p) return null;
    const route = planCampusRoute(nav.network, here, { ...p, buildingId: selected.id, name: selected.name });
    if (!route) return null;
    const extra = route.offCampus?.straightDistance ?? 0;
    return { distance: route.distance + extra, minutes: Math.max(1, Math.round((route.distance + extra) / 1.25 / 60)), offCampus: Boolean(route.offCampus) };
  }, [selected, here, nav.network]);

  const selectPlace = (id: string) => {
    if (nav.targetId && nav.targetId !== id) nav.clear();
    setSelectedId(id);
    setSheetOpen(true);
    setTab("map");
  };
  const closePlace = () => {
    nav.clear();
    setSelectedId(null);
  };
  const share = async (b: CampusBuilding) => {
    const url = `${window.location.origin}/app?place=${b.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${b.name} · น้องปลาทู`, url });
      else await navigator.clipboard?.writeText(url);
    } catch {
      /* cancelled */
    }
  };

  const navigating = nav.status !== "idle";

  return (
    <div className="fixed inset-0 flex flex-col bg-[#f5faf7] text-[var(--ink)]">
      {/* ---------------- Map ---------------- */}
      <div className={cn("relative isolate flex-1", tab !== "map" && "hidden")}>
        <CampusLeafletMap
          buildings={places.map((p) => p.building)}
          selectedId={selected?.id}
          onSelect={selectPlace}
          center={CAMPUS_OVERVIEW.mapCenter}
          route={nav.route}
          approachPath={nav.approachPath}
          userFix={here}
          followUser={nav.live}
          activeStep={nav.progress?.stepIndex}
          zoomControl={false}
          controlsTop={navigating ? 96 : 128}
        />

        {navigating ? (
          <NavBanner nav={nav} />
        ) : (
          <div className="absolute inset-x-3 top-3 z-[1001] space-y-2">
            <div className="flex items-center gap-2 rounded-2xl bg-white px-3 shadow-lg ring-1 ring-black/5">
              <Search size={18} className="shrink-0 text-[var(--muted-foreground)]" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSheetOpen(true);
                  if (selectedId) setSelectedId(null);
                }}
                placeholder="ค้นหาอาคาร สาขา ห้อง…"
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none placeholder:font-medium"
                enterKeyHint="search"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="p-1 text-[var(--muted-foreground)]" aria-label="ล้างคำค้นหา">
                  <X size={18} />
                </button>
              ) : (
                <button type="button" onClick={openVoiceAssistant} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff3ed] text-[#e0533d]" aria-label="ถามด้วยเสียง">
                  <Mic size={17} />
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {["ทั้งหมด", ...CAMPUS_CATEGORIES].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn("shrink-0 rounded-full px-3.5 py-2 text-xs font-black shadow-sm", category === c ? "bg-[var(--ink)] text-white" : "bg-white text-[var(--ink)]")}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {!gpsOn && (
          <button
            type="button"
            onClick={enableGps}
            className="absolute left-1/2 top-[132px] z-[1001] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1a73e8] px-4 py-2.5 text-xs font-black text-white shadow-lg"
          >
            <LocateFixed size={15} /> เปิดตำแหน่งเพื่อดูระยะและนำทาง
          </button>
        )}
        {gpsError && <p className="absolute left-3 right-3 top-[132px] z-[1001] rounded-xl bg-[#fff1eb] px-3 py-2 text-center text-[11px] font-bold text-[#c46242]">{gpsError}</p>}

        {/* ---------------- Bottom sheet ---------------- */}
        <div className="absolute inset-x-0 bottom-0 z-[1002] max-h-[58%] overflow-hidden rounded-t-[28px] bg-white shadow-[0_-12px_40px_rgba(16,41,58,0.18)]">
          <button type="button" onClick={() => setSheetOpen((v) => !v)} className="flex w-full justify-center py-2.5" aria-label={sheetOpen ? "ย่อแผง" : "ขยายแผง"}>
            <span className="h-1.5 w-11 rounded-full bg-[#d4dfdb]" />
          </button>

          {navigating ? (
            <div className="max-h-[calc(58dvh-2.5rem)] overflow-y-auto px-4 pb-4">
              <RoutePanel nav={nav} className="border-0 p-0 shadow-none" />
            </div>
          ) : selected ? (
            <PlaceCard
              building={selected}
              walk={walk}
              hasFix={Boolean(here)}
              expanded={sheetOpen}
              onClose={closePlace}
              onNavigate={() => startNavigation(selected.id)}
              onShare={() => void share(selected)}
            />
          ) : (
            sheetOpen && (
              <div className="max-h-[calc(58dvh-2.5rem)] overflow-y-auto px-3 pb-4">
                <div className="mb-1 flex items-center justify-between px-2">
                  <p className="text-sm font-black">{query ? `ผลการค้นหา (${places.length})` : here ? "สถานที่ใกล้คุณ" : "สถานที่ในวิทยาลัย"}</p>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--muted-foreground)]">
                    <Layers3 size={13} /> {places.length} จุด
                  </span>
                </div>
                {places.map(({ building: b, distance }) => (
                  <button key={b.id} type="button" onClick={() => selectPlace(b.id)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left active:bg-[#f2f8f5]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: b.accent }}>
                      <Building2 size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{b.name}</span>
                      <span className="block truncate text-[11px] font-bold text-[var(--muted-foreground)]">{b.category} · {b.floors} ชั้น</span>
                    </span>
                    {distance !== null && <span className="shrink-0 text-xs font-black text-[#1a73e8]">{formatDistance(distance)}</span>}
                    <ChevronRight size={16} className="shrink-0 text-[var(--muted-foreground)]" />
                  </button>
                ))}
                {!places.length && <p className="px-2 py-8 text-center text-sm font-bold text-[var(--muted-foreground)]">ไม่พบสถานที่ — ลองคำอื่น หรือถามน้องปลาทู</p>}
                <InstallCard />
              </div>
            )
          )}
        </div>
      </div>

      {/* ---------------- News ---------------- */}
      {tab === "news" && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5">
          <h1 className="text-2xl font-black tracking-[-0.04em]">ข่าวสารและกิจกรรม</h1>
          <div className="mt-4 space-y-3">
            {(news ?? []).map((n) => (
              <a key={n.id} href={n.link || undefined} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-white shadow-sm">
                {n.image && <img src={n.image} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />}
                <div className="p-4">
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ color: n.accent, backgroundColor: `${n.accent}18` }}>{n.tag}</span>
                  <p className="mt-3 text-base font-black leading-snug">{n.title}</p>
                  <p className="mt-2 text-xs font-bold text-[#287c78]">{[n.date, n.time].filter(Boolean).join(" · ")}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- Tab bar ---------------- */}
      <nav className="z-[1003] grid grid-cols-3 border-t border-[var(--border)] bg-white pb-[env(safe-area-inset-bottom)]">
        {[
          { id: "map" as const, label: "แผนที่", icon: MapIcon, onClick: () => setTab("map") },
          { id: "news" as const, label: "ข่าวสาร", icon: Newspaper, onClick: () => setTab("news") },
          { id: "ask" as const, label: "ถามน้องปลาทู", icon: MessageCircle, onClick: openAssistant },
        ].map(({ id, label, icon: Icon, onClick }) => (
          <button key={id} type="button" onClick={onClick} className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-black", tab === id ? "text-[var(--ink)]" : "text-[var(--muted-foreground)]")}>
            <Icon size={21} strokeWidth={tab === id ? 2.4 : 1.8} />
            {label}
          </button>
        ))}
      </nav>

      <CampusAIWidget hideLauncher onShowRoute={startNavigation} />
    </div>
  );
}

function PlaceCard({
  building,
  walk,
  hasFix,
  expanded,
  onClose,
  onNavigate,
  onShare,
}: {
  building: CampusBuilding;
  walk: { distance: number; minutes: number; offCampus: boolean } | null;
  hasFix: boolean;
  expanded: boolean;
  onClose: () => void;
  onNavigate: () => void;
  onShare: () => void;
}) {
  const rooms = building.floorsDetail.filter((f) => f.rooms.length);
  return (
    <div className="max-h-[calc(58dvh-2.5rem)] overflow-y-auto px-5 pb-5">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: building.accent }}>
          <Building2 size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black leading-tight">{building.name}</p>
          <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">{building.category} · {building.floors} ชั้น</p>
        </div>
        <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--muted)]" aria-label="ปิด">
          <X size={16} />
        </button>
      </div>

      <p className="mt-3 text-sm font-black text-[#1a73e8]">
        {walk ? `🚶 เดิน ${formatDistance(walk.distance)} · ~${walk.minutes} นาที${walk.offCampus ? " (นอกวิทยาลัย)" : ""}` : hasFix ? "คำนวณระยะทาง…" : "เปิดตำแหน่งเพื่อดูระยะทาง"}
      </p>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
        <button type="button" onClick={onNavigate} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#1a73e8] text-sm font-black text-white shadow-md active:scale-[.98]">
          <Navigation size={17} /> นำทาง
        </button>
        <a href={walkingDeepLink(building)} target="_blank" rel="noreferrer" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)]" aria-label="เปิดใน Google Maps">
          <ExternalLink size={17} />
        </a>
        <button type="button" onClick={onShare} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)]" aria-label="แชร์สถานที่">
          <Share2 size={17} />
        </button>
      </div>

      {expanded && (
        <>
          {building.description && <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">{building.description}</p>}
          {rooms.length > 0 && (
            <div className="mt-4 space-y-2">
              {rooms.map((f) => (
                <div key={f.level} className="rounded-2xl bg-[#f5faf7] p-3">
                  <p className="text-xs font-black">{f.label}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {f.rooms.map((r) => (
                      <span key={r} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--muted-foreground)] ring-1 ring-[#dcebe5]">{r}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "Install the app" — Chrome's install prompt, or the Share → Add to Home Screen steps on iPhone. */
function InstallCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1" || isStandalone();
    } catch {
      return isStandalone();
    }
  });
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (dismissed || (!prompt && !isIos())) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };
  return (
    <div className="mx-2 mt-3 flex items-center gap-3 rounded-2xl bg-[var(--ink)] p-4 text-white">
      <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-xs font-bold leading-5">
        <p className="text-sm font-black">ติดตั้งแอปน้องปลาทู</p>
        {prompt ? (
          "เปิดได้จากหน้าจอโฮม เต็มจอ ใช้ได้แม้สัญญาณไม่ดี"
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            แตะ <Share size={13} className="inline" /> แชร์ แล้วเลือก "เพิ่มไปยังหน้าจอโฮม"
          </span>
        )}
      </div>
      {prompt && (
        <button
          type="button"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
            dismiss();
          }}
          className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--aqua)] px-3 py-2 text-xs font-black text-[var(--ink)]"
        >
          <Download size={14} /> ติดตั้ง
        </button>
      )}
      <button type="button" onClick={dismiss} className="shrink-0 p-1 text-white/60" aria-label="ไม่ต้องติดตั้ง">
        <X size={16} />
      </button>
    </div>
  );
}


