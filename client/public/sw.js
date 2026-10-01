// Bump the version whenever the caching rules change: `activate` deletes every
// other cache, so users stuck on an old copy get cleaned up automatically.
const CACHE_NAME = "nong-platoo-ontour-v4";
const APP_SHELL = ["/", "/app", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function putInCache(request, response) {
  if (response.ok && response.type !== "opaque") {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: always live. Offline fallback for data is handled in the app (lib/offlineData.ts).
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets never change under the same name → cache-first is safe.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => putInCache(request, response))));
    return;
  }

  // Pages and everything else: network-first so a new deploy shows up immediately;
  // the cached copy is only used when offline.
  event.respondWith(
    fetch(request)
      .then((response) => putInCache(request, response))
      .catch(() => caches.match(request).then((cached) => cached || (request.mode === "navigate" ? caches.match("/") : Response.error()))),
  );
});
