import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerWebPages } from "./webPages.js";

let server;
let base;

beforeAll(async () => {
  const app = express();
  registerWebPages(app);
  await new Promise(resolve => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(
  () =>
    new Promise(resolve => {
      server.closeAllConnections(); // keep-alive sockets from the redirect checks
      server.close(resolve);
    })
);

describe("plain HTML pages", () => {
  it("serves the kiosk at / and the phone app at /app", async () => {
    const kiosk = await fetch(`${base}/`).then(r => r.text());
    expect(kiosk).toContain('data-mode="kiosk"');
    const phone = await fetch(`${base}/app`).then(r => r.text());
    expect(phone).toContain('data-mode="phone"');
  });

  it("serves the page scripts, styles and local libraries, but not tests", async () => {
    for (const path of ["/js/app.js", "/js/chat.js", "/css/app.css", "/vendor/leaflet/leaflet.js", "/vendor/qrcode.js", "/vendor/three/three.module.min.js"]) {
      expect((await fetch(base + path)).status, path).toBe(200);
    }
    expect((await fetch(`${base}/js/markdown.test.js`)).status).toBe(404);
  });

  it("uses absolute paths, so /app/ (trailing slash) still loads its styles and scripts", async () => {
    for (const page of ["/", "/app/"]) {
      const text = await fetch(base + page).then(r => r.text());
      expect(text, page).toContain('src="/js/app.js"');
      expect(text, page).toContain('href="/css/app.css"');
      expect(text, page).not.toMatch(/(href|src)="(css|js|vendor)\//);
    }
  });

  it("answers 404 for a missing script or style (not another page)", async () => {
    expect((await fetch(`${base}/js/does-not-exist.js`)).status).toBe(404);
    expect((await fetch(`${base}/css/nope.css`)).status).toBe(404);
  });

  it("serves the admin page for /admin and its sub-pages", async () => {
    for (const page of ["/admin", "/admin/walkways", "/admin/news/"]) {
      expect(await fetch(base + page).then(r => r.text()), page).toContain('src="/js/admin/main.js"');
    }
  });

  it("sends old links to the new pages", async () => {
    const building = await fetch(`${base}/building/mech-auto`, { redirect: "manual" });
    expect(building.headers.get("location")).toBe("/app?place=mech-auto");
    const preview = await fetch(`${base}/new/app?place=x`, { redirect: "manual" });
    expect(preview.headers.get("location")).toBe("/app?place=x");
    const previewKiosk = await fetch(`${base}/new/`, { redirect: "manual" });
    expect(previewKiosk.headers.get("location")).toBe("/");
  });
});
