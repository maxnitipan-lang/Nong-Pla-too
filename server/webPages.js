// The plain HTML/CSS/JS pages in web/:
//   /     → web/index.html (kiosk)
//   /app  → web/app.html   (phone)
// plus their files under /js, /css and /vendor. The admin panel (/admin…) is still
// the React app until it is converted too.

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

  // Page scripts, styles and the local copies of Leaflet / three.js / QR.
  const files = express.static(WEB_DIR, { index: false, maxAge: "1h" });
  app.use(["/js", "/css", "/vendor"], (req, res, next) => {
    if (req.path.endsWith(".test.js")) return res.status(404).end();
    // express strips the mount path; give static the full path back.
    req.url = req.baseUrl + req.url;
    files(req, res, next);
  });

  // Old links: building pages and the preview address used while converting.
  app.get("/building/:id", (req, res) => res.redirect(302, `/app?place=${encodeURIComponent(req.params.id)}`));
  app.get(/^\/new(\/.*)?$/, (req, res) => {
    const rest = req.params[0] ?? "/";
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(301, (rest.startsWith("/app") ? "/app" : "/") + query);
  });
}
