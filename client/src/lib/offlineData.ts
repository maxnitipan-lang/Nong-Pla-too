import { useEffect, useState } from "react";
import type { CampusBuilding, CampusNews } from "@shared/campus";

const BUILDINGS_KEY = "nong-platoo-offline-buildings-v1";
const NEWS_KEY = "nong-platoo-offline-news-v1";
const SAVED_AT_KEY = "nong-platoo-offline-saved-at-v1";

type CacheKey = typeof BUILDINGS_KEY | typeof NEWS_KEY;

function read<T>(key: CacheKey): T | undefined {
  if (typeof window === "undefined") return undefined;
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : undefined; } catch { return undefined; }
}

function write<T>(key: CacheKey, value: T) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); window.localStorage.setItem(SAVED_AT_KEY, new Date().toISOString()); } catch { /* Storage can be unavailable or full. */ }
}

export const offlineData = {
  getBuildings: () => read<CampusBuilding[]>(BUILDINGS_KEY),
  getNews: () => read<CampusNews[]>(NEWS_KEY),
  saveBuildings: (value: CampusBuilding[]) => write(BUILDINGS_KEY, value),
  saveNews: (value: CampusNews[]) => write(NEWS_KEY, value),
  getSavedAt: () => typeof window === "undefined" ? undefined : window.localStorage.getItem(SAVED_AT_KEY),
};

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); window.addEventListener("online", on); window.addEventListener("offline", off); return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); }; }, []);
  return online;
}
