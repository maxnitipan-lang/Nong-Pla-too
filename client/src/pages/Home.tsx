import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { CAMPUS_BUILDINGS, CAMPUS_NEWS, CAMPUS_OVERVIEW } from "@shared/campus";
import type { CampusBuilding } from "@shared/campus";
import {
  ArrowUpRight,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Compass,
  Layers3,
  MapPin,
  Menu,
  Navigation,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const categoryFilters = ["ทั้งหมด", "วิชาการ", "ปฏิบัติการ", "บริการ", "กิจกรรม"] as const;

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function LogoMark() {
  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-[var(--deep)] text-white shadow-[0_8px_18px_rgba(16,41,58,0.18)]">
      <div className="absolute -right-2 -top-3 h-8 w-8 rounded-full border-[5px] border-[var(--aqua)] opacity-85" />
      <div className="absolute -bottom-3 -left-2 h-8 w-8 rounded-full border-[5px] border-[var(--coral)] opacity-90" />
      <span className="relative font-display text-sm font-bold tracking-[-0.08em]">SM</span>
    </div>
  );
}

function MapPinMarker({ building, selected, onClick }: { building: CampusBuilding; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`ดูข้อมูล ${building.name}`}
      className="group absolute z-20 -translate-x-1/2 -translate-y-full outline-none transition-transform duration-200 hover:scale-110 focus-visible:scale-110"
      style={{ left: `${building.x}%`, top: `${building.y}%` }}
    >
      <span className={`relative flex h-10 w-10 items-center justify-center rounded-full border-4 border-white text-white shadow-[0_8px_18px_rgba(16,41,58,0.24)] ${selected ? "marker-pulse scale-110" : ""}`} style={{ backgroundColor: building.accent }}>
        <MapPin size={17} fill="currentColor" strokeWidth={1.7} />
      </span>
      <span className={`pointer-events-none absolute left-1/2 top-[calc(100%+10px)] w-max -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-[var(--ink)] shadow-[0_8px_20px_rgba(16,41,58,0.15)] transition-all duration-200 ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        {building.shortName}
      </span>
    </button>
  );
}

function FloorDetails({ building }: { building: CampusBuilding }) {
  const [activeFloor, setActiveFloor] = useState(1);
  useEffect(() => setActiveFloor(1), [building.id]);
  const floor = building.floorsDetail.find((item) => item.level === activeFloor) ?? building.floorsDetail[0];

  return (
    <div className="mt-5 border-t border-[var(--border)] pt-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[var(--muted-foreground)]">รายละเอียดภายใน</p>
        <span className="rounded-full bg-[var(--secondary)] px-2.5 py-1 text-[11px] font-bold text-[var(--secondary-foreground)]">{building.floors} ชั้น</span>
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {building.floorsDetail.map((item) => (
          <button
            key={item.level}
            type="button"
            onClick={() => setActiveFloor(item.level)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${activeFloor === item.level ? "bg-[var(--ink)] text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {floor?.rooms.map((room) => (
          <div key={room} className="flex items-center gap-2.5 text-sm text-[var(--foreground)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: building.accent }} />
            {room}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<"map" | "news">("map");
  const [activeCategory, setActiveCategory] = useState<(typeof categoryFilters)[number]>("ทั้งหมด");
  const [selectedId, setSelectedId] = useState("main");
  const [query, setQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const { data: buildingsData } = trpc.campus.buildings.useQuery(undefined, { staleTime: 1000 * 60 * 10 });
  const { data: newsData } = trpc.campus.news.useQuery(undefined, { staleTime: 1000 * 60 * 10 });
  const buildings = buildingsData?.length ? buildingsData : CAMPUS_BUILDINGS;
  const news = newsData?.length ? newsData : CAMPUS_NEWS;
  const selectedBuilding = buildings.find((item) => item.id === selectedId) ?? buildings[0];

  const filteredBuildings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return buildings.filter((building) => {
      const matchesCategory = activeCategory === "ทั้งหมด" || building.category === activeCategory;
      const matchesQuery = !normalized || `${building.name} ${building.category} ${building.description}`.toLowerCase().includes(normalized);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, buildings, query]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setOptions({
      styles: [
        { elementType: "geometry", stylers: [{ color: "#dbe9e3" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#45645f" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#edf6f1" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#a8d4d0" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#f7faf5" }] },
        { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#b9ddc9" }] },
      ],
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
  }, []);

  const focusBuilding = (building: CampusBuilding) => {
    setSelectedId(building.id);
    const latOffset = (building.y - 50) * 0.00035;
    const lngOffset = (building.x - 50) * 0.00045;
    mapRef.current?.panTo({ lat: CAMPUS_OVERVIEW.mapCenter.lat - latOffset, lng: CAMPUS_OVERVIEW.mapCenter.lng + lngOffset });
    mapRef.current?.setZoom(17);
  };

  return (
    <div className="app-shell bg-[var(--background)]">
      <header className="nav-glass sticky top-0 z-50">
        <div className="mx-auto flex h-[74px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <button type="button" onClick={() => scrollToId("top")} className="flex items-center gap-3 text-left">
            <LogoMark />
            <div>
              <p className="font-display text-[15px] font-bold leading-tight text-[var(--ink)]">Campus Guide</p>
              <p className="mt-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">วิทยาลัยเทคนิคสมุทรสงคราม</p>
            </div>
          </button>

          <nav className="hidden items-center gap-8 md:flex">
            <button type="button" onClick={() => { setActiveSection("map"); scrollToId("campus-map"); }} className={`text-sm font-bold transition-colors ${activeSection === "map" ? "text-[var(--ink)]" : "text-[var(--muted-foreground)] hover:text-[var(--ink)]"}`}>แผนที่วิทยาลัย</button>
            <button type="button" onClick={() => { setActiveSection("news"); scrollToId("news"); }} className={`text-sm font-bold transition-colors ${activeSection === "news" ? "text-[var(--ink)]" : "text-[var(--muted-foreground)] hover:text-[var(--ink)]"}`}>ข่าวสาร</button>
            <a href="#about" className="text-sm font-bold text-[var(--muted-foreground)] transition-colors hover:text-[var(--ink)]">เกี่ยวกับวิทยาลัย</a>
          </nav>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => scrollToId("news")} className="hidden h-10 items-center gap-2 rounded-full bg-[var(--ink)] px-4 text-xs font-bold text-white transition-transform hover:-translate-y-0.5 sm:flex">
              <Bell size={15} /> อัปเดตล่าสุด
            </button>
            <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--ink)] shadow-sm ring-1 ring-[var(--border)] md:hidden" aria-label="เปิดเมนู">
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-[var(--border)] bg-white px-5 py-4 md:hidden">
            <div className="flex flex-col gap-3 text-sm font-bold">
              <button type="button" onClick={() => { setActiveSection("map"); setMobileMenuOpen(false); scrollToId("campus-map"); }} className="text-left">แผนที่วิทยาลัย</button>
              <button type="button" onClick={() => { setActiveSection("news"); setMobileMenuOpen(false); scrollToId("news"); }} className="text-left">ข่าวสาร</button>
              <a href="#about" onClick={() => setMobileMenuOpen(false)}>เกี่ยวกับวิทยาลัย</a>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        <section className="hero-noise relative border-b border-[var(--border)]">
          <div className="relative z-10 mx-auto grid max-w-[1440px] gap-10 px-5 pb-12 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-16 lg:px-12 lg:pb-20 lg:pt-20">
            <div className="reveal-up max-w-[600px]">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[rgba(91,185,176,0.45)] bg-white/65 px-3 py-1.5 text-[11px] font-extrabold tracking-[0.12em] text-[#287c78]">
                <Sparkles size={13} /> YOUR CAMPUS, AT A GLANCE
              </div>
              <h1 className="text-balance text-[clamp(2.6rem,6vw,5.5rem)] font-extrabold leading-[1.04] tracking-[-0.065em] text-[var(--ink)]">
                ทุกมุมของ<br /><span className="text-[#398e89]">วิทยาลัยฯ</span><br />อยู่ใกล้กว่าที่คิด
              </h1>
              <p className="mt-6 max-w-[500px] text-[15px] leading-8 text-[var(--muted-foreground)] sm:text-base">สำรวจอาคาร สาขาวิชา และข่าวสารสำคัญของวิทยาลัยเทคนิคสมุทรสงครามในที่เดียว วางแผนการเดินทางครั้งต่อไปของคุณได้ง่ายขึ้น</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={() => scrollToId("campus-map")} className="flex h-12 items-center gap-2 rounded-full bg-[var(--ink)] px-5 text-sm font-bold text-white shadow-[0_10px_25px_rgba(16,41,58,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#1b5069]">
                  สำรวจแผนที่ <ArrowUpRight size={17} />
                </button>
                <button type="button" onClick={() => scrollToId("news")} className="flex h-12 items-center gap-2 rounded-full border border-[var(--border)] bg-white/70 px-5 text-sm font-bold text-[var(--ink)] transition-all hover:-translate-y-0.5 hover:border-[var(--aqua)] hover:bg-white">
                  ดูข่าวสาร <ChevronRight size={17} />
                </button>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-7 gap-y-4 border-t border-[rgba(16,41,58,0.12)] pt-6">
                {CAMPUS_OVERVIEW.stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="font-display text-xl font-bold text-[var(--ink)]">{stat.value}</p>
                    <p className="mt-1 text-[11px] font-medium text-[var(--muted-foreground)]">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="reveal-up relative [animation-delay:120ms]">
              <div className="absolute -right-5 -top-7 hidden h-20 w-20 rounded-full border border-[rgba(91,185,176,0.4)] lg:block" />
              <div className="absolute -bottom-6 -left-7 hidden h-12 w-12 rounded-full bg-[var(--coral)]/70 lg:block" />
              <div className="relative overflow-hidden rounded-[28px] border-[10px] border-white/80 bg-[var(--ink)] shadow-[0_25px_70px_rgba(16,41,58,0.18)]">
                <div className="flex items-center justify-between bg-[var(--ink)] px-4 py-3 text-white sm:px-5">
                  <div className="flex items-center gap-2.5"><Compass size={17} className="text-[var(--aqua)]" /><span className="text-xs font-bold">CAMPUS LIVE MAP</span></div>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-[#a8d6c6]"><span className="h-1.5 w-1.5 rounded-full bg-[#72d5a9]" /> พร้อมใช้งาน</span>
                </div>
                <div className="map-surface relative h-[390px] overflow-hidden sm:h-[470px]">
                  <div className="absolute inset-0 opacity-75"><MapView initialCenter={CAMPUS_OVERVIEW.mapCenter} initialZoom={16} onMapReady={handleMapReady} className="h-full w-full" /></div>
                  <div className="map-road left-[-5%] top-[48%] w-[120%] rotate-[18deg]" />
                  <div className="map-road left-[41%] top-[-12%] h-[125%] w-[17px] rotate-[30deg]" />
                  <div className="map-road left-[7%] top-[22%] w-[92%] rotate-[-22deg] opacity-75" />
                  <div className="map-building left-[15%] top-[28%] h-[21%] w-[21%]" />
                  <div className="map-building left-[45%] top-[32%] h-[17%] w-[21%]" />
                  <div className="map-building left-[72%] top-[18%] h-[21%] w-[18%]" />
                  <div className="map-building left-[67%] top-[57%] h-[19%] w-[24%]" />
                  <div className="map-building left-[28%] top-[67%] h-[17%] w-[23%]" />
                  <div className="map-building left-[8%] top-[62%] h-[19%] w-[17%]" />
                  {buildings.map((building) => <MapPinMarker key={building.id} building={building} selected={building.id === selectedId} onClick={() => focusBuilding(building)} />)}
                  <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-[10px] font-bold text-[var(--ink)] shadow-sm backdrop-blur"><Layers3 size={13} className="text-[var(--aqua)]" /> แผนผังวิทยาลัย</div>
                  <div className="absolute right-4 top-4 z-20 flex flex-col gap-1.5"><button type="button" onClick={() => { const map = mapRef.current; if (map) map.setZoom((map.getZoom() ?? 16) + 1); }} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-lg font-medium text-[var(--ink)] shadow-sm">+</button><button type="button" onClick={() => { const map = mapRef.current; if (map) map.setZoom((map.getZoom() ?? 16) - 1); }} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-lg font-medium text-[var(--ink)] shadow-sm">−</button></div>
                </div>
                <div className="flex items-center justify-between gap-4 bg-white px-4 py-3.5 sm:px-5"><div><p className="text-xs font-extrabold text-[var(--ink)]">วิทยาลัยเทคนิคสมุทรสงคราม</p><p className="mt-1 text-[10px] text-[var(--muted-foreground)]">{CAMPUS_OVERVIEW.address}</p></div><button type="button" onClick={() => scrollToId("campus-map")} className="flex shrink-0 items-center gap-1.5 text-xs font-extrabold text-[#287c78]">เปิดแผนที่เต็ม <ArrowUpRight size={14} /></button></div>
              </div>
            </div>
          </div>
        </section>

        <section id="campus-map" className="mx-auto max-w-[1440px] scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div><p className="mb-3 text-xs font-extrabold tracking-[0.16em] text-[#398e89]">01 / EXPLORE THE CAMPUS</p><h2 className="font-display text-3xl font-bold tracking-[-0.05em] text-[var(--ink)] sm:text-4xl">เลือกดูอาคารที่คุณต้องการ</h2><p className="mt-3 max-w-[560px] text-sm leading-7 text-[var(--muted-foreground)]">คลิกหมุดบนแผนที่ หรือค้นหาจากรายชื่ออาคาร เพื่อดูข้อมูลสาขา จำนวนชั้น และห้องภายในอาคาร</p></div>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted-foreground)]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)]"><Navigation size={14} /></span> ศูนย์กลางแผนที่พร้อมใช้งาน</div>
          </div>
          <div className="grid overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-[0_18px_55px_rgba(16,41,58,0.08)] lg:grid-cols-[350px_1fr]">
            <aside className="flex max-h-[650px] flex-col border-b border-[var(--border)] lg:border-b-0 lg:border-r">
              <div className="border-b border-[var(--border)] p-5"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาอาคารหรือสาขา..." className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:border-[var(--aqua)]" /></div><div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">{categoryFilters.map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${activeCategory === category ? "bg-[var(--ink)] text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"}`}>{category}</button>)}</div></div>
              <div className="overflow-y-auto p-3">
                {filteredBuildings.length ? filteredBuildings.map((building) => <button key={building.id} type="button" onClick={() => focusBuilding(building)} className={`group mb-1 flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-all ${selectedBuilding?.id === building.id ? "bg-[var(--secondary)]" : "hover:bg-[var(--background)]"}`}><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: building.accent }}><Building2 size={16} /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-extrabold text-[var(--ink)]">{building.name}</span><ChevronRight size={15} className="shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5" /></span><span className="mt-1 block text-[11px] font-medium text-[var(--muted-foreground)]">{building.category} · {building.floors} ชั้น</span></span></button>) : <div className="px-3 py-10 text-center text-sm text-[var(--muted-foreground)]">ไม่พบอาคารที่ค้นหา</div>}
              </div>
              <div className="mt-auto border-t border-[var(--border)] bg-[var(--background)] p-4"><p className="text-[11px] leading-5 text-[var(--muted-foreground)]"><span className="font-bold text-[var(--ink)]">เคล็ดลับ:</span> ใช้หมุดสีต่าง ๆ เพื่อแยกประเภทอาคารและบริการภายในวิทยาลัย</p></div>
            </aside>
            <div className="bg-[#deece7] p-3 sm:p-5"><div className="relative h-[620px] overflow-hidden rounded-[20px] bg-[#dcece4]"><div className="absolute inset-0 opacity-76"><MapView initialCenter={CAMPUS_OVERVIEW.mapCenter} initialZoom={16} onMapReady={handleMapReady} className="h-full w-full" /></div><div className="map-road left-[-12%] top-[47%] w-[125%] rotate-[17deg]" /><div className="map-road left-[43%] top-[-18%] h-[135%] w-[22px] rotate-[31deg]" /><div className="map-road left-[0%] top-[21%] w-[100%] rotate-[-21deg] opacity-75" /><div className="map-road left-[18%] top-[78%] w-[85%] rotate-[7deg] opacity-70" /><div className="map-building left-[15%] top-[28%] h-[21%] w-[21%]" /><div className="map-building left-[45%] top-[32%] h-[17%] w-[21%]" /><div className="map-building left-[72%] top-[18%] h-[21%] w-[18%]" /><div className="map-building left-[67%] top-[57%] h-[19%] w-[24%]" /><div className="map-building left-[28%] top-[67%] h-[17%] w-[23%]" /><div className="map-building left-[8%] top-[62%] h-[19%] w-[17%]" />{buildings.map((building) => <MapPinMarker key={building.id} building={building} selected={building.id === selectedId} onClick={() => focusBuilding(building)} />)}<div className="absolute left-4 top-4 z-20 rounded-full bg-[var(--ink)] px-3 py-2 text-[10px] font-bold text-white shadow-lg sm:left-5 sm:top-5">{filteredBuildings.length} จุดสำคัญในวิทยาลัย</div><div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-[10px] font-bold text-[var(--ink)] shadow-sm backdrop-blur"><MapPin size={13} className="text-[var(--coral)]" fill="currentColor" /> แตะหมุดเพื่อดูข้อมูล</div></div></div>
          </div>

          {selectedBuilding && <div className="mt-5 grid gap-5 rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[0_12px_35px_rgba(16,41,58,0.06)] sm:p-7 md:grid-cols-[1fr_1.3fr] md:items-start"><div><div className="mb-4 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: selectedBuilding.accent }}><Building2 size={19} /></span><div><div className="flex items-center gap-2"><h3 className="font-display text-xl font-bold tracking-[-0.04em] text-[var(--ink)]">{selectedBuilding.name}</h3><span className="rounded-full bg-[var(--muted)] px-2 py-1 text-[10px] font-bold text-[var(--muted-foreground)]">{selectedBuilding.category}</span></div><p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">ข้อมูลอาคารอัปเดตล่าสุด · {selectedBuilding.floors} ชั้น</p></div></div><p className="text-sm leading-7 text-[var(--muted-foreground)]">{selectedBuilding.description}</p><button type="button" onClick={() => scrollToId("about")} className="mt-5 flex items-center gap-2 text-xs font-extrabold text-[#287c78]">ขอเส้นทางไปอาคารนี้ <ArrowUpRight size={14} /></button></div><FloorDetails building={selectedBuilding} /></div>}
        </section>

        <section id="news" className="scroll-mt-20 border-y border-[var(--border)] bg-[#edf3ef]">
          <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-3 text-xs font-extrabold tracking-[0.16em] text-[#398e89]">02 / CAMPUS NEWS</p><h2 className="font-display text-3xl font-bold tracking-[-0.05em] text-[var(--ink)] sm:text-4xl">ข่าวสารจากวิทยาลัยฯ</h2></div><button type="button" onClick={() => window.alert("ส่วนข่าวสารทั้งหมดจะเชื่อมต่อ API ข่าวสารในขั้นตอนถัดไป")} className="flex items-center gap-1 text-sm font-extrabold text-[#287c78]">ดูทั้งหมด <ArrowUpRight size={15} /></button></div><div className="grid gap-4 lg:grid-cols-3">{news.map((item, index) => <article key={item.id} className={`group relative overflow-hidden rounded-[22px] border border-white/80 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(16,41,58,0.1)] ${index === 0 ? "lg:p-7" : ""}`}><div className="absolute right-[-25px] top-[-30px] h-24 w-24 rounded-full opacity-25" style={{ backgroundColor: item.accent }} /><div className="relative flex h-full flex-col"><div className="flex items-center justify-between"><span className="rounded-full px-2.5 py-1 text-[10px] font-extrabold" style={{ color: item.accent, backgroundColor: `${item.accent}18` }}>{item.tag}</span><span className="text-[11px] font-medium text-[var(--muted-foreground)]">{item.date}</span></div><h3 className="mt-8 max-w-[340px] text-xl font-extrabold leading-snug tracking-[-0.03em] text-[var(--ink)]">{item.title}</h3><p className="mt-3 flex-1 text-sm leading-7 text-[var(--muted-foreground)]">{item.excerpt}</p><div className="mt-7 flex items-center justify-between border-t border-[var(--border)] pt-4"><span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted-foreground)]"><Clock3 size={13} /> {item.time}</span><button type="button" onClick={() => window.alert(`เปิดข่าว: ${item.title}`)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--ink)] transition-colors group-hover:bg-[var(--ink)] group-hover:text-white" aria-label={`อ่านข่าว ${item.title}`}><ArrowUpRight size={14} /></button></div></div></article>)}</div></div>
        </section>

        <section id="about" className="mx-auto max-w-[1440px] scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12 lg:py-20"><div className="grid gap-8 rounded-[28px] bg-[var(--ink)] px-6 py-9 text-white sm:px-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-end lg:px-14 lg:py-12"><div><p className="mb-3 text-xs font-extrabold tracking-[0.16em] text-[var(--aqua)]">ABOUT THE CAMPUS</p><h2 className="max-w-[680px] text-3xl font-extrabold leading-tight tracking-[-0.05em] sm:text-4xl">พื้นที่เล็ก ๆ ที่เต็มไปด้วย<br /><span className="text-[#9edbd1]">โอกาสการเรียนรู้</span></h2><p className="mt-4 max-w-[630px] text-sm leading-7 text-white/65">วิทยาลัยเทคนิคสมุทรสงครามมุ่งพัฒนากำลังคนสายอาชีพให้พร้อมสำหรับโลกการทำงาน ด้วยการเรียนรู้จากสถานที่จริง เทคโนโลยีจริง และความร่วมมือจากชุมชน</p></div><div className="flex flex-col gap-3 lg:items-end"><div className="flex items-center gap-2 text-sm font-bold text-white/80"><MapPin size={17} className="text-[var(--coral)]" /> {CAMPUS_OVERVIEW.address}</div><a href="mailto:info@smtc.ac.th" className="flex items-center gap-2 text-sm font-bold text-[var(--aqua)] transition-colors hover:text-white">ติดต่อวิทยาลัย <ArrowUpRight size={15} /></a></div></div></section>
      </main>
      <footer className="border-t border-[var(--border)] bg-white"><div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-3 px-5 py-6 text-[11px] font-medium text-[var(--muted-foreground)] sm:flex-row sm:px-8 lg:px-12"><span>© 2026 วิทยาลัยเทคนิคสมุทรสงคราม · Campus Guide</span><span>ข้อมูลสาธิตสำหรับโครงงาน frontend และ backend</span></div></footer>
    </div>
  );
}
