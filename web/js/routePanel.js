// Route summary, turn-by-turn list and the big "next turn" banner over the map.
// (Same as client/src/components/RoutePanel.tsx.) Buttons carry data-action="…",
// handled by the page: nav-clear, nav-retry, nav-start, nav-stop, nav-voice.
// nav.state.lang === "en" (the route was asked for in English) → everything in English.

import { placeEn } from "/shared/placeNamesEn.js";
import { formatDistance, phoneRouteUrl, walkMinutes } from "./directions.js";
import { icon } from "./icons.js";
import { html, raw } from "./util.js";

const turn = (maneuver, cls = "") => raw(icon(maneuver, cls));

/** Messages the navigator sets (Thai) → English. */
const MESSAGES_EN = {
  "กำลังหาตำแหน่งของคุณ…": "Finding your location…",
  "กำลังคำนวณเส้นทาง…": "Working out the route…",
  "หาตำแหน่งไม่สำเร็จ": "Couldn't find your location",
  "หาตำแหน่งไม่สำเร็จ — ลองออกไปที่โล่งแล้วลองใหม่": "Couldn't find your location. Move to an open area and try again",
  "อาคารนี้ยังไม่มีพิกัด — ใช้ปุ่มเปิดใน Google Maps แทน": "This building has no map position yet. Use Open in Google Maps",
  "ยังไม่มีทางเดินไปอาคารนี้ในระบบ — แจ้งผู้ดูแลให้วาดทางเดินเพิ่ม": "There is no walking path to this building yet",
  "อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง (GPS)": "This device doesn't support location (GPS)",
  "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่ง (GPS) ในเบราว์เซอร์แล้วลองใหม่": "Location is blocked. Allow location (GPS) in your browser and try again",
  "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่ง (GPS) แล้วลองใหม่": "Location is blocked. Allow location (GPS) and try again",
};

/** Text for the current language: t(nav)("ไทย", "English"). */
const tr = nav => (th, en) => (nav.state.lang === "en" ? en : th);
const nameIn = (nav, name, fallbackEn) => (nav.state.lang === "en" ? placeEn(name) ?? fallbackEn : name);
const stepText = (nav, step) => (nav.state.lang === "en" ? step.instructionEn ?? step.instruction : step.instruction);
const messageText = (nav, message) => (nav.state.lang === "en" && message ? MESSAGES_EN[message] ?? message : message);

/** One-line summary for the pill on the map. */
export function navSummary(nav) {
  const t = tr(nav);
  const { message, route, progress } = nav.state;
  if (message) return messageText(nav, message);
  if (!route) return t("กำลังหาเส้นทาง…", "Finding a route…");
  if (progress?.arrived) return t("ถึงแล้ว · ปิดเส้นทาง", "Arrived · close route");
  const campus = progress?.remaining ?? route.distance;
  if (route.offCampus)
    return t(
      `มาที่ประตู ~${formatDistance(nav.state.approachDistance)} + ในวิทยาลัย ~${formatDistance(campus)} · ปิดเส้นทาง`,
      `To the gate ~${formatDistanceEn(nav.state.approachDistance)} + on campus ~${formatDistanceEn(campus)} · close route`,
    );
  return t(
    `เดิน ~${formatDistance(campus)} · ~${walkMinutes(campus)} นาที · ปิดเส้นทาง`,
    `Walk ~${formatDistanceEn(campus)} · ~${walkMinutes(campus)} min · close route`,
  );
}

/** "350 m" / "1.2 km" for the English panel. */
function formatDistanceEn(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
const dist = (nav, m) => (nav.state.lang === "en" ? formatDistanceEn(m) : formatDistance(m));

/** Big "next instruction" banner laid over the top of the map while a route is shown. */
export function navBannerHtml(nav) {
  const t = tr(nav);
  const { route, progress, live, approachDistance } = nav.state;
  if (!route || !progress) return "";
  if (route.offCampus) {
    const gate = nameIn(nav, route.offCampus.gateName ?? "ทางเข้าวิทยาลัย", "the college entrance");
    return html`<div class="nav-banner">${turn("navigate")}<div>
      <strong>${dist(nav, approachDistance)}</strong>
      <span>${t(`เดินมาที่${gate} แล้วเริ่มนำทางในวิทยาลัย`, `Walk to ${gate}, then follow the campus route`)}</span></div></div>`;
  }
  const current = route.steps[progress.stepIndex];
  // While walking, show the *next* maneuver and how far away it is.
  const next = live && !progress.arrived ? route.steps[progress.stepIndex + 1] ?? current : current;
  const toNext = live && !progress.arrived ? Math.max(0, next.startAlong - progress.along) : current.distance;
  const text = stepText(nav, progress.arrived ? route.steps[route.steps.length - 1] : next);
  return html`<div class="nav-banner">${turn(progress.arrived ? "arrive" : next.maneuver)}<div>
    ${!progress.arrived && next.maneuver !== "arrive" ? raw(html`<strong>${dist(nav, toNext)}</strong>`) : ""}
    <span>${text}</span></div></div>`;
}

/** Route summary + turn-by-turn list + live controls. Empty string while idle. */
export function routePanelHtml(nav) {
  const t = tr(nav);
  const { status, message, route, progress, live, approachDistance, targetId } = nav.state;
  if (status === "idle") return "";
  const busy = status === "locating" || status === "routing";
  const remaining = progress?.remaining ?? route?.distance ?? 0;
  const kiosk = nav.fixedStart;
  const target = nav.target;
  const targetName = target ? nameIn(nav, target.name, "your destination") : "…";
  const startName = kiosk ? nameIn(nav, kiosk.name, "this kiosk") : nav.state.startName ? nameIn(nav, nav.state.startName, "the college gate") : "";
  const gate = route?.offCampus ? nameIn(nav, route.offCampus.gateName ?? "ทางเข้าวิทยาลัย", "the college entrance") : "";

  const steps = route && !busy
    ? route.steps.map((step, index) => {
        const active = progress ? index === progress.stepIndex : index === 0;
        const done = progress ? index < progress.stepIndex : false;
        return html`<li class="${active && live ? "active" : ""} ${done ? "done" : ""}">
          <span class="step-icon ${step.maneuver === "arrive" ? "arrive" : ""}">${turn(step.maneuver)}</span>
          <span class="step-text">${stepText(nav, step)}</span>
          ${step.distance > 0 ? raw(html`<span class="step-dist">${dist(nav, step.distance)}</span>`) : ""}
        </li>`;
      })
    : [];

  return html`<div class="route-panel" lang="${nav.state.lang === "en" ? "en" : "th"}">
    <div class="route-head">
      <div>
        <small>${t("เส้นทางเดินในวิทยาลัย", "Campus walking route")}</small>
        <strong>${t(`ไป ${targetName}`, `To ${targetName}`)}</strong>
        ${startName ? raw(html`<span>${t("เริ่มจาก", "From")}: ${startName}${kiosk && !kiosk.fallback ? t(" (คุณอยู่ที่นี่)", " (you are here)") : ""}</span>`) : ""}
        ${route && !busy ? raw(html`<span>${progress?.arrived ? t("ถึงแล้ว 🎉", "You have arrived 🎉") : t(`เดิน ~${formatDistance(remaining)} · ~${walkMinutes(remaining)} นาที`, `Walk ~${formatDistanceEn(remaining)} · ~${walkMinutes(remaining)} min`)}</span>`) : ""}
      </div>
      <button type="button" class="route-close" data-action="nav-clear" aria-label="${t("ปิดเส้นทาง", "Close route")}">${raw(icon("close"))}</button>
    </div>
    ${busy || message ? raw(html`<p class="route-message ${status === "error" ? "error" : ""}">${busy ? raw(icon("spinner", "spin")) : ""} ${messageText(nav, message) ?? ""}</p>`) : ""}
    ${status === "error" && targetId ? raw(html`<div class="route-error-actions"><button type="button" class="route-retry" data-action="nav-retry">${raw(icon("navigate"))} ${t("ลองอีกครั้ง", "Try again")}</button>${!kiosk ? raw(html`<button type="button" class="route-retry alt" data-action="nav-from-gate">${raw(icon("route"))} ${t("ดูเส้นทางจากประตูวิทยาลัย", "Route from the college gate")}</button>`) : ""}</div>`) : ""}
    ${route?.offCampus && !busy
      ? raw(html`<p class="route-offcampus">${t(
          `คุณอยู่นอกวิทยาลัย — เดินมาที่${gate}ก่อน (~${formatDistance(approachDistance)}, เส้นประบนแผนที่) แล้วเส้นทางในวิทยาลัยจะเริ่มนำทางให้อัตโนมัติ`,
          `You are outside the college. Walk to ${gate} first (~${formatDistanceEn(approachDistance)}, the dashed line on the map); the campus route then starts by itself.`,
        )}</p>`)
      : ""}
    ${route && !busy && kiosk && targetId
      ? raw(html`<div class="route-qr">
          <div class="qr" data-qr="${phoneRouteUrl(targetId, true, nav.state.lang)}" role="img" aria-label="${t("QR สำหรับนำทางต่อบนมือถือ", "QR code to continue on your phone")}"></div>
          <div><strong>${t("สแกนเพื่อเดินตามเส้นทางนี้บนมือถือ", "Scan to follow this route on your phone")}</strong><span>${t(
            "มือถือจะนำทางทีละโค้งด้วย GPS พร้อมเสียงบอกทาง — ใช้กล้องมือถือสแกนได้เลย ไม่ต้องลงแอป",
            "Your phone gives turn-by-turn GPS directions with voice. Just scan with the camera, no app needed.",
          )}</span></div>
        </div>`)
      : ""}
    ${route && !busy && !kiosk
      ? raw(html`<div class="route-controls">
          ${live
            ? raw(html`<button type="button" class="route-stop" data-action="nav-stop">${raw(icon("stop"))} ${t("หยุดนำทาง", "Stop directions")}</button>`)
            : !progress?.arrived
              ? raw(html`<button type="button" class="route-start" data-action="nav-start">${raw(icon("navigate"))} ${t("เริ่มนำทาง", "Start directions")}</button>`)
              : ""}
          <button type="button" class="route-voice" data-action="nav-voice" aria-label="${nav.voice ? t("ปิดเสียงบอกทาง", "Mute directions") : t("เปิดเสียงบอกทาง", "Speak directions")}">${raw(icon(nav.voice ? "volume-on" : "volume-off"))}</button>
        </div>`)
      : ""}
    ${steps.length ? raw(html`<ol class="route-steps">${steps.map(raw)}</ol>`) : ""}
  </div>`;
}
