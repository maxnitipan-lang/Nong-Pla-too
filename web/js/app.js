// Nong Pla Too Ontour — kiosk ( / ) and phone app ( /app ) in plain HTML/CSS/JS.
// The page's <body data-mode="kiosk|phone"> picks the behaviour:
//   kiosk: routes start at the kiosk's spot, QR hand-off to a phone, resets after 90 s idle
//   phone: GPS distance, live turn-by-turn navigation, deep links from the kiosk QR
// Same screens for both: home, map, news, departments (the Figma design).

import { CAMPUS_BUILDINGS, CAMPUS_CATEGORIES, CAMPUS_OVERVIEW, DEFAULT_DEPARTMENTS } from "/shared/campus.js";
import { distanceM, planCampusRoute } from "/shared/walkNetwork.js";
import { loadBuildings, loadNews, loadSettings, loadWalkNetwork, savedBuildings, savedNews } from "./api.js";
import { buildingLatLng, buildingSearchText, formatDistance, hasCoords, phoneRouteUrl, walkMinutes, walkingDeepLink } from "./directions.js";
import { icon } from "./icons.js";
import { createChat } from "./chat.js";
import { CampusMap } from "./map.js";
import { CampusNavigation } from "./navigation.js";
import { fillQrCodes } from "./qr.js";
import { navBannerHtml, navSummary, routePanelHtml } from "./routePanel.js";
import { $, esc, html, raw, readStore, writeStore } from "./util.js";

const MODE = document.body.dataset.mode === "phone" ? "phone" : "kiosk";
const KIOSK = MODE === "kiosk";
const GPS_OK_KEY = "nong-platoo-gps-ok";
const INSTALL_DISMISSED_KEY = "nong-platoo-install-dismissed";
const COLLEGE_NEWS_URL = "https://www.sstc.ac.th/news_325_1";
const DEFAULT_WALK_NETWORK_URL = "/shared/data/campusWalkNetwork.json";

/** Department logos stored with the app, by department code (an uploaded logo wins). */
const DEPARTMENT_LOGOS = {
  AUT: "/images/departments/AUT.png",
  DBT: "/images/departments/DBT.png",
  ELEC: "/images/departments/ELEC.png",
  MEC: "/images/departments/MEC.png",
  ACC: "/images/departments/ACC.png",
};

const NAV_ITEMS = [
  { id: "home", label: "หน้าหลัก", icon: "home" },
  { id: "map", label: "แผนที่", icon: "map" },
  { id: "news", label: "ข่าวสาร", icon: "news" },
  { id: "departments", label: "สาขาวิชา", icon: "school" },
];

const params = new URLSearchParams(window.location.search);
/** Kiosk resets after this long without a touch (90 s; ?idle=5 sets 5 s for testing). */
const IDLE_MS = (Number(params.get("idle")) || 90) * 1000;

/* ------------------------------------------------------------------ state */

const state = {
  view: params.get("place") ? "map" : "home",
  selectedId: params.get("place"),
  buildings: savedBuildings() ?? CAMPUS_BUILDINGS,
  news: savedNews() ?? [],
  kiosk: null, // { lat, lng, name } from admin settings
  query: "",
  filter: "ทั้งหมด",
  listOpen: false,
  gpsOn: !KIOSK && readStore(GPS_OK_KEY) === 1,
  liveFix: null,
  gpsError: null,
  idle: false,
  theme: localStorage.getItem("theme") === "dark" ? "dark" : "light",
  online: navigator.onLine,
  openDepartment: null,
  installPrompt: null,
  installDismissed: readStore(INSTALL_DISMISSED_KEY) === 1 || window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true,
};

const nav = new CampusNavigation({ getBuildings: () => state.buildings, network: { nodes: [], edges: [] } });
let map = null; // CampusMap while the map screen is open

/* ------------------------------------------------------------------ data helpers */

const departmentsOf = (b) => (b.departments ?? []).filter((d) => d.floor <= b.floors);
const logoOf = (d) => d.logo || DEPARTMENT_LOGOS[d.code];
const pinColor = (b) => departmentsOf(b)[0]?.accent ?? b.accent;
const numberOf = (id) => state.buildings.findIndex((b) => b.id === id) + 1;
const selected = () => state.buildings.find((b) => b.id === state.selectedId) ?? null;

/** Every department from the admin data, once each, with the building it's in. */
function collectDepartments() {
  const seen = new Map();
  for (const building of state.buildings) {
    for (const department of departmentsOf(building)) {
      const key = department.code || department.name;
      if (!seen.has(key)) seen.set(key, { department, building });
    }
  }
  return seen.size ? [...seen.values()] : DEFAULT_DEPARTMENTS.map((department) => ({ department }));
}

/** "18 ก.ย. 2569" → { day: "18", month: "ก.ย." } */
function splitThaiDate(date) {
  const m = String(date ?? "").match(/(\d{1,2})\s+([ก-๙]{1,3}\.[ก-๙]{1,2}\.?)/);
  return m ? { day: m[1].padStart(2, "0"), month: m[2] } : null;
}

/** Where the walker is (phone only). */
function here() {
  if (KIOSK) return null;
  return nav.state.live ? nav.fix : state.liveFix ?? nav.fix;
}

/** Buildings matching the search and filter, nearest first when we know where you are. */
function places() {
  const q = state.query.trim().toLowerCase();
  const me = here();
  return state.buildings
    .filter((b) => (state.filter === "ทั้งหมด" || b.category === state.filter) && (!q || buildingSearchText(b).includes(q)))
    .map((b) => {
      const p = buildingLatLng(b);
      return { building: b, distance: me && p ? distanceM(me, p) : null };
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || numberOf(a.building.id) - numberOf(b.building.id));
}

/** Real walking distance/time to the selected building (phone). */
function walkEstimate() {
  const b = selected();
  const me = here();
  const p = b && buildingLatLng(b);
  if (!me || !p || !nav.network.nodes.length) return null;
  const route = planCampusRoute(nav.network, me, { ...p, buildingId: b.id, name: b.name });
  if (!route) return null;
  const total = route.distance + (route.offCampus?.straightDistance ?? 0);
  return { distance: total, minutes: walkMinutes(total), offCampus: Boolean(route.offCampus) };
}

/* ------------------------------------------------------------------ chat */

/** Open the น้องปลาทู panel (js/chat.js); voice = start listening straight away. */
function openChat(voice) {
  window.dispatchEvent(new Event(voice ? "nongplatoo:voice" : "nongplatoo:open"));
}

function toast(text) {
  let el = $(".platoo-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "platoo-toast";
    el.setAttribute("role", "status");
    $("#root").append(el);
  }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3500);
}

/* ------------------------------------------------------------------ header + menus */

function headerHtml() {
  const v = state.view;
  return html`<header class="app-header ${v === "home" ? "kiosk-header" : ""}">
    <button class="brand" data-action="go" data-view="home" aria-label="กลับหน้าหลัก">
      <img class="header-platoo" src="/mascots/greeting.webp" alt="น้องปลาทู" />
      <span class="header-brand-text">Nong Pla Too <em>Ontour</em></span>
    </button>
    ${v !== "home"
      ? raw(html`<nav class="desktop-nav" aria-label="เมนูหลัก">${NAV_ITEMS.map((item) =>
          raw(html`<button class="${v === item.id ? "active" : ""}" data-action="go" data-view="${item.id}">${item.label}</button>`))}</nav>`)
      : ""}
    <div class="header-actions">
      <span class="online-status ${state.online ? "" : "offline"}"><i></i> ${state.online ? "ออนไลน์" : "ออฟไลน์"}</span>
      <button class="icon-button" data-action="theme" aria-label="${state.theme === "dark" ? "ใช้ธีมสว่าง" : "ใช้ธีมมืด"}">${raw(icon(state.theme === "dark" ? "sun" : "moon"))}</button>
      <button class="install-button" data-action="go" data-view="map"><span>เปิดแผนที่</span>${raw(icon("map"))}</button>
    </div>
  </header>`;
}

function chromeHtml() {
  return html`<button class="floating-ai" data-action="chat" aria-label="เปิดผู้ช่วยน้องปลาทู">
      <img class="floating-platoo" src="/mascots/jump.webp" alt="" aria-hidden="true" />
      <span class="floating-ai-copy"><strong>ถามน้องปลาทู</strong><small>แตะเพื่อเริ่มถาม</small></span>
    </button>
    <nav class="mobile-nav" aria-label="เมนูสำหรับมือถือ">${NAV_ITEMS.map((item) =>
      raw(html`<button class="${state.view === item.id ? "active" : ""}" data-action="go" data-view="${item.id}">${raw(icon(item.icon))}<span>${item.label}</span></button>`))}</nav>`;
}

/* ------------------------------------------------------------------ home */

function homeHtml() {
  const menu = [
    { label: "ค้นหาสถานที่", description: "ดูอาคาร ห้องเรียน และเส้นทาง", icon: "pin", cls: "kiosk-blue", mascot: "search", action: "go", view: "map" },
    { label: "ข่าวสาร", description: "ประกาศและกิจกรรมล่าสุด", icon: "news", cls: "kiosk-teal", mascot: "point", action: "go", view: "news" },
    { label: "สาขาวิชา", description: "ดูแผนกและหลักสูตรทั้งหมด", icon: "school", cls: "kiosk-gold", mascot: "globe", action: "go", view: "departments" },
    { label: "ถามด้วยเสียง", description: "พูดคุยกับน้องปลาทู", icon: "mic", cls: "kiosk-sky", mascot: "jump", action: "voice", view: "" },
  ];
  return html`<main class="kiosk-home">
    <section class="kiosk-assistant">
      <span class="assistant-label">ผู้ช่วยนำทางอัจฉริยะวิทยาลัยเทคนิคสมุทรสงคราม</span>
      <div class="kiosk-mascot-wrap">
        <img class="platoo-main-image" src="/mascots/greeting.webp" alt="น้องปลาทูยกมือไหว้ทักทาย" />
        <button class="kiosk-mic" data-action="voice" aria-label="ถามน้องปลาทูด้วยเสียง">${raw(icon("mic"))}</button>
      </div>
      <div class="kiosk-greeting">
        <strong>สวัสดีครับ ผมน้องปลาทู</strong>
        <span>แตะเมนูด้านข้าง หรือกดไมค์เพื่อพูดได้เลยครับ</span>
      </div>
      <div class="kiosk-stats">
        <div><strong>${state.buildings.length}</strong><span>สถานที่ในวิทยาลัย</span></div>
        <div><strong>${collectDepartments().length}</strong><span>สาขาวิชา</span></div>
      </div>
    </section>
    <section class="kiosk-menu">
      <div class="kiosk-menu-heading">
        <span>ยินดีต้อนรับสู่ Nong Platoo Ontour</span>
        <h1>เลือกสิ่งที่ต้องการได้เลยครับ</h1>
      </div>
      <div class="kiosk-menu-grid">${menu.map((m) =>
        raw(html`<button class="kiosk-menu-card ${m.cls}" data-action="${m.action}" data-view="${m.view}">
          <span class="kiosk-card-icon">${raw(icon(m.icon))}</span>
          <span class="kiosk-card-copy"><strong>${m.label}</strong><small>${m.description}</small></span>
          <span class="kiosk-card-arrow">${raw(icon("arrow"))}</span>
          <img class="button-mascot" src="/mascots/${m.mascot}.webp" alt="" aria-hidden="true" />
        </button>`))}</div>
      <button class="kiosk-map-button" data-action="go" data-view="map">
        ${raw(icon("map"))}<span>เปิดแผนที่วิทยาลัยและดูทุกอาคาร</span>${raw(icon("arrow"))}
        <img class="map-button-mascot" src="/mascots/map.webp" alt="" aria-hidden="true" />
      </button>
      ${!KIOSK ? raw(installCardHtml()) : ""}
    </section>
  </main>`;
}

function installCardHtml() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (state.installDismissed || (!state.installPrompt && !ios)) return "";
  return html`<div class="install-card">
    <img src="/icons/icon-192.png" alt="" />
    <div><strong>ติดตั้งแอปน้องปลาทู</strong>${state.installPrompt ? "เปิดได้จากหน้าจอโฮม เต็มจอ ใช้ได้แม้สัญญาณไม่ดี" : 'แตะ แชร์ แล้วเลือก "เพิ่มไปยังหน้าจอโฮม"'}</div>
    ${state.installPrompt ? raw(html`<button type="button" class="install-go" data-action="install">${raw(icon("download"))} ติดตั้ง</button>`) : ""}
    <button type="button" data-action="install-dismiss" aria-label="ไม่ต้องติดตั้ง">${raw(icon("close"))}</button>
  </div>`;
}

/* ------------------------------------------------------------------ map screen */

function mapShellHtml() {
  const categories = ["ทั้งหมด", ...CAMPUS_CATEGORIES];
  const filterButtons = categories.map((c) => raw(html`<button class="${state.filter === c ? "active" : ""}" data-action="filter" data-filter="${c}">${c}</button>`));
  return html`<main class="page-shell map-page">
    <div class="map-page-heading">
      <div>
        <span class="map-kicker"><i></i> แผนที่วิทยาลัย</span>
        <h1>วันนี้คุณอยากไปที่ไหน?</h1>
        <p>ค้นหาอาคาร ห้องเรียน หรือจุดบริการ แล้วกดนำทางได้ทันที</p>
      </div>
      <img class="section-mascot map-heading-mascot" src="/mascots/map.webp" alt="" aria-hidden="true" />
      <div class="map-heading-actions">
        ${!KIOSK ? raw(html`<button class="locate-button" data-action="gps-on">${raw(icon("pin"))} <span>ตำแหน่งของฉัน</span></button>`) : ""}
        <small id="location-note"></small>
      </div>
    </div>
    <div class="map-layout">
      <aside class="place-panel" id="place-panel">
        <div class="mobile-sheet-handle"></div>
        <div class="panel-heading">
          <div><strong>สถานที่ทั้งหมด</strong><small id="panel-sub">เลือกสถานที่เพื่อดูบนแผนที่</small></div>
          <button class="mobile-panel-close" data-action="list-close" aria-label="ปิดรายชื่อสถานที่">${raw(icon("close"))}</button>
        </div>
        <label class="search-box">
          ${raw(icon("search"))}
          <input id="place-search" value="${state.query}" placeholder="ค้นหาอาคาร ห้อง หรือสาขา..." />
          <button type="button" data-action="search-clear" aria-label="ล้างคำค้นหา" ${state.query ? "" : "hidden"}>${raw(icon("close"))}</button>
        </label>
        <div class="filters">${filterButtons}</div>
        <div class="place-list" id="place-list"></div>
      </aside>
      <section class="map-canvas real-map" id="map-canvas">
        <div class="map-surface" id="map-surface"></div>
        <div class="map-mode-slot"><div class="map-mode" role="group" aria-label="รูปแบบแผนที่">
          <button type="button" data-action="map-mode" data-mode="2d" aria-pressed="${mapMode === "2d"}">2D</button>
          <button type="button" data-action="map-mode" data-mode="3d" aria-pressed="${mapMode === "3d"}">3D</button>
        </div></div>
        <div id="nav-banner"></div>
        <div class="mobile-map-controls" id="mobile-controls">
          <label class="map-search">
            ${raw(icon("search"))}
            <input id="map-search" value="${state.query}" placeholder="ค้นหาสถานที่..." />
            <button type="button" data-action="list-open">ดูทั้งหมด</button>
          </label>
          <div class="map-filter-row">${filterButtons}</div>
        </div>
        <div class="map-guide" id="map-guide">${raw(icon("pin"))}<span><strong>แตะหมุดบนแผนที่</strong><small>เพื่อดูข้อมูลและเส้นทาง</small></span></div>
        <button class="show-places-button" id="show-places" data-action="list-open">
          ${raw(icon("building"))}<span><strong>ดูรายชื่อสถานที่</strong><small>${state.buildings.length} แห่งในวิทยาลัย</small></span>${raw(icon("arrow"))}
        </button>
        <div id="building-card-slot"></div>
        <button class="sheet-backdrop" id="sheet-backdrop" data-action="list-close" aria-label="ปิดรายชื่อสถานที่" hidden><span></span></button>
      </section>
    </div>
  </main>`;
}

function placeListHtml() {
  const list = places();
  const rows = list.map(({ building: b, distance }) =>
    raw(html`<button class="place-item ${state.selectedId === b.id ? "selected" : ""}" data-action="select" data-id="${b.id}">
      <span class="place-number" style="background:${pinColor(b)}">${numberOf(b.id)}</span>
      <span><strong>${b.name}</strong><small>${b.category} · ${b.floors} ชั้น</small>${distance !== null ? raw(html`<small class="distance">${formatDistance(distance)}</small>`) : ""}</span>
      ${raw(icon("arrow"))}
    </button>`));
  const empty = list.length
    ? ""
    : raw(html`<div class="empty-places">${raw(icon("search"))}<strong>ไม่พบสถานที่</strong><small>ลองค้นหาด้วยชื่ออาคารหรือห้องอื่น หรือถามน้องปลาทู</small></div>`);
  return html`<p>พบ ${list.length} สถานที่</p>${rows}${empty}`;
}

function buildingCardHtml() {
  const b = selected();
  if (!b) return "";
  if (nav.state.status !== "idle") return html`<article class="building-card"><div class="route-panel-wrap">${raw(routePanelHtml(nav))}</div></article>`;
  const rooms = (b.floorsDetail ?? []).flatMap((f) => f.rooms).slice(0, 10);
  const depts = departmentsOf(b);
  const walk = KIOSK ? null : walkEstimate();
  const walkText = walk
    ? `🚶 เดิน ${formatDistance(walk.distance)} · ~${walk.minutes} นาที${walk.offCampus ? " (จากนอกวิทยาลัย)" : ""}`
    : here() ? "กำลังคำนวณระยะทาง…" : "เปิดตำแหน่งเพื่อดูระยะทาง";
  const routeLabel = KIOSK ? (state.kiosk ? "ดูเส้นทางจากตู้นี้" : "ดูเส้นทาง") : "เริ่มนำทาง";
  return html`<article class="building-card">
    <button class="card-close" data-action="card-close" aria-label="ปิดรายละเอียด">${raw(icon("close"))}</button>
    <div class="building-card-head">
      <span class="place-number" style="background:${pinColor(b)}">${numberOf(b.id)}</span>
      <div><span class="building-category">${b.category}</span><h2>${b.name}</h2></div>
    </div>
    ${b.description ? raw(html`<p>${b.description}</p>`) : ""}
    <div class="building-meta">
      <span>${raw(icon("building"))} ${b.floors} ชั้น</span>
      ${depts.length ? raw(html`<span>${raw(icon("school"))} ${depts.map((d) => d.name).join(", ")}</span>`) : ""}
    </div>
    ${rooms.length ? raw(html`<div class="room-chips">${rooms.map((r) => raw(html`<span>${r}</span>`))}</div>`) : ""}
    ${!KIOSK ? raw(html`<p class="walk-line">${walkText}</p>`) : ""}
    <div class="card-actions">
      ${hasCoords(b)
        ? raw(html`<button class="route-button" data-action="route">${raw(icon("route"))} ${routeLabel}</button>`)
        : raw(html`<a class="route-button" href="${walkingDeepLink(b)}" target="_blank" rel="noreferrer">${raw(icon("route"))} นำทาง (Google Maps)</a>`)}
      <a class="card-icon-button" href="${walkingDeepLink(b)}" target="_blank" rel="noreferrer" aria-label="เปิดใน Google Maps">${raw(icon("map"))}</a>
      ${!KIOSK ? raw(html`<button class="card-icon-button" data-action="share" aria-label="แชร์สถานที่">${raw(icon("share"))}</button>`) : ""}
    </div>
    ${KIOSK
      ? raw(html`<div class="card-qr"><div class="qr qr-small" data-qr="${phoneRouteUrl(b.id, false)}" role="img" aria-label="QR เปิดอาคารนี้บนมือถือ"></div>
          <p><strong>ดูอาคารนี้บนมือถือ</strong>สแกนด้วยกล้องมือถือ แล้วกดนำทาง มือถือจะพาเดินด้วย GPS</p></div>`)
      : ""}
  </article>`;
}

/** Leaflet pin in the design's style: numbered drop + name label. */
function markerHtml(b, active) {
  return `<div class="leaflet-pin ${active ? "active" : ""}" style="--pin:${esc(pinColor(b))}"><b><i>${numberOf(b.id)}</i></b><small>${esc(b.shortName || b.name)}</small></div>`;
}

/** 2D (Leaflet) or 3D (three.js) — remembered on this device, same key as the React version. */
const MAP_MODE_KEY = "nongplatoo.mapMode";
let mapMode = localStorage.getItem(MAP_MODE_KEY) === "2d" ? "2d" : "3d";
let mountId = 0;

function setMapMode(mode) {
  mapMode = mode;
  try {
    localStorage.setItem(MAP_MODE_KEY, mode);
  } catch {
    /* kiosk lockdown — just don't remember it */
  }
  mountMap();
}

async function mountMap() {
  const id = ++mountId;
  map?.destroy();
  map = null;
  for (const b of document.querySelectorAll("[data-action=map-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === mapMode));
  const surface = $("#map-surface");
  const options = {
    buildings: places().map((p) => p.building),
    center: CAMPUS_OVERVIEW.mapCenter,
    onSelect: (buildingId) => selectBuilding(buildingId),
    markerHtml,
    markerSize: [120, 72],
    userLabel: KIOSK && state.kiosk ? "คุณอยู่ที่นี่" : undefined,
    controlsTop: KIOSK ? 70 : 120,
    dark: state.theme === "dark",
  };
  if (mapMode === "3d") {
    surface.innerHTML = '<p class="map3d-loading">กำลังโหลดแผนที่ 3D…</p>';
    let map3d = null;
    try {
      // three.js is big — only download it when the 3D map is actually shown.
      const { createCampusMap3D } = await import("./map3d.js");
      if (id !== mountId || !surface.isConnected) return;
      surface.innerHTML = "";
      map3d = await createCampusMap3D(surface, { ...options, onUnsupported: () => toast("เครื่องนี้แสดงแผนที่ 3D ไม่ได้ — ใช้แผนที่ 2D แทน") });
    } catch (error) {
      // e.g. offline before three.js was ever downloaded — show the 2D map instead of "loading" forever.
      console.warn("[map] 3D map could not load", error);
      if (id !== mountId || !surface.isConnected) return;
      surface.innerHTML = "";
      toast("โหลดแผนที่ 3D ไม่ได้ — ใช้แผนที่ 2D แทน");
    }
    if (id !== mountId || !surface.isConnected) {
      map3d?.destroy();
      return;
    }
    if (map3d) map = map3d;
    else {
      mapMode = "2d"; // no WebGL on this device
      for (const b of document.querySelectorAll("[data-action=map-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === "2d"));
    }
  }
  if (!map) map = new CampusMap(surface, options);
  if (state.selectedId) map.setSelected(state.selectedId);
  updateMap();
}

/** Refresh the parts of the map screen that depend on state (not the inputs you type in). */
function updateMap() {
  if (state.view !== "map" || !map) return;
  const navigating = nav.state.status !== "idle";
  const s = nav.state;
  $("#place-list").innerHTML = placeListHtml();
  $("#panel-sub").textContent = here() ? "เรียงจากใกล้คุณที่สุด" : "เลือกสถานที่เพื่อดูบนแผนที่";
  $("#place-panel").classList.toggle("panel-open", state.listOpen);
  $("#sheet-backdrop").hidden = !state.listOpen;
  $("#map-canvas").classList.toggle("navigating", navigating);
  $("#nav-banner").innerHTML = navigating ? navBannerHtml(nav) : "";
  $("#mobile-controls").hidden = navigating;
  $("#map-guide").hidden = navigating;
  $("#show-places").hidden = Boolean(selected()) || navigating;
  $("#building-card-slot").innerHTML = buildingCardHtml();
  $$filters().forEach((btn) => btn.classList.toggle("active", btn.dataset.filter === state.filter));

  const note = $("#location-note");
  note.className = state.gpsError ? "gps-error" : "";
  note.textContent = KIOSK
    ? state.kiosk ? `เริ่มจาก: ${state.kiosk.name}` : ""
    : state.gpsError ?? (state.gpsOn ? (here() ? "พบตำแหน่งของคุณแล้ว" : "กำลังค้นหาตำแหน่ง...") : "");

  map.setBuildings(places().map((p) => p.building));
  map.setSelected(state.selectedId);
  map.setRoute(s.route, s.approachPath, s.live);
  map.setActiveStep(s.progress?.stepIndex);
  const me = KIOSK ? (state.kiosk ? nav.fix : null) : here();
  if (me) map.setUser(me);
  void fillQrCodes($("#map-canvas"));
}

const $$filters = () => [...document.querySelectorAll("[data-action=filter]")];

/* ------------------------------------------------------------------ news */

function newsHtml() {
  const [featured, ...rest] = state.news;
  const link = (item, cls, inner) =>
    item.link ? html`<a class="${cls}" href="${item.link}" target="_blank" rel="noreferrer">${raw(inner)}</a>` : html`<article class="${cls}">${raw(inner)}</article>`;
  const featuredHtml = featured
    ? link(
        featured,
        "featured-news",
        html`<div>
          <span class="news-pill">${featured.tag || "ข่าวเด่น"}</span>
          <h2>${featured.title}</h2>
          ${featured.excerpt ? raw(html`<p>${featured.excerpt}</p>`) : ""}
          ${featured.date || featured.time ? raw(html`<p>${[featured.date, featured.time].filter(Boolean).join(" · ")}</p>`) : ""}
        </div>
        ${featured.image
          ? raw(html`<div class="feature-art photo"><img src="${featured.image}" alt="" loading="lazy" /></div>`)
          : raw('<img class="featured-news-mascot" src="/mascots/jump.webp" alt="" aria-hidden="true" />')}`,
      )
    : html`<div class="empty-state">ยังไม่มีข่าวในตอนนี้ — ลองเปิดหน้านี้ใหม่อีกครั้งภายหลังครับ</div>`;
  const cards = rest.map((item) => {
    const date = splitThaiDate(item.date);
    return raw(
      link(
        item,
        "news-card",
        html`<div class="date-block ${date ? "" : "no-date"}">${date ? raw(html`<strong>${date.day}</strong><span>${date.month}</span>`) : raw(icon("news"))}</div>
        <div><span class="tag">${item.tag}</span><h3>${item.title}</h3><p>${item.excerpt || [item.date, item.time].filter(Boolean).join(" · ")}</p></div>`,
      ),
    );
  });
  return html`<main class="page-shell content-page">
    <div class="page-title">
      <span class="title-icon yellow">${raw(icon("news"))}</span>
      <div><span>อัปเดตจากวิทยาลัย</span><h1>ข่าวสารและกิจกรรม</h1></div>
    </div>
    ${raw(featuredHtml)}
    ${cards.length ? raw(html`<div class="news-grid">${cards}</div>`) : ""}
    <a class="news-more" href="${COLLEGE_NEWS_URL}" target="_blank" rel="noreferrer">ดูข่าวทั้งหมดบนเว็บวิทยาลัย ${raw(icon("arrow"))}</a>
  </main>`;
}

/* ------------------------------------------------------------------ departments */

function departmentsHtml() {
  const entries = collectDepartments();
  const logoBox = (d) => {
    const logo = logoOf(d);
    return html`<span class="department-icon" style="background:${d.accent}18;color:${d.accent}">${logo ? raw(html`<img src="${logo}" alt="" onerror="this.remove()" />`) : raw(icon("school"))}</span>`;
  };
  const cards = entries.map(({ department: d, building: b }, i) =>
    raw(html`<button class="department-card" data-action="department" data-index="${i}">
      ${raw(logoBox(d))}
      <span class="dept-code">${d.code}</span>
      <strong>${d.name}</strong>
      <small>${b ? `${b.shortName || b.name} · ชั้น ${d.floor}` : `ชั้น ${d.floor}`}</small>
      <span class="dept-link">ดูข้อมูลสาขา ${raw(icon("arrow"))}</span>
    </button>`));

  const open = state.openDepartment !== null ? entries[state.openDepartment] : null;
  const chips = (title, list) => (list?.length ? raw(html`<h3>${title}</h3><div class="room-chips">${list.map((s) => raw(html`<span>${s}</span>`))}</div>`) : "");
  const detail = open
    ? raw(html`<button class="ai-backdrop visible" data-action="department-close" aria-label="ปิดข้อมูลสาขา"></button>
      <section class="dept-detail" role="dialog" aria-label="${open.department.name}">
        <button class="card-close" data-action="department-close" aria-label="ปิด">${raw(icon("close"))}</button>
        ${raw(logoBox(open.department))}
        <h2>${open.department.name}</h2>
        <p>${open.department.description}</p>
        ${chips("ทักษะที่ได้", open.department.skills)}
        ${chips("อาชีพในอนาคต", open.department.careers)}
        ${chips("กิจกรรม", open.department.activities)}
        ${open.building
          ? raw(html`<button class="route-button" data-action="department-show" data-id="${open.building.id}">${raw(icon("pin"))} ดูที่ตั้ง ${open.building.shortName || open.building.name} ชั้น ${open.department.floor}</button>`)
          : ""}
      </section>`)
    : "";

  return html`<main class="page-shell content-page">
    <div class="page-title">
      <span class="title-icon mint">${raw(icon("school"))}</span>
      <div><span>เรียนรู้จากการลงมือทำ</span><h1>ค้นพบสาขาที่เหมาะกับคุณ</h1></div>
      <img class="section-mascot department-heading-mascot" src="/mascots/globe.webp" alt="" aria-hidden="true" />
    </div>
    <p class="page-intro">สำรวจหลักสูตรสายอาชีพที่ตอบโจทย์อนาคต พร้อมห้องปฏิบัติการและอุปกรณ์จริง</p>
    <div class="department-grid">${cards}</div>
    ${detail}
  </main>`;
}

/* ------------------------------------------------------------------ kiosk idle screen */

function attractHtml() {
  return html`<button type="button" class="attract" data-action="wake" aria-label="แตะหน้าจอเพื่อเริ่มใช้งาน">
    <img class="attract-mascot" src="/mascots/greeting.webp" alt="" />
    <div><h2>สวัสดีครับ ผมน้องปลาทู</h2><p>ผู้ช่วยนำทางและประชาสัมพันธ์ ${CAMPUS_OVERVIEW.name}</p></div>
    <span class="attract-tap">👆 แตะหน้าจอเพื่อเริ่มใช้งาน</span>
    <span class="attract-qr"><span class="qr qr-medium" data-qr="${phoneRouteUrl()}" role="img" aria-label="QR เปิดแอปน้องปลาทูบนมือถือ"></span>
      <span><strong>ใช้บนมือถือก็ได้</strong>สแกนเพื่อเปิดแอปน้องปลาทู นำทางด้วย GPS ได้ทั้งวิทยาลัย</span></span>
  </button>`;
}

/* ------------------------------------------------------------------ rendering */

function render() {
  const root = $("#root");
  root.dataset.theme = state.theme;
  const views = { home: homeHtml, news: newsHtml, departments: departmentsHtml };
  if (state.view !== "map") {
    map?.destroy();
    map = null;
  }
  $("#app").innerHTML = headerHtml() + (state.view === "map" ? mapShellHtml() : views[state.view]()) + chromeHtml();
  if (state.view === "map") mountMap();
  $("#attract").innerHTML = KIOSK && state.idle ? attractHtml() : "";
  void fillQrCodes(root);
}

/** Small updates that don't rebuild the screen (keeps the map and typing focus). */
function refresh() {
  if (state.view === "map") updateMap();
  else if (state.view === "home") {
    const stats = document.querySelectorAll(".kiosk-stats strong");
    if (stats[0]) stats[0].textContent = state.buildings.length;
    if (stats[1]) stats[1].textContent = collectDepartments().length;
  }
}

function go(view) {
  state.view = view;
  state.listOpen = false;
  state.openDepartment = null;
  render();
  window.scrollTo({ top: 0 });
}

function selectBuilding(id) {
  if (nav.state.targetId && nav.state.targetId !== id) nav.clear();
  state.selectedId = id;
  state.listOpen = false;
  refresh();
}

/* ------------------------------------------------------------------ phone GPS */

let watchId = null;
function startGpsWatch() {
  if (KIOSK || !state.gpsOn || !navigator.geolocation || watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(
    ({ coords }) => {
      state.gpsError = null;
      state.liveFix = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
      refresh();
    },
    (e) => {
      state.gpsError = e.code === e.PERMISSION_DENIED ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์" : null;
      refresh();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
}

function enableGps() {
  writeStore(GPS_OK_KEY, 1);
  state.gpsOn = true;
  // Tapping again (e.g. after allowing location in the browser) starts a fresh watch.
  if (watchId !== null && (state.gpsError || !state.liveFix)) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    state.gpsError = null;
  }
  startGpsWatch();
  refresh();
}

/** Phone: GPS on, plan, then live turn-by-turn as soon as the route is ready. Kiosk: just show the route. */
let pendingLive = false;
function startNavigation(id) {
  state.selectedId = id;
  if (state.view !== "map") go("map");
  if (KIOSK) {
    void nav.routeTo(id);
    return;
  }
  enableGps();
  pendingLive = true;
  void nav.routeTo(id);
}

// Keep the screen on while navigating (Android Chrome / recent Safari).
let wakeLock = null;
async function syncWakeLock(active) {
  if (!("wakeLock" in navigator)) return;
  if (active && !wakeLock) wakeLock = await navigator.wakeLock.request("screen").catch(() => null);
  if (!active && wakeLock) {
    void wakeLock.release().catch(() => undefined);
    wakeLock = null;
  }
}

nav.onChange((s) => {
  if (pendingLive && s.status === "ready" && s.route) {
    pendingLive = false;
    nav.startLive();
  }
  if (s.status === "error") pendingLive = false;
  void syncWakeLock(s.live);
  refresh();
});

/* ------------------------------------------------------------------ events */

async function share() {
  const b = selected();
  if (!b) return;
  const url = `${window.location.origin}/app?place=${b.id}`;
  try {
    if (navigator.share) await navigator.share({ title: `${b.name} · น้องปลาทู`, url });
    else {
      await navigator.clipboard?.writeText(url);
      toast("คัดลอกลิงก์แล้ว");
    }
  } catch {
    /* cancelled */
  }
}

const actions = {
  go: (el) => el.dataset.view && go(el.dataset.view),
  theme: () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", state.theme);
    render();
  },
  chat: () => openChat(false),
  voice: () => openChat(true),
  filter: (el) => {
    state.filter = el.dataset.filter;
    refresh();
  },
  select: (el) => selectBuilding(el.dataset.id),
  "card-close": () => {
    state.selectedId = null;
    refresh();
  },
  "list-open": () => {
    state.listOpen = true;
    refresh();
  },
  "list-close": () => {
    state.listOpen = false;
    refresh();
  },
  "search-clear": () => setQuery(""),
  "gps-on": () => enableGps(),
  route: () => state.selectedId && startNavigation(state.selectedId),
  share: () => void share(),
  "nav-clear": () => nav.clear(),
  "nav-retry": () => nav.state.targetId && void nav.routeTo(nav.state.targetId),
  "nav-start": () => nav.startLive(),
  "nav-stop": () => nav.stopLive(),
  "nav-voice": () => nav.setVoice(!nav.voice),
  department: (el) => {
    state.openDepartment = Number(el.dataset.index);
    render();
  },
  "department-close": () => {
    state.openDepartment = null;
    render();
  },
  "department-show": (el) => {
    if (nav.state.targetId && nav.state.targetId !== el.dataset.id) nav.clear();
    state.selectedId = el.dataset.id;
    go("map");
  },
  install: async () => {
    const prompt = state.installPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    state.installPrompt = null;
    actions["install-dismiss"]();
  },
  "install-dismiss": () => {
    writeStore(INSTALL_DISMISSED_KEY, 1);
    state.installDismissed = true;
    $(".install-card")?.remove();
  },
  wake: () => wake(),
  "map-mode": (el) => el.dataset.mode !== mapMode && setMapMode(el.dataset.mode),
};

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || !actions[el.dataset.action]) return;
  event.preventDefault();
  actions[el.dataset.action](el);
});

function setQuery(value) {
  state.query = value;
  for (const input of document.querySelectorAll("#place-search, #map-search")) if (input.value !== value) input.value = value;
  const clear = $("[data-action=search-clear]");
  if (clear) clear.hidden = !value;
  if (state.selectedId && value) state.selectedId = null;
  refresh();
}

document.addEventListener("input", (event) => {
  if (event.target.id === "place-search" || event.target.id === "map-search") {
    if (event.target.id === "map-search") state.listOpen = true;
    setQuery(event.target.value);
  }
});
document.addEventListener("focusin", (event) => {
  if (event.target.id === "map-search") {
    state.listOpen = true;
    refresh();
  }
});

window.addEventListener("online", () => {
  state.online = true;
  void reloadData();
  $(".online-status")?.replaceWith(htmlToNode(`<span class="online-status"><i></i> ออนไลน์</span>`));
});
window.addEventListener("offline", () => {
  state.online = false;
  $(".online-status")?.replaceWith(htmlToNode(`<span class="online-status offline"><i></i> ออฟไลน์</span>`));
});
const htmlToNode = (markup) => document.createRange().createContextualFragment(markup);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  if (state.view === "home") render();
});

/* ------------------------------------------------------------------ kiosk idle reset */

let idleTimer = null;
function armIdle() {
  if (!KIOSK) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(goIdle, IDLE_MS);
}
function goIdle() {
  // Wipe the visitor's session for the next person.
  nav.clear();
  window.dispatchEvent(new Event("nongplatoo:reset"));
  Object.assign(state, { idle: true, selectedId: null, query: "", filter: "ทั้งหมด", listOpen: false, openDepartment: null, view: "home" });
  render();
  window.scrollTo({ top: 0 });
  void reloadData(); // fresh news / admin edits for the next visitor
}
function wake() {
  state.idle = false;
  $("#attract").innerHTML = "";
  armIdle();
}
if (KIOSK) {
  // The chat sends this while listening / thinking / speaking, so a voice conversation isn't cut off.
  window.addEventListener("nongplatoo:activity", () => !state.idle && armIdle());
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(type, () => (state.idle ? null : armIdle()), { passive: true });
  }
}

/* ------------------------------------------------------------------ start */

/** Offline support (/sw.js). Not on localhost, so development always shows fresh files. */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) return;
  navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
  // A new service worker took over (e.g. after a deploy) → reload once so the page isn't a stale copy.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

/**
 * Buildings, news, kiosk spot and walkways from the server (or the saved copy when offline).
 * Runs at start, each time the kiosk resets for the next visitor, and when the internet
 * comes back — so a kiosk left on for days still shows new news and admin edits.
 */
let defaultNetwork = null;
async function loadData() {
  defaultNetwork ??= await fetch(DEFAULT_WALK_NETWORK_URL).then((r) => r.json()).catch(() => null);
  const fallbackNetwork = defaultNetwork ?? { nodes: [], edges: [] };
  const [buildings, news, settings, network] = await Promise.all([
    loadBuildings(CAMPUS_BUILDINGS),
    loadNews(),
    KIOSK ? loadSettings() : Promise.resolve(null),
    loadWalkNetwork(fallbackNetwork),
  ]);
  state.buildings = buildings?.length ? buildings : CAMPUS_BUILDINGS;
  state.news = news ?? [];
  state.kiosk = KIOSK ? settings?.kiosk ?? null : null;
  nav.setNetwork(network ?? fallbackNetwork);
  nav.setFixedStart(state.kiosk);
}

/** Reload data in the background; redraw only if nobody is in the middle of something. */
async function reloadData() {
  await loadData().catch(() => undefined);
  if (state.idle || (state.view !== "map" && state.openDepartment === null)) render();
  else refresh();
}

async function start() {
  render();
  // The chat panel lives outside #app, so re-drawing the screens never resets the conversation.
  createChat({ atKiosk: KIOSK, onShowRoute: (id) => startNavigation(id), onOpenMap: () => go("map") });
  armIdle();
  startGpsWatch();
  if (params.get("voice") === "1") setTimeout(() => openChat(true), 600);

  registerServiceWorker();
  // Free hosting (Render) sleeps after 15 idle minutes; a page left open pings it every 10.
  setInterval(() => fetch("/api/health", { cache: "no-store" }).catch(() => undefined), 10 * 60 * 1000);

  await loadData();
  render();

  // Deep link from the kiosk QR: /app?place=<id>&go=1 → straight into navigation.
  if (!KIOSK && params.get("go") === "1" && params.get("place")) startNavigation(params.get("place"));
}

void start();
