// The kiosk ( / ). Holds the shared state and switches between its screens:
//   HomeScreen    — น้องปลาทู + menu
//   PlacesScreen  — search, map, building details, route from the kiosk
//   NewsScreen    — news cards
//   AttractScreen — "touch to start", after 90 s with nobody using the kiosk
import { CampusAIWidget, resetAssistant } from "@/components/assistant/CampusAIWidget";
import { useCampusNavigation } from "@/hooks/useCampusNavigation";
import { useIdle } from "@/hooks/useIdle";
import { offlineData, useOnlineStatus } from "@/lib/offlineData";
import { trpc } from "@/lib/trpc";
import { isMobileDevice } from "@/lib/voice";
import { CAMPUS_BUILDINGS, CAMPUS_OVERVIEW } from "@shared/campus";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AttractScreen } from "./AttractScreen";
import { HomeScreen, type KioskScreenId } from "./HomeScreen";
import { KioskHeader } from "./KioskHeader";
import { NewsScreen } from "./NewsScreen";
import { PlacesScreen } from "./PlacesScreen";

/** Nobody touched the kiosk for this long → reset for the next visitor. */
const IDLE_RESET_MS = 90_000;

/**
 * "/" is the kiosk. A phone that lands here (typed the address, followed a shared
 * link) gets the phone app instead — unless the URL says ?kiosk=1 (for testing
 * the kiosk on a small screen).
 */
function shouldUsePhoneApp(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("kiosk") === "1") return false;
  return isMobileDevice() && window.matchMedia("(max-width: 820px)").matches;
}

export default function KioskHome() {
  if (shouldUsePhoneApp()) {
    window.location.replace(`/app${window.location.search}`);
    return null;
  }
  return <KioskScreen />;
}

/** Buildings and news from the server, falling back to the last copy saved on this device. */
function useKioskData() {
  const { data } = trpc.campus.buildings.useQuery(undefined, { staleTime: 1000 * 60 * 10 });
  const { data: news } = trpc.campus.news.useQuery(undefined, { staleTime: 1000 * 60 * 10 });
  const { data: settings } = trpc.campus.settings.useQuery(undefined, { staleTime: 1000 * 60 * 10 });
  const [cachedBuildings] = useState(() => offlineData.getBuildings());
  const [cachedNews] = useState(() => offlineData.getNews());
  useEffect(() => {
    if (data?.length) offlineData.saveBuildings(data);
  }, [data]);
  useEffect(() => {
    if (news?.length) offlineData.saveNews(news);
  }, [news]);
  return {
    buildings: data?.length ? data : cachedBuildings?.length ? cachedBuildings : CAMPUS_BUILDINGS,
    news: news?.length ? news : cachedNews?.length ? cachedNews : [],
    kiosk: settings?.kiosk ?? null,
  };
}

function KioskScreen() {
  const { buildings, news, kiosk } = useKioskData();
  const online = useOnlineStatus();
  const [screen, setScreen] = useState<KioskScreenId>("home");
  const [selectedId, setSelectedId] = useState(buildings[0]?.id ?? "main");
  const selected = buildings.find(building => building.id === selectedId) ?? buildings[0];
  const nav = useCampusNavigation(buildings, { fixedStart: kiosk });

  // Idle → wipe the visitor's session (route, chat, search) and show the attract screen.
  const [idle, wake] = useIdle(IDLE_RESET_MS);
  useEffect(() => {
    if (!idle) return;
    nav.clear();
    resetAssistant();
    setScreen("home"); // leaving the places screen also clears its search and filters
    window.scrollTo({ top: 0 });
  }, [idle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picking a building (list or pin) clears any route to a different one.
  const selectBuilding = (id: string) => {
    setSelectedId(id);
    if (nav.targetId && nav.targetId !== id) nav.clear();
    setScreen("places");
  };
  // Walking route on the map — from the building's button or from the chat bot.
  const showRoute = (id: string) => {
    setSelectedId(id);
    setScreen("places");
    void nav.routeTo(id);
  };
  const goHome = () => setScreen("home");

  return (
    <div className="kiosk-shell min-h-screen bg-[#f5faf7] text-[var(--ink)]">
      <main className="kiosk-main mx-auto flex min-h-screen max-w-[1600px] flex-col p-4 sm:p-6 lg:p-8">
        <KioskHeader online={online} onHome={goHome} />

        {screen === "home" && <HomeScreen buildingCount={buildings.length} onOpen={setScreen} />}
        {screen === "places" && (
          <PlacesScreen
            buildings={buildings}
            selected={selected}
            nav={nav}
            kiosk={kiosk}
            onSelect={selectBuilding}
            onShowRoute={showRoute}
            onBack={goHome}
          />
        )}
        {screen === "news" && <NewsScreen news={news} onBack={goHome} />}

        <footer className="flex items-center justify-between rounded-2xl px-2 py-2 text-[10px] font-bold text-[var(--muted-foreground)]">
          <span>
            {CAMPUS_OVERVIEW.name} · {CAMPUS_OVERVIEW.address}
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Sparkles size={12} className="text-[#398e89]" /> ข้อมูลประชาสัมพันธ์อัจฉริยะ
          </span>
        </footer>
      </main>
      <CampusAIWidget onShowRoute={showRoute} />
      {idle && <AttractScreen onWake={wake} collegeName={CAMPUS_OVERVIEW.name} />}
    </div>
  );
}
