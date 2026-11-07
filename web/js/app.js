// Nong Pla Too Ontour — kiosk ( / ) and phone app ( /app ) in plain HTML/CSS/JS.
// The page's <body data-mode="kiosk|phone"> picks the behaviour:
//   kiosk: routes start at the kiosk's spot, QR hand-off to a phone, resets after 90 s idle
//   phone: GPS distance, live turn-by-turn navigation, deep links from the kiosk QR
// Same screens for both: home, map, news, departments (the Figma design).

import { CAMPUS_BUILDINGS, CAMPUS_CATEGORIES, CAMPUS_OVERVIEW, DEFAULT_DEPARTMENTS } from "/shared/campus.js";
import { PROGRAMMES, PROGRAMMES_AS_OF } from "/shared/collegeFacts.js";
import { DEPARTMENT_GROUPS, DEPARTMENT_QUIZ, suggestDepartments, withDepartmentInfo } from "/shared/departmentInfo.js";
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
  deptGroup: "", // departments page filter ("" = all)
  deptQuiz: null, // { step, answers } while the "help me choose" quiz is open
  newsKind: "", // news page filter ("" = all)
  routeCollapsed: false, // route card shrunk to one line so the map shows
  openNews: null, // kiosk: index of the story shown with its QR code
  installPrompt: null,
  installDismissed: readStore(INSTALL_DISMISSED_KEY) === 1 || window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true,
};

const nav = new CampusNavigation({ getBuildings: () => state.buildings, network: { nodes: [], edges: [] } });
let map = null; // CampusMap while the map screen is open

/* ------------------------------------------------------------------ data helpers */

const departmentsOf = (b) => (b.departments ?? []).filter((d) => d.floor <= b.floors);
/** A department's logo: uploaded in admin, else the one stored with the app (matched by name). */
const logoOf = (d) => d.logo || withDepartmentInfo(d).logo;
/** A building's logo: the logo of the first department inside it that has one. */
/** Emblems made for buildings that are not a department (offices, shared spaces), by building id. */
const BUILDING_IMAGES = {
  auditorium: "/images/buildings/auditorium.webp",
  "activity-building": "/images/buildings/activity-building.webp",
};
const buildingLogo = (b) => BUILDING_IMAGES[b.id] ?? departmentsOf(b).map(logoOf).find(Boolean) ?? null;
/** Buildings without a department logo (offices, shared spaces) get an icon on their map pin. */
const BUILDING_ICONS = {
  "general-subjects": "📚",
  "student-development": "🌱",
  "building-85": "🏛️",
  "ivec-central-5": "🏢",
  auditorium: "🍽️",
  "activity-building": "🎭",
  "building-1": "🏫",
  "parking-1": "🅿️",
  "personnel-registration": "📋",
  "supplies-dept": "📦",
  "discipline-dept": "🛡️",
  "director-office": "👔",
};
const pinColor = (b) => departmentsOf(b)[0]?.accent ?? b.accent;
const numberOf = (id) => state.buildings.findIndex((b) => b.id === id) + 1;
const selected = () => state.buildings.find((b) => b.id === state.selectedId) ?? null;

/** Every department from the admin data, once each, with the building it's in. */
function collectDepartments() {
  const seen = new Map();
  for (const building of state.buildings) {
    for (const department of departmentsOf(building)) {
      // Codes ("01", "02"…) are only unique inside one building, so match by name.
      const key = (department.name || department.code || "").trim();
      if (key && !seen.has(key)) seen.set(key, { department: withDepartmentInfo(department), building });
    }
  }
  // Offices (ฝ่ายวิชาการ, งานทะเบียน…) are rooms too; show only real departments when there are any.
  const real = [...seen.values()].filter(({ department }) => /^สาขา/.test(String(department.name).trim()));
  if (real.length) return real;
  return seen.size ? [...seen.values()] : DEFAULT_DEPARTMENTS.map((department) => ({ department }));
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
  // The home screen already has the mic and the "ถามด้วยเสียง" card, so no floating button there.
  const floating = state.view === "home"
    ? ""
    : html`<button class="floating-ai" data-action="chat" aria-label="เปิดผู้ช่วยน้องปลาทู">
      <img class="floating-platoo" src="/mascots/jump.webp" alt="" aria-hidden="true" />
      <span class="floating-ai-copy"><strong>ถามน้องปลาทู</strong><small>แตะเพื่อเริ่มถาม</small></span>
    </button>`;
  return html`${raw(floating)}
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
        <span>เลือกเมนูที่ต้องการ หรือกดไมค์เพื่อพูดกับผมได้เลยครับ</span>
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
  if (nav.state.status !== "idle")
    return html`<article class="building-card route-card ${state.routeCollapsed ? "collapsed" : ""}">
      <button type="button" class="route-collapse" data-action="route-collapse" aria-label="${state.routeCollapsed ? "ขยายรายละเอียดเส้นทาง" : "ย่อเพื่อดูแผนที่"}">${state.routeCollapsed ? "ขยาย ▲" : "ย่อ ▼"}</button>
      <div class="route-panel-wrap">${raw(routePanelHtml(nav))}</div></article>`;
  const depts = departmentsOf(b);
  // Built-in data repeats the same names in the description, departments and rooms — show each once.
  // "· 2 ห้อง" on a hall or office says nothing useful, so a count that small is dropped.
  let description = String(b.description ?? "").replace(/\s*·\s*[12]\s*(ห้อง|หลัง)\s*$/, "");
  // "สาขาวิชาช่างยนต์ · 18 ห้อง" under the heading "สาขาวิชาช่างยนต์" → just "18 ห้อง".
  if (description.startsWith(b.name)) description = description.slice(b.name.length).replace(/^\s*[·,]\s*/, "");
  const deptNames = depts.map((d) => d.name).filter((n) => n !== b.name && !description.includes(n));
  const shown = new Set([b.name, ...depts.map((d) => d.name)]);
  const rooms = (b.floorsDetail ?? []).flatMap((f) => f.rooms).filter((r) => !shown.has(r) && !description.includes(r)).slice(0, 10);
  const walk = KIOSK ? null : walkEstimate();
  const walkText = walk
    ? `🚶 เดิน ${formatDistance(walk.distance)} · ~${walk.minutes} นาที${walk.offCampus ? " (จากนอกวิทยาลัย)" : ""}`
    : here() ? "กำลังคำนวณระยะทาง…" : "เปิดตำแหน่งเพื่อดูระยะทาง";
  const routeLabel = KIOSK ? (state.kiosk && !state.kiosk.fallback ? "ดูเส้นทางจากตู้นี้" : "ดูเส้นทาง") : "เริ่มนำทาง";
  return html`<article class="building-card">
    <button class="card-close" data-action="card-close" aria-label="ปิดรายละเอียด">${raw(icon("close"))}</button>
    <div class="building-card-head">
      ${buildingLogo(b) ? raw(html`<img class="building-logo" src="${buildingLogo(b)}" alt="" />`) : raw(html`<span class="place-number" style="background:${pinColor(b)}">${numberOf(b.id)}</span>`)}
      <div><span class="building-category">${b.category}</span><h2>${b.name}</h2></div>
    </div>
    ${description && description !== b.name ? raw(html`<p>${description}</p>`) : ""}
    <div class="building-meta">
      <span>${raw(icon("building"))} ${b.floors} ชั้น</span>
      ${deptNames.length ? raw(html`<span>${raw(icon("school"))} ${deptNames.join(", ")}</span>`) : ""}
    </div>
    ${rooms.length ? raw(html`<div class="room-chips">${rooms.map((r) => raw(html`<span>${r}</span>`))}</div>`) : ""}
    ${!KIOSK ? raw(html`<p class="walk-line">${walkText}</p>`) : ""}
    <div class="card-actions">
      ${hasCoords(b)
        ? raw(html`<button class="route-button" data-action="route">${raw(icon("route"))} ${routeLabel}</button>`)
        : raw(html`<a class="route-button" href="${walkingDeepLink(b)}" target="_blank" rel="noreferrer">${raw(icon("route"))} นำทาง (Google Maps)</a>`)}
      ${!KIOSK ? raw(html`<a class="card-icon-button maps-link" href="${walkingDeepLink(b)}" target="_blank" rel="noreferrer" aria-label="เปิดใน Google Maps">${raw(icon("map"))} Google Maps</a>`) : ""}
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
  const logo = buildingLogo(b);
  const head = logo
    ? `<b class="has-logo"><i><img src="${esc(logo)}" alt="" /></i><em>${numberOf(b.id)}</em></b>`
    : BUILDING_ICONS[b.id]
      ? `<b class="has-icon"><i>${BUILDING_ICONS[b.id]}</i><em>${numberOf(b.id)}</em></b>`
      : `<b><i>${numberOf(b.id)}</i></b>`;
  return `<div class="leaflet-pin ${active ? "active" : ""}" style="--pin:${esc(pinColor(b))}">${head}<small>${esc(b.shortName || b.name)}</small></div>`;
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
    // How much of the map the open card covers, so a route is framed beside it (wide screens) or above it (phones).
    routeCover: () => {
      const card = document.querySelector("#building-card-slot .building-card");
      const host = document.querySelector("#map-canvas");
      if (!card || !host) return { left: 0, bottom: 0 };
      const c = card.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      return c.width > h.width * 0.6 ? { left: 0, bottom: h.bottom - c.top } : { left: c.right - h.left, bottom: 0 };
    },
    markerSize: [120, 72],
    userLabel: KIOSK && state.kiosk ? (state.kiosk.fallback ? state.kiosk.name : "คุณอยู่ที่นี่") : undefined,
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
  // Kiosk: no banner — it only repeats the first step already listed in the route card.
  $("#nav-banner").innerHTML = navigating && !KIOSK ? navBannerHtml(nav) : "";
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

/** What a story is about, from words in its title — the college site tags every story the same. */
const NEWS_KINDS = [
  { id: "apply", label: "รับสมัคร", emoji: "📝", color: "#2f7fc1", match: /รับสมัคร|สมัครเรียน|รับนักเรียน|โควตา/ },
  { id: "award", label: "รางวัล", emoji: "🏆", color: "#c0892b", match: /รางวัล|คว้า|เกียรติบัตร|เชิดชู|ชนะเลิศ|โล่/ },
  { id: "notice", label: "ประกาศ", emoji: "📢", color: "#d0604a", match: /ประกาศ|แจ้ง|กำหนดการ|หยุด/ },
  { id: "activity", label: "กิจกรรม", emoji: "🎉", color: "#138b8f", match: /./ },
];
const newsKind = (item) => NEWS_KINDS.find((k) => k.match.test(item.title ?? "")) ?? NEWS_KINDS[NEWS_KINDS.length - 1];

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "19 ต.ค. 69" (Buddhist year) → Date, or null. */
function parseThaiDate(text) {
  const m = String(text ?? "").match(/(\d{1,2})\s+([ก-๙.]+)\s+(\d{2,4})/);
  if (!m) return null;
  const month = THAI_MONTHS.indexOf(m[2].endsWith(".") ? m[2] : `${m[2]}.`);
  if (month < 0) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2500;
  return new Date(year - 543, month, Number(m[1]));
}
/** Published within the last 7 days. */
const isFreshNews = (item) => {
  const d = parseThaiDate(item.date);
  return Boolean(d) && Date.now() - d.getTime() < 7 * 86400000 && d.getTime() <= Date.now() + 86400000;
};
/** "ข่าวจากเว็บวิทยาลัย" is on every story, so it is not shown. */
const newsWhen = (item) => [item.date, item.time && item.time !== "ข่าวจากเว็บวิทยาลัย" ? item.time : ""].filter(Boolean).join(" · ");

/** Featured stories rotate every 7 s while the news page is open. */
let featuredTimer = null;
function startFeaturedRotation() {
  clearInterval(featuredTimer);
  featuredTimer = null;
  const slides = [...document.querySelectorAll(".featured-slide")];
  if (slides.length < 2) return;
  const dots = [...document.querySelectorAll(".featured-dots button")];
  let index = 0;
  const show = (i) => {
    index = i;
    slides.forEach((s, n) => s.classList.toggle("active", n === i));
    dots.forEach((b, n) => b.classList.toggle("active", n === i));
  };
  featuredTimer = setInterval(() => {
    if (!document.body.contains(slides[0])) {
      clearInterval(featuredTimer);
      return;
    }
    show((index + 1) % slides.length);
  }, 7000);
  dots.forEach((b, n) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      show(n);
    }),
  );
}

function newsHtml() {
  // Kiosk: a story opens a QR code to read it on a phone, so visitors don't leave the kiosk for another website.
  const link = (item, cls, inner) =>
    !item.link
      ? html`<article class="${cls}">${raw(inner)}</article>`
      : KIOSK
        ? html`<button type="button" class="${cls}" data-action="news-open" data-index="${state.news.indexOf(item)}">${raw(inner)}</button>`
        : html`<a class="${cls}" href="${item.link}" target="_blank" rel="noreferrer">${raw(inner)}</a>`;
  const badges = (item) => {
    const k = newsKind(item);
    return html`<span class="news-badges"><span class="news-kind" style="--kind:${k.color}">${k.emoji} ${k.label}</span>${isFreshNews(item) ? raw('<span class="news-new">ใหม่</span>') : ""}</span>`;
  };

  // Admissions and announcements are documents (their pictures are just file covers), so they
  // get their own short list at the top; the photo stories fill the featured spot and the grid.
  const kindsPresent = NEWS_KINDS.filter((k) => state.news.some((n) => newsKind(n).id === k.id));
  const isNotice = (n) => ["apply", "notice"].includes(newsKind(n).id);
  const shown = state.news.filter((n) => !state.newsKind || newsKind(n).id === state.newsKind);
  const notices = shown.filter(isNotice);
  const list = shown.filter((n) => !isNotice(n));

  // Up to 3 stories rotate in the featured spot; keep at least 3 for the grid when there are few.
  const featuredCount = list.length >= 6 ? 3 : list.length ? 1 : 0;
  const featuredItems = list.slice(0, featuredCount);
  const rest = list.slice(featuredCount);
  const noticeList = notices.length
    ? html`<section class="notice-list" aria-label="ประกาศจากวิทยาลัย">
        <h2>📢 ประกาศจากวิทยาลัย</h2>
        ${notices.map((item) =>
          raw(link(
            item,
            "notice-row",
            html`<span class="notice-date">${item.date || ""}</span><strong>${item.title}</strong>${isFreshNews(item) ? raw('<span class="news-new">ใหม่</span>') : ""}${raw(icon("arrow"))}`,
          )))}
      </section>`
    : "";
  const featuredHtml = featuredItems.length
    ? html`<div class="featured-carousel">
        ${featuredItems.map((item, i) =>
          raw(link(
            item,
            `featured-news featured-slide ${i === 0 ? "active" : ""}`,
            // Picture on top, then the badges, title and the first lines of the story.
            html`${item.image
              ? raw(html`<span class="featured-photo"><img src="${item.image}" alt="" /></span>`)
              : raw('<span class="featured-photo no-photo"><img src="/mascots/jump.webp" alt="" aria-hidden="true" /></span>')}
            <span class="featured-copy">
              ${raw(badges(item))}
              <h2>${item.title}</h2>
              ${item.excerpt ? raw(html`<p class="news-excerpt">${item.excerpt}</p>`) : ""}
              ${newsWhen(item) ? raw(html`<small class="news-when">${newsWhen(item)}</small>`) : ""}
            </span>`,
          )))}
        ${featuredItems.length > 1
          ? raw(html`<div class="featured-dots">${featuredItems.map((_, i) => raw(html`<button type="button" class="${i === 0 ? "active" : ""}" aria-label="ข่าวเด่น ${i + 1}"></button>`))}</div>`)
          : ""}
      </div>`
    : notices.length
      ? ""
      : html`<div class="empty-state">ยังไม่มีข่าวในตอนนี้ — ลองเปิดหน้านี้ใหม่อีกครั้งภายหลังครับ</div>`;

  const cards = rest.map((item) =>
    raw(link(
      item,
      "news-card news-card-photo",
      html`<span class="news-thumb">${item.image
        ? raw(html`<img src="${item.image}" alt="" loading="lazy" />`)
        : raw('<img class="news-thumb-mascot" src="/mascots/point.webp" alt="" aria-hidden="true" />')}</span>
      <span class="news-card-body">${raw(badges(item))}<h3>${item.title}</h3>${item.excerpt ? raw(html`<p class="news-excerpt">${item.excerpt}</p>`) : ""}${newsWhen(item) ? raw(html`<small class="news-when">${newsWhen(item)}</small>`) : ""}</span>`,
    )));

  const latest = state.news.map((n) => parseThaiDate(n.date)).filter(Boolean).sort((a, b) => b - a)[0];
  const filterBar = kindsPresent.length > 1
    ? raw(html`<div class="dept-filters news-filters">
        <button class="${state.newsKind ? "" : "active"}" data-action="news-kind" data-kind="">ทั้งหมด <b>${state.news.length}</b></button>
        ${kindsPresent.map((k) => raw(html`<button class="${state.newsKind === k.id ? "active" : ""}" data-action="news-kind" data-kind="${k.id}" style="--dept:${k.color}">${k.emoji} ${k.label} <b>${state.news.filter((n) => newsKind(n).id === k.id).length}</b></button>`))}
      </div>`)
    : "";

  const opened = KIOSK && state.openNews !== null ? state.news[state.openNews] : null;
  const newsDialog = opened
    ? html`<button class="ai-backdrop visible" data-action="news-close" aria-label="ปิดข่าว"></button>
      <section class="dept-detail news-detail" role="dialog" aria-label="${opened.title}">
        <button class="card-close" data-action="news-close" aria-label="ปิด">${raw(icon("close"))}</button>
        ${opened.image ? raw(html`<img class="news-detail-photo" src="${opened.image}" alt="" />`) : ""}
        ${raw(badges(opened))}
        <h2>${opened.title}</h2>
        ${newsWhen(opened) ? raw(html`<p>${newsWhen(opened)}</p>`) : ""}
        ${opened.excerpt ? raw(html`<p>${opened.excerpt}</p>`) : ""}
        <div class="card-qr"><div class="qr qr-small" data-qr="${opened.link}" role="img" aria-label="QR อ่านข่าวบนมือถือ"></div>
          <p><strong>อ่านข่าวนี้บนมือถือ</strong>สแกนด้วยกล้องมือถือเพื่อเปิดข่าวเต็มบนเว็บวิทยาลัย</p></div>
      </section>`
    : "";

  return html`<main class="page-shell content-page">
    <div class="page-title">
      <span class="title-icon yellow">${raw(icon("news"))}</span>
      <div><span>อัปเดตจากวิทยาลัย</span><h1>ข่าวสารและกิจกรรม</h1></div>
    </div>
    ${latest ? raw(html`<p class="page-intro">ข่าวล่าสุดเมื่อ ${latest.getDate()} ${THAI_MONTHS[latest.getMonth()]} ${String(latest.getFullYear() + 543).slice(-2)}</p>`) : ""}
    ${filterBar}
    ${raw(noticeList)}
    ${raw(featuredHtml)}
    ${cards.length ? raw(html`<div class="news-grid news-grid-photo">${cards}</div>`) : ""}
    ${KIOSK
      ? raw(html`<div class="card-qr news-more-qr"><div class="qr qr-small" data-qr="${COLLEGE_NEWS_URL}" role="img" aria-label="QR ข่าวทั้งหมด"></div><p><strong>ดูข่าวทั้งหมดบนมือถือ</strong>สแกนเพื่อเปิดหน้าข่าวของเว็บวิทยาลัย</p></div>`)
      : raw(html`<a class="news-more" href="${COLLEGE_NEWS_URL}" target="_blank" rel="noreferrer">ดูข่าวทั้งหมดบนเว็บวิทยาลัย ${raw(icon("arrow"))}</a>`)}
    ${raw(newsDialog)}
  </main>`;
}

/* ------------------------------------------------------------------ departments */

/** The built-in data lists every department on floor 1 — only say a floor once real per-floor data exists. */
const floorKnown = (d, b) => Boolean(d?.floor) && ((b?.floorsDetail?.length ?? 0) > 1 || d.floor > 1);

/** "Help me choose": two questions, then up to three suggested departments. */
function quizHtml(entries, logoBox) {
  const quiz = state.deptQuiz;
  if (!quiz) return "";
  const done = quiz.step >= DEPARTMENT_QUIZ.length;
  const q = DEPARTMENT_QUIZ[quiz.step];
  const picks = done ? suggestDepartments(entries.map((e, index) => ({ ...e, index })), quiz.answers) : [];
  const body = done
    ? html`<h2>สาขาที่น่าจะเหมาะกับคุณ</h2>
      ${picks.length
        ? raw(html`<div class="quiz-results">${picks.map((e) => raw(html`<button class="quiz-result" data-action="quiz-pick" data-index="${e.index}">
            ${raw(logoBox(e.department))}<span><strong>${e.department.name}</strong><small>${(e.department.careers ?? []).slice(0, 3).join(" · ")}</small></span>${raw(icon("arrow"))}
          </button>`))}</div>`)
        : raw(html`<p>ยังไม่มีสาขาที่ตรงกับคำตอบ ลองดูสาขาทั้งหมด หรือถามน้องปลาทูได้เลยครับ</p>`)}
      <div class="quiz-actions"><button class="route-retry alt" data-action="quiz-restart">ทำใหม่</button><button class="route-retry" data-action="quiz-close">ดูสาขาทั้งหมด</button></div>`
    : html`<span class="quiz-step">ข้อ ${quiz.step + 1} / ${DEPARTMENT_QUIZ.length}</span>
      <h2>${q.question}</h2>
      <div class="quiz-options">${q.options.map((o) => raw(html`<button class="quiz-option" data-action="quiz-answer" data-key="${q.key}" data-value="${o.id}"><span aria-hidden="true">${o.icon}</span>${o.label}</button>`))}</div>`;
  return html`<button class="ai-backdrop visible" data-action="quiz-close" aria-label="ปิด"></button>
    <section class="dept-detail dept-quiz" role="dialog" aria-label="ช่วยเลือกสาขา">
      <button class="card-close" data-action="quiz-close" aria-label="ปิด">${raw(icon("close"))}</button>
      <img class="quiz-mascot" src="/mascots/${done ? "jump" : "search"}.webp" alt="" aria-hidden="true" />
      ${raw(body)}
    </section>`;
}

/** "ปวช." / "ปวส." badges: which levels the college offers for this department. */
function levelBadges(d) {
  const levels = Object.entries(d.programmes ?? {}).filter(([, names]) => names.length).map(([level]) => level);
  return levels.length ? html`<span class="dept-levels">${levels.map((l) => raw(html`<span>${l}</span>`))}</span>` : "";
}

/** The official programme names for this department, per level, and its career group. */
function programmeBlock(d) {
  const rows = Object.entries(d.programmes ?? {}).filter(([, names]) => names.length);
  if (!rows.length) return "";
  const who = { "ปวช.": "จบ ม.3", "ปวส.": "จบ ม.6 / ปวช." };
  return html`<h3 class="dept-section"><span aria-hidden="true">📜</span>เปิดสอนระดับไหน</h3>
    <dl class="dept-programmes">${rows.map(([level, names]) => raw(html`<dt>${level}<small>${who[level] ?? ""}</small></dt><dd>${names.join(", ")}</dd>`))}</dl>
    ${d.careerGroup ? raw(html`<p class="dept-career-group">กลุ่มอาชีพ: ${d.careerGroup}</p>`) : ""}`;
}

/** The college's full official programme list (some programmes have no building on the map). */
function officialProgrammesHtml() {
  const table = (level, rows) => html`<div class="programme-table">
      <h3>${level === "ปวช." ? "ระดับ ปวช. (จบ ม.3)" : "ระดับ ปวส. (จบ ม.6 / ปวช.)"} · ${rows.length} สาขา</h3>
      <ul>${rows.map(([type, name, career]) => raw(html`<li><strong>${name}</strong><small>${type} · ${career}</small></li>`))}</ul>
    </div>`;
  return html`<section class="official-programmes">
      <h2>หลักสูตรที่เปิดสอนทั้งหมด</h2>
      <p>จากรายงานหลักสูตรที่เปิดสอนของวิทยาลัย (ข้อมูล ณ ${PROGRAMMES_AS_OF})</p>
      <div class="programme-tables">${Object.entries(PROGRAMMES).map(([level, rows]) => raw(table(level, rows)))}</div>
    </section>`;
}

function departmentsHtml() {
  const entries = collectDepartments();
  const groupOf = (d) => DEPARTMENT_GROUPS.find((g) => g.id === d.group);
  const accentOf = (d) => groupOf(d)?.accent ?? d.accent ?? "#3c8f8d";
  const logoBox = (d) => {
    const logo = logoOf(d);
    const inner = logo
      ? raw(html`<img src="${logo}" alt="" onerror="this.remove()" />`)
      : d.icon ? raw(html`<span class="dept-emoji" aria-hidden="true">${d.icon}</span>`) : raw(icon("school"));
    return html`<span class="department-icon" style="background:${accentOf(d)}1f;color:${accentOf(d)}">${inner}</span>`;
  };
  // First sentence of the description, for the card.
  const summary = (d) => String(d.description ?? "").split(/ ฝึก| เน้น/)[0];
  const groupIds = new Set(entries.map((e) => e.department.group).filter(Boolean));
  const groups = DEPARTMENT_GROUPS.filter((g) => groupIds.has(g.id));
  const visible = entries
    .map((entry, index) => ({ ...entry, index }))
    .filter((e) => !state.deptGroup || e.department.group === state.deptGroup);

  const card = ({ department: d, building: b, index }) =>
    raw(html`<button class="department-card" data-action="department" data-index="${index}" style="--dept:${accentOf(d)}">
      ${raw(logoBox(d))}
      <strong>${d.name.replace(/^สาขาวิชา|^สาขา/, "")}</strong>
      ${levelBadges(d) ? raw(levelBadges(d)) : ""}
      ${summary(d) ? raw(html`<p class="dept-summary">${summary(d)}</p>`) : ""}
      ${d.careers?.length ? raw(html`<span class="dept-careers">${d.careers.slice(0, 2).map((c) => raw(html`<span>${c}</span>`))}</span>`) : ""}
      <span class="dept-foot">
        ${b ? raw(html`<small>📍 ${[b.shortName || b.name, floorKnown(d, b) ? `ชั้น ${d.floor}` : ""].filter(Boolean).join(" · ")}</small>`) : raw("<small></small>")}
        <span class="dept-link">ดูข้อมูล ${raw(icon("arrow"))}</span>
      </span>
    </button>`);

  const filterBar = groups.length > 1
    ? raw(html`<div class="dept-filters" role="tablist" aria-label="กลุ่มสาขา">
        <button class="${state.deptGroup ? "" : "active"}" data-action="dept-group" data-group="">ทั้งหมด <b>${entries.length}</b></button>
        ${groups.map((g) => raw(html`<button class="${state.deptGroup === g.id ? "active" : ""}" data-action="dept-group" data-group="${g.id}" style="--dept:${g.accent}">${g.label} <b>${entries.filter((e) => e.department.group === g.id).length}</b></button>`))}
      </div>`)
    : "";

  const quizBox = quizHtml(entries, logoBox);

  const open = state.openDepartment !== null ? entries[state.openDepartment] : null;
  // Each section: an icon + a heading bigger than its content, so the eye knows what to read first.
  const chips = (emoji, title, list, cls = "") =>
    list?.length
      ? raw(html`<h3 class="dept-section"><span aria-hidden="true">${emoji}</span>${title}</h3><div class="room-chips ${cls}">${list.map((s) => raw(html`<span>${s}</span>`))}</div>`)
      : "";
  const detail = open
    ? raw(html`<button class="ai-backdrop visible" data-action="department-close" aria-label="ปิดข้อมูลสาขา"></button>
      <section class="dept-detail" role="dialog" aria-label="${open.department.name}" style="--dept:${accentOf(open.department)}">
        <button class="card-close" data-action="department-close" aria-label="ปิด">${raw(icon("close"))}</button>
        ${raw(logoBox(open.department))}
        ${groupOf(open.department) ? raw(html`<span class="dept-group-tag" style="--dept:${accentOf(open.department)}">${groupOf(open.department).label}</span>`) : ""}
        <h2>${open.department.name}</h2>
        ${open.department.description ? raw(html`<p class="dept-description">${open.department.description}</p>`) : ""}
        ${chips("💼", "จบแล้วทำงานอะไรได้", open.department.careers, "career-chips")}
        ${chips("🛠️", "ทักษะที่ได้", open.department.skills)}
        ${open.department.programmes ? raw(programmeBlock(open.department)) : ""}
        ${chips("🎉", "กิจกรรม", open.department.activities)}
        ${open.building
          ? raw(html`<button class="route-button" data-action="department-show" data-id="${open.building.id}">${raw(icon("pin"))} ดูที่ตั้ง ${open.building.shortName || open.building.name}${floorKnown(open.department, open.building) ? ` ชั้น ${open.department.floor}` : ""}</button>`)
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
    <button class="dept-quiz-cta" data-action="dept-quiz">
      <img src="/mascots/search.webp" alt="" aria-hidden="true" />
      <span><strong>ยังไม่รู้จะเรียนสาขาไหน?</strong><small>ตอบ 2 ข้อ ให้น้องปลาทูช่วยแนะนำสาขาที่เหมาะกับคุณ</small></span>
      ${raw(icon("arrow"))}
    </button>
    ${filterBar}
    <div class="department-grid">${visible.map(card)}</div>
    ${raw(officialProgrammesHtml())}
    ${raw(quizBox)}
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
  if (state.view === "news") startFeaturedRotation();
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
  "nav-clear": () => {
    state.routeCollapsed = false;
    nav.clear();
  },
  "route-collapse": () => {
    state.routeCollapsed = !state.routeCollapsed;
    updateMap();
  },
  "nav-retry": () => nav.state.targetId && void nav.routeTo(nav.state.targetId),
  "nav-from-gate": () => nav.state.targetId && void nav.routeFromGate(nav.state.targetId),
  "nav-start": () => nav.startLive(),
  "nav-stop": () => nav.stopLive(),
  "nav-voice": () => nav.setVoice(!nav.voice),
  department: (el) => {
    state.openDepartment = Number(el.dataset.index);
    render();
  },
  "news-open": (el) => {
    state.openNews = Number(el.dataset.index);
    render();
  },
  "news-kind": (el) => {
    state.newsKind = el.dataset.kind ?? "";
    render();
  },
  "news-close": () => {
    state.openNews = null;
    render();
  },
  "dept-group": (el) => {
    state.deptGroup = el.dataset.group ?? "";
    render();
  },
  "dept-quiz": () => {
    state.deptQuiz = { step: 0, answers: {} };
    render();
  },
  "quiz-answer": (el) => {
    const quiz = state.deptQuiz;
    if (!quiz) return;
    quiz.answers[el.dataset.key] = el.dataset.value;
    quiz.step += 1;
    render();
  },
  "quiz-restart": () => {
    state.deptQuiz = { step: 0, answers: {} };
    render();
  },
  "quiz-close": () => {
    state.deptQuiz = null;
    render();
  },
  "quiz-pick": (el) => {
    state.deptQuiz = null;
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
  Object.assign(state, { idle: true, selectedId: null, query: "", filter: "ทั้งหมด", listOpen: false, openDepartment: null, openNews: null, newsKind: "", deptGroup: "", deptQuiz: null, view: "home" });
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
  const walkNet = network ?? fallbackNetwork;
  // A kiosk PC has no GPS: with no spot saved in admin, start routes at the main gate.
  const gate = walkNet?.nodes?.find((n) => n.gate);
  state.kiosk = KIOSK
    ? settings?.kiosk ?? (gate ? { name: gate.name || "ประตูวิทยาลัย", lat: gate.lat, lng: gate.lng, fallback: true } : null)
    : null;
  nav.setNetwork(walkNet);
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
