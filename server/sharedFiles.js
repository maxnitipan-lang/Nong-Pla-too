// Lets the HTML/JS pages load the same code the server uses (route finding, campus
// data, roles) straight from shared/, e.g. <script type="module"> import … from "/shared/walkNetwork.js".
// Only the browser-safe files are served: the .js modules (not tests) and the map data.

import express from "express";
import path from "path";

const SHARED_DIR = path.resolve(process.cwd(), "shared");
const MAP_DATA = new Set(["/data/campusWalkNetwork.json", "/data/campusFootprints.json"]);

export function registerSharedFiles(app) {
  // maxAge 0: re-check on every load, so a deploy never mixes new pages with an old shared module.
  const files = express.static(SHARED_DIR, { maxAge: 0, index: false, fallthrough: false });
  app.use("/shared", (req, res, next) => {
    const p = decodeURIComponent(req.path);
    const allowed = MAP_DATA.has(p) || (/^\/[\w/]+\.js$/.test(p) && !p.endsWith(".test.js"));
    if (!allowed) {
      res.status(404).end();
      return;
    }
    files(req, res, next);
  });
}
