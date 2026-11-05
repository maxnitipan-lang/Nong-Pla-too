// Everything the browser loads comes from web/ as plain files — no build step:
//   /                  → web/index.html (kiosk)
//   /app               → web/app.html   (phone)
//   /admin, /admin/…   → web/admin.html (admin panel; it picks the page from the address)
//   /js, /css, /vendor, /mascots, /icons, /images, /branding, /manifest.json, /sw.js → the files themselves
// Anything else that isn't an API answers with web/404.html.

import express from "express";
import path from "path";

const WEB_DIR = path.resolve(process.cwd(), "web");

export function registerWebPages(app) {
  const page = file => (_req, res) => {
    res.setHeader("Cache-Control", "no-cache"); // always check for a new version (the service worker still works offline)
    res.sendFile(path.join(WEB_DIR, file));
  };
  app.get("/", page("index.html"));
  app.get(["/app", "/app/"], page("app.html"));
  app.get(/^\/admin(\/[a-z]*)?\/?$/, page("admin.html"));

  // Old links: building pages, the old /explore page and the preview address used while converting.
  app.get("/building/:id", (req, res) => res.redirect(302, `/app?place=${encodeURIComponent(req.params.id)}`));
  app.get("/explore", (_req, res) => res.redirect(301, "/"));
  app.get(/^\/new(\/.*)?$/, (req, res) => {
    const rest = req.params[0] ?? "/";
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(301, (rest.startsWith("/app") ? "/app" : "/") + query);
  });

  // Tests live next to the scripts but are not for the browser.
  app.use((req, res, next) => (req.path.endsWith(".test.js") ? res.status(404).end() : next()));
  // maxAge 0 = the browser re-checks each file (a quick 304 when unchanged), so a deploy never
  // mixes a new page with old scripts. The service worker must never be cached by the browser.
  app.use(
    express.static(WEB_DIR, {
      index: false,
      maxAge: 0,
      setHeaders: (res, file) => {
        if (file.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
      },
    })
  );
}

/** Last in line: a missing page (not an API) gets the "not found" page, a missing file a plain 404. */
export function registerNotFound(app) {
  app.use((req, res) => {
    if (req.method === "GET" && !req.path.startsWith("/api/") && req.accepts("html") && !path.extname(req.path)) {
      res.status(404).sendFile(path.join(WEB_DIR, "404.html"));
      return;
    }
    res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "ไม่พบ" } });
  });
}
