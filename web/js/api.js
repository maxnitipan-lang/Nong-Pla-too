// Talks to the server's plain JSON API (server/restApi.js):
//   GET  /api/<router>/<procedure>?input=…   → { ok: true, data } | { ok: false, error }
//   POST /api/<router>/<procedure>  (JSON)
// Campus data is also kept in localStorage so the kiosk keeps working offline.

import { readStore, writeStore } from "./util.js";

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call(method, path, input) {
  let url = `/api/${path}`;
  const options = { method, headers: {}, credentials: "same-origin" };
  if (method === "GET" && input !== undefined) url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  if (method === "POST") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(input ?? {});
  }
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ต", "NETWORK", 0);
  }
  const body = await response.json().catch(() => null);
  if (!body || !body.ok) {
    const error = body?.error ?? {};
    throw new ApiError(error.message || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${response.status})`, error.code, response.status);
  }
  return body.data;
}

export const apiGet = (path, input) => call("GET", path, input);
export const apiPost = (path, input) => call("POST", path, input);

// Same keys as the React app, so a kiosk keeps its saved copy across the switch.
const CACHE = {
  buildings: "nong-platoo-offline-buildings-v1",
  news: "nong-platoo-offline-news-v1",
  walkNetwork: "nong-platoo-walk-network-v1",
  settings: "nong-platoo-offline-settings-v1",
};
const SAVED_AT_KEY = "nong-platoo-offline-saved-at-v1";

/**
 * Fetch campus data; on success save a copy, on failure return the saved copy.
 * `fallback` is used when there is neither (first visit while offline).
 */
async function cached(name, path, fallback) {
  try {
    const data = await apiGet(path);
    const empty = Array.isArray(data) ? data.length === 0 : !data;
    if (!empty) {
      writeStore(CACHE[name], data);
      writeStore(SAVED_AT_KEY, new Date().toISOString());
      return data;
    }
  } catch {
    /* offline or server asleep → saved copy */
  }
  return readStore(CACHE[name]) ?? fallback;
}

export const loadBuildings = (fallback) => cached("buildings", "campus/buildings", fallback);
export const loadNews = () => cached("news", "campus/news", []);
export const loadSettings = () => cached("settings", "campus/settings", null);
export const loadWalkNetwork = (fallback) => cached("walkNetwork", "campus/walkNetwork", fallback);

/** Saved copies, for drawing the page instantly before the network answers. */
export const savedBuildings = () => readStore(CACHE.buildings);
export const savedNews = () => readStore(CACHE.news);
