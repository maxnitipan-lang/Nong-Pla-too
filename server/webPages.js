// The plain HTML/CSS/JS pages in web/.
// While the conversion is in progress they are served as a preview:
//   /new      → web/index.html (kiosk)
//   /new/app  → web/app.html   (phone)
// The React pages stay on / and /app until the new ones replace them.

import express from "express";
import path from "path";

const WEB_DIR = path.resolve(process.cwd(), "web");

export function registerWebPages(app, base = "/new") {
  // Relative links in the pages need the trailing slash (/new/ not /new).
  // (Express treats /new and /new/ as the same route, so look at the real URL.)
  app.get(base, (req, res, next) => (req.originalUrl.split("?")[0] === base ? res.redirect(301, `${base}/`) : next()));
  app.get([`${base}/app`, `${base}/app/`], (_req, res) => res.sendFile(path.join(WEB_DIR, "app.html")));
  app.use(base, express.static(WEB_DIR, { index: "index.html", maxAge: 0 }));
}
