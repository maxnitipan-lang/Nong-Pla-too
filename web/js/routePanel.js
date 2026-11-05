// Route summary, turn-by-turn list and the big "next turn" banner over the map.
// (Same as client/src/components/RoutePanel.tsx.) Buttons carry data-action="…",
// handled by the page: nav-clear, nav-retry, nav-start, nav-stop, nav-voice.

import { formatDistance, phoneRouteUrl, walkMinutes } from "./directions.js";
import { icon } from "./icons.js";
import { html, raw } from "./util.js";

const turn = (maneuver, cls = "") => raw(icon(maneuver, cls));

/** One-line summary for the pill on the map. */
export function navSummary(nav) {
  const { message, route, progress } = nav.state;
  if (message) return message;
  if (!route) return "กำลังหาเส้นทาง…";
  if (progress?.arrived) return "ถึงแล้ว · ปิดเส้นทาง";
  const campus = progress?.remaining ?? route.distance;
  if (route.offCampus) return `มาที่ประตู ~${formatDistance(nav.state.approachDistance)} + ในวิทยาลัย ~${formatDistance(campus)} · ปิดเส้นทาง`;
  return `เดิน ~${formatDistance(campus)} · ~${walkMinutes(campus)} นาที · ปิดเส้นทาง`;
}

/** Big "next instruction" banner laid over the top of the map while a route is shown. */
export function navBannerHtml(nav) {
  const { route, progress, live, approachDistance } = nav.state;
  if (!route || !progress) return "";
  if (route.offCampus) {
    return html`<div class="nav-banner">${turn("navigate")}<div>
      <strong>${formatDistance(approachDistance)}</strong>
      <span>เดินมาที่${route.offCampus.gateName ?? "ทางเข้าวิทยาลัย"} แล้วเริ่มนำทางในวิทยาลัย</span></div></div>`;
  }
  const current = route.steps[progress.stepIndex];
  // While walking, show the *next* maneuver and how far away it is.
  const next = live && !progress.arrived ? route.steps[progress.stepIndex + 1] ?? current : current;
  const toNext = live && !progress.arrived ? Math.max(0, next.startAlong - progress.along) : current.distance;
  const text = progress.arrived ? route.steps[route.steps.length - 1].instruction : next.instruction;
  return html`<div class="nav-banner">${turn(progress.arrived ? "arrive" : next.maneuver)}<div>
    ${!progress.arrived && next.maneuver !== "arrive" ? raw(html`<strong>${formatDistance(toNext)}</strong>`) : ""}
    <span>${text}</span></div></div>`;
}

/** Route summary + turn-by-turn list + live controls. Empty string while idle. */
export function routePanelHtml(nav) {
  const { status, message, route, progress, live, approachDistance, targetId } = nav.state;
  if (status === "idle") return "";
  const busy = status === "locating" || status === "routing";
  const remaining = progress?.remaining ?? route?.distance ?? 0;
  const kiosk = nav.fixedStart;
  const target = nav.target;

  const steps = route && !busy
    ? route.steps.map((step, index) => {
        const active = progress ? index === progress.stepIndex : index === 0;
        const done = progress ? index < progress.stepIndex : false;
        return html`<li class="${active && live ? "active" : ""} ${done ? "done" : ""}">
          <span class="step-icon ${step.maneuver === "arrive" ? "arrive" : ""}">${turn(step.maneuver)}</span>
          <span class="step-text">${step.instruction}</span>
          ${step.distance > 0 ? raw(html`<span class="step-dist">${formatDistance(step.distance)}</span>`) : ""}
        </li>`;
      })
    : [];

  return html`<div class="route-panel">
    <div class="route-head">
      <div>
        <small>เส้นทางเดินในวิทยาลัย</small>
        <strong>ไป ${target?.name ?? "…"}</strong>
        ${kiosk ? raw(html`<span>เริ่มจาก: ${kiosk.name}${kiosk.fallback ? "" : " (คุณอยู่ที่นี่)"}</span>`) : nav.state.startName ? raw(html`<span>เริ่มจาก: ${nav.state.startName}</span>`) : ""}
        ${route && !busy ? raw(html`<span>${progress?.arrived ? "ถึงแล้ว 🎉" : `เดิน ~${formatDistance(remaining)} · ~${walkMinutes(remaining)} นาที`}</span>`) : ""}
      </div>
      <button type="button" class="route-close" data-action="nav-clear" aria-label="ปิดเส้นทาง">${raw(icon("close"))}</button>
    </div>
    ${busy || message ? raw(html`<p class="route-message ${status === "error" ? "error" : ""}">${busy ? raw(icon("spinner", "spin")) : ""} ${message ?? ""}</p>`) : ""}
    ${status === "error" && targetId ? raw(html`<div class="route-error-actions"><button type="button" class="route-retry" data-action="nav-retry">${raw(icon("navigate"))} ลองอีกครั้ง</button>${!kiosk ? raw(html`<button type="button" class="route-retry alt" data-action="nav-from-gate">${raw(icon("route"))} ดูเส้นทางจากประตูวิทยาลัย</button>`) : ""}</div>`) : ""}
    ${route?.offCampus && !busy
      ? raw(html`<p class="route-offcampus">คุณอยู่นอกวิทยาลัย — เดินมาที่${route.offCampus.gateName ?? "ทางเข้าวิทยาลัย"}ก่อน (~${formatDistance(approachDistance)}, เส้นประบนแผนที่) แล้วเส้นทางในวิทยาลัยจะเริ่มนำทางให้อัตโนมัติ</p>`)
      : ""}
    ${route && !busy && kiosk && targetId
      ? raw(html`<div class="route-qr">
          <div class="qr" data-qr="${phoneRouteUrl(targetId)}" role="img" aria-label="QR สำหรับนำทางต่อบนมือถือ"></div>
          <div><strong>สแกนเพื่อเดินตามเส้นทางนี้บนมือถือ</strong><span>มือถือจะนำทางทีละโค้งด้วย GPS พร้อมเสียงบอกทาง — ใช้กล้องมือถือสแกนได้เลย ไม่ต้องลงแอป</span></div>
        </div>`)
      : ""}
    ${route && !busy && !kiosk
      ? raw(html`<div class="route-controls">
          ${live
            ? raw(html`<button type="button" class="route-stop" data-action="nav-stop">${raw(icon("stop"))} หยุดนำทาง</button>`)
            : !progress?.arrived
              ? raw(html`<button type="button" class="route-start" data-action="nav-start">${raw(icon("navigate"))} เริ่มนำทาง</button>`)
              : ""}
          <button type="button" class="route-voice" data-action="nav-voice" aria-label="${nav.voice ? "ปิดเสียงบอกทาง" : "เปิดเสียงบอกทาง"}">${raw(icon(nav.voice ? "volume-on" : "volume-off"))}</button>
        </div>`)
      : ""}
    ${steps.length ? raw(html`<ol class="route-steps">${steps.map(raw)}</ol>`) : ""}
  </div>`;
}
