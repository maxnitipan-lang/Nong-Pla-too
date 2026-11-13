// Turn-by-turn walking navigation over the campus walkway network.
// (Same behaviour as the React hook client/src/hooks/useCampusNavigation.ts.)
//
//   nav.routeTo(id)  → one GPS fix (or the kiosk's spot), plan the route, show its steps
//   nav.startLive()  → keep following GPS: progress, current step, voice, re-route when off path
//   nav.clear()      → back to the plain map
//
// Routing runs in the browser (/shared/walkNetwork.js), so it works offline. Only the
// stretch from off campus to the gate asks the server (OpenRouteService).
// Listen for changes with nav.onChange(fn); read the current state from nav.state.

import { OFF_CAMPUS_M, currentStepIndex, distanceM, locateOnPath, planCampusRoute, snapToNetwork } from "/shared/walkNetwork.js";
import { apiPost } from "./api.js";
import { speechLang, translate } from "./i18n.js";
import { buildingLatLng, getBestPosition } from "./directions.js";

/** Farther than this from the route while navigating → plan again from here. */
const OFF_ROUTE_M = 25;
const REPLAN_EVERY_MS = 5000;
/** Within this of the destination = arrived. */
const ARRIVED_M = 12;

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speechLang() === "en-US" ? translate(text) : text);
  u.lang = speechLang();
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

const IDLE = {
  targetId: null,
  status: "idle", // idle | locating | routing | ready | error
  message: null,
  route: null,
  approachPath: null,
  approachDistance: 0,
  live: false,
  progress: null, // { stepIndex, along, remaining, arrived }
};

export class CampusNavigation {
  /**
   * @param {object} options
   * @param {() => object[]} options.getBuildings  current building list
   * @param {object} options.network               walkway network (nodes + edges)
   * @param {{lat:number,lng:number,name:string}|null} [options.fixedStart]  kiosk: routes start here, no live mode
   */
  constructor({ getBuildings, network, fixedStart = null }) {
    this.getBuildings = getBuildings;
    this.network = network;
    this.fixedStart = fixedStart;
    this.voice = true;
    this.fix = fixedStart ? { lat: fixedStart.lat, lng: fixedStart.lng, accuracy: 3 } : null;
    this.state = { ...IDLE };
    this.listeners = new Set();
    this.request = 0;
    this.watchId = null;
    this.lastReplan = 0;
    this.spokenStep = -1;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  get target() {
    return this.getBuildings().find((b) => b.id === this.state.targetId) ?? null;
  }

  setNetwork(network) {
    this.network = network;
  }

  setFixedStart(fixedStart) {
    this.fixedStart = fixedStart;
    if (fixedStart) this.fix = { lat: fixedStart.lat, lng: fixedStart.lng, accuracy: 3 };
  }

  setVoice(on) {
    this.voice = on;
    if (!on) window.speechSynthesis?.cancel();
    this.set({});
  }

  stopWatch() {
    if (this.watchId !== null) navigator.geolocation?.clearWatch(this.watchId);
    this.watchId = null;
  }

  /** Plan from `from` to the target. Off campus, also fetch the street leg to the gate. */
  async plan(from, buildingId, requestId) {
    const building = this.getBuildings().find((b) => b.id === buildingId);
    const point = building ? buildingLatLng(building) : null;
    if (!building || !point) {
      this.set({ status: "error", message: "อาคารนี้ยังไม่มีพิกัด — ใช้ปุ่มเปิดใน Google Maps แทน" });
      return null;
    }
    const planned = planCampusRoute(this.network, from, { ...point, buildingId: building.id, name: building.name });
    if (!planned) {
      this.set({ status: "error", message: "ยังไม่มีทางเดินไปอาคารนี้ในระบบ — แจ้งผู้ดูแลให้วาดทางเดินเพิ่ม" });
      return null;
    }
    this.spokenStep = -1;
    const progress = { stepIndex: 0, along: 0, remaining: planned.distance, arrived: false };

    if (planned.offCampus) {
      const entry = planned.offCampus.entry;
      this.set({
        route: planned,
        progress,
        approachPath: [[from.lat, from.lng], [entry.lat, entry.lng]],
        approachDistance: planned.offCampus.straightDistance,
      });
      // Street route to the gate (server-side ORS); keep the straight line if unavailable.
      const street = await apiPost("campus/walkingRoute", { from: { lat: from.lat, lng: from.lng }, to: { lat: entry.lat, lng: entry.lng } }).catch(() => null);
      if (requestId !== this.request) return planned;
      if (street && street.coordinates?.length >= 2) this.set({ approachPath: street.coordinates, approachDistance: street.distance });
    } else {
      this.set({ route: planned, progress, approachPath: null, approachDistance: 0 });
    }
    this.set({ status: "ready", message: null });
    return planned;
  }

  async routeTo(buildingId) {
    const requestId = ++this.request;
    this.stopWatch();
    this.set({ ...IDLE, targetId: buildingId });
    let here;
    if (this.fixedStart) {
      here = { lat: this.fixedStart.lat, lng: this.fixedStart.lng, accuracy: 3 };
    } else {
      this.set({ status: "locating", message: "กำลังหาตำแหน่งของคุณ…" });
      try {
        here = await getBestPosition();
      } catch (error) {
        if (requestId !== this.request) return;
        this.set({ status: "error", message: error instanceof Error ? error.message : "หาตำแหน่งไม่สำเร็จ" });
        return;
      }
    }
    if (requestId !== this.request) return;
    this.fix = here;
    this.set({ status: "routing", message: "กำลังคำนวณเส้นทาง…" });
    await this.plan(here, buildingId, requestId);
  }

  /** No GPS on the phone: still show the route, starting at the college gate. */
  async routeFromGate(buildingId) {
    const gate = this.network?.nodes?.find((n) => n.gate);
    if (!gate) return;
    const requestId = ++this.request;
    this.stopWatch();
    this.set({ ...IDLE, targetId: buildingId, startName: gate.name || "ประตูวิทยาลัย", status: "routing", message: "กำลังคำนวณเส้นทาง…" });
    await this.plan({ lat: gate.lat, lng: gate.lng, accuracy: 3 }, buildingId, requestId);
  }

  clear() {
    this.request++;
    this.stopWatch();
    window.speechSynthesis?.cancel();
    this.set({ ...IDLE });
  }

  /** Update progress for a new position; re-plan when the walker leaves the path. */
  onLiveFix(here) {
    this.fix = here;
    const { route, targetId } = this.state;
    if (!route || !targetId) return;

    const needsReplan = route.offCampus
      ? (snapToNetwork(this.network, here)?.distance ?? Infinity) <= OFF_CAMPUS_M // just walked onto campus
      : locateOnPath(route.path, here).offBy > OFF_ROUTE_M + Math.min(here.accuracy, 40);
    if (needsReplan && Date.now() - this.lastReplan > REPLAN_EVERY_MS) {
      this.lastReplan = Date.now();
      void this.plan(here, targetId, this.request);
      return;
    }
    if (route.offCampus) {
      this.set({});
      return;
    }

    const { along } = locateOnPath(route.path, here);
    const end = route.path[route.path.length - 1];
    const remaining = Math.max(0, route.distance - along);
    const arrived = remaining < ARRIVED_M || distanceM(here, { lat: end[0], lng: end[1] }) < ARRIVED_M;
    const stepIndex = arrived ? route.steps.length - 1 : currentStepIndex(route.steps, along);
    this.set({ progress: { stepIndex, along, remaining, arrived } });

    if (this.voice && stepIndex !== this.spokenStep) {
      this.spokenStep = stepIndex;
      const step = route.steps[stepIndex];
      speak(step.maneuver === "arrive" ? step.instruction : `${step.instruction} แล้วเดินต่อ ${Math.round(step.distance)} เมตร`);
    }
    if (arrived) {
      this.stopWatch();
      this.set({ live: false });
    }
  }

  startLive() {
    if (this.fixedStart || !navigator.geolocation || !this.state.route) return;
    this.stopWatch();
    this.spokenStep = -1;
    this.set({ live: true });
    this.watchId = navigator.geolocation.watchPosition(
      ({ coords }) => this.onLiveFix({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          this.stopWatch();
          this.set({ live: false, message: "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่ง (GPS) แล้วลองใหม่" });
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }

  stopLive() {
    this.stopWatch();
    window.speechSynthesis?.cancel();
    this.set({ live: false });
  }
}
