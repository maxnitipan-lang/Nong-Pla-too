import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CampusBuilding } from "@shared/campus";
import {
  OFF_CAMPUS_M,
  currentStepIndex,
  distanceM,
  locateOnPath,
  planCampusRoute,
  snapToNetwork,
  type CampusRoute,
  type LatLngTuple,
  type WalkNetwork,
} from "@shared/walkNetwork";
import DEFAULT_WALK_NETWORK from "@shared/data/campusWalkNetwork.json";
import { trpc } from "@/lib/trpc";
import { buildingLatLng, getBestPosition, type GpsFix } from "@/lib/directions";

const NETWORK_CACHE_KEY = "nong-platoo-walk-network-v1";
/** Farther than this from the route while navigating → plan again from here. */
const OFF_ROUTE_M = 25;
const REPLAN_EVERY_MS = 5000;
/** Within this of the destination = arrived. */
const ARRIVED_M = 12;

export type NavStatus = "idle" | "locating" | "routing" | "ready" | "error";

export type NavProgress = {
  stepIndex: number;
  /** Metres walked along the route. */
  along: number;
  remaining: number;
  arrived: boolean;
};

function readCachedNetwork(): WalkNetwork | undefined {
  try {
    const raw = window.localStorage.getItem(NETWORK_CACHE_KEY);
    return raw ? (JSON.parse(raw) as WalkNetwork) : undefined;
  } catch {
    return undefined;
  }
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "th-TH";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

/**
 * Turn-by-turn walking navigation over the campus walkway network.
 *
 *   routeTo(id)  → one GPS fix, plan the route, show it with its steps
 *   startLive()  → keep following GPS: progress, current step, voice, re-route when off path
 *   clear()      → back to the plain map
 *
 * Routing runs in the browser (shared/walkNetwork.ts), so it works offline. Only
 * the stretch from off campus to the gate goes to the server (OpenRouteService).
 */
export type NavigationOptions = {
  /**
   * Kiosk: routes always start here (the kiosk's spot) instead of GPS, and there
   * is no live mode — the walker continues on their phone via the QR code.
   */
  fixedStart?: { lat: number; lng: number; name: string } | null;
};

export function useCampusNavigation(buildings: CampusBuilding[], options: NavigationOptions = {}) {
  const fixedStart = options.fixedStart ?? null;
  const fixedStartRef = useRef(fixedStart);
  fixedStartRef.current = fixedStart;
  const { data: serverNetwork } = trpc.campus.walkNetwork.useQuery(undefined, { staleTime: 10 * 60 * 1000 });
  const [cachedNetwork] = useState(readCachedNetwork);
  useEffect(() => {
    if (!serverNetwork) return;
    try {
      window.localStorage.setItem(NETWORK_CACHE_KEY, JSON.stringify(serverNetwork));
    } catch {
      /* storage full / unavailable */
    }
  }, [serverNetwork]);
  const network: WalkNetwork = serverNetwork ?? cachedNetwork ?? (DEFAULT_WALK_NETWORK as WalkNetwork);
  const utils = trpc.useUtils();

  const [targetId, setTargetId] = useState<string | null>(null);
  const [status, setStatus] = useState<NavStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [route, setRoute] = useState<CampusRoute | null>(null);
  const [approachPath, setApproachPath] = useState<LatLngTuple[] | null>(null);
  const [approachDistance, setApproachDistance] = useState(0);
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [live, setLive] = useState(false);
  const [voice, setVoice] = useState(true);
  const [progress, setProgress] = useState<NavProgress | null>(null);

  const requestRef = useRef(0);
  const watchRef = useRef<number | null>(null);
  const lastReplanRef = useRef(0);
  const spokenStepRef = useRef(-1);
  const stateRef = useRef({ route, targetId, voice, network, buildings });
  stateRef.current = { route, targetId, voice, network, buildings };

  const target = useMemo(() => buildings.find((b) => b.id === targetId) ?? null, [buildings, targetId]);

  const stopWatch = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);

  /** Plan from `from` to the current target. Off campus, also fetch the leg to the gate. */
  const plan = useCallback(
    async (from: GpsFix, buildingId: string, requestId: number) => {
      const { network: net, buildings: list } = stateRef.current;
      const building = list.find((b) => b.id === buildingId);
      const point = building ? buildingLatLng(building) : null;
      if (!building || !point) {
        setStatus("error");
        setMessage("อาคารนี้ยังไม่มีพิกัด — ใช้ปุ่มเปิดใน Google Maps แทน");
        return null;
      }
      const planned = planCampusRoute(net, from, { ...point, buildingId: building.id, name: building.name });
      if (!planned) {
        setStatus("error");
        setMessage("ยังไม่มีทางเดินไปอาคารนี้ในระบบ — แจ้งผู้ดูแลให้วาดทางเดินเพิ่ม");
        return null;
      }
      setRoute(planned);
      setProgress({ stepIndex: 0, along: 0, remaining: planned.distance, arrived: false });
      spokenStepRef.current = -1;

      if (planned.offCampus) {
        const entry = planned.offCampus.entry;
        const straight: LatLngTuple[] = [[from.lat, from.lng], [entry.lat, entry.lng]];
        setApproachPath(straight);
        setApproachDistance(planned.offCampus.straightDistance);
        // Street route to the gate (server-side ORS); keep the straight line if unavailable.
        const street = await utils.client.campus.walkingRoute
          .mutate({ from: { lat: from.lat, lng: from.lng }, to: { lat: entry.lat, lng: entry.lng } })
          .catch(() => null);
        if (requestId !== requestRef.current) return planned;
        if (street && street.coordinates.length >= 2) {
          setApproachPath(street.coordinates);
          setApproachDistance(street.distance);
        }
      } else {
        setApproachPath(null);
        setApproachDistance(0);
      }
      setStatus("ready");
      setMessage(null);
      return planned;
    },
    [utils],
  );

  const routeTo = useCallback(
    async (buildingId: string) => {
      const requestId = ++requestRef.current;
      stopWatch();
      setLive(false);
      setTargetId(buildingId);
      setRoute(null);
      setApproachPath(null);
      setProgress(null);
      let here: GpsFix;
      const kiosk = fixedStartRef.current;
      if (kiosk) {
        here = { lat: kiosk.lat, lng: kiosk.lng, accuracy: 3 };
      } else {
        setStatus("locating");
        setMessage("กำลังหาตำแหน่งของคุณ…");
        try {
          here = await getBestPosition();
        } catch (error) {
          if (requestId !== requestRef.current) return;
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "หาตำแหน่งไม่สำเร็จ");
          return;
        }
      }
      if (requestId !== requestRef.current) return;
      setFix(here);
      setStatus("routing");
      setMessage("กำลังคำนวณเส้นทาง…");
      await plan(here, buildingId, requestId);
    },
    [plan, stopWatch],
  );

  const clear = useCallback(() => {
    requestRef.current++;
    stopWatch();
    window.speechSynthesis?.cancel();
    setLive(false);
    setTargetId(null);
    setRoute(null);
    setApproachPath(null);
    setProgress(null);
    setStatus("idle");
    setMessage(null);
  }, [stopWatch]);

  /** Update progress for a new position; re-plan when the walker leaves the path. */
  const onLiveFix = useCallback(
    (here: GpsFix) => {
      setFix(here);
      const { route: current, targetId: id, network: net, voice: talk } = stateRef.current;
      if (!current || !id) return;

      const needsReplan = current.offCampus
        ? (snapToNetwork(net, here)?.distance ?? Infinity) <= OFF_CAMPUS_M // just walked onto campus
        : locateOnPath(current.path, here).offBy > OFF_ROUTE_M + Math.min(here.accuracy, 40);
      if (needsReplan && Date.now() - lastReplanRef.current > REPLAN_EVERY_MS) {
        lastReplanRef.current = Date.now();
        void plan(here, id, requestRef.current);
        return;
      }
      if (current.offCampus) return;

      const { along } = locateOnPath(current.path, here);
      const end = current.path[current.path.length - 1];
      const remaining = Math.max(0, current.distance - along);
      const arrived = remaining < ARRIVED_M || distanceM(here, { lat: end[0], lng: end[1] }) < ARRIVED_M;
      const stepIndex = arrived ? current.steps.length - 1 : currentStepIndex(current.steps, along);
      setProgress({ stepIndex, along, remaining, arrived });

      if (talk && stepIndex !== spokenStepRef.current) {
        spokenStepRef.current = stepIndex;
        const step = current.steps[stepIndex];
        speak(step.maneuver === "arrive" ? step.instruction : `${step.instruction} แล้วเดินต่อ ${Math.round(step.distance)} เมตร`);
      }
      if (arrived) {
        stopWatch();
        setLive(false);
      }
    },
    [plan, stopWatch],
  );

  const startLive = useCallback(() => {
    if (fixedStartRef.current || !navigator.geolocation || !stateRef.current.route) return;
    stopWatch();
    setLive(true);
    spokenStepRef.current = -1;
    watchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => onLiveFix({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          stopWatch();
          setLive(false);
          setMessage("ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่ง (GPS) แล้วลองใหม่");
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }, [onLiveFix, stopWatch]);

  const stopLive = useCallback(() => {
    stopWatch();
    setLive(false);
    window.speechSynthesis?.cancel();
  }, [stopWatch]);

  useEffect(() => () => stopWatch(), [stopWatch]);
  useEffect(() => {
    if (fixedStart) setFix({ lat: fixedStart.lat, lng: fixedStart.lng, accuracy: 3 });
  }, [fixedStart?.lat, fixedStart?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    fixedStart,
    network,
    targetId,
    target,
    status,
    message,
    route,
    approachPath,
    approachDistance,
    fix,
    live,
    voice,
    setVoice,
    progress,
    routeTo,
    clear,
    startLive,
    stopLive,
  };
}

export type CampusNavigation = ReturnType<typeof useCampusNavigation>;
