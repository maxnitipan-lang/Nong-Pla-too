import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerWebPages } from "./webPages";

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

afterAll(() => new Promise(resolve => server.close(resolve)));

describe("plain HTML pages (preview at /new)", () => {
  it("sends /new to /new/ so relative links work", async () => {
    const res = await fetch(`${base}/new`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/new/");
  });

  it("serves the kiosk and the phone page", async () => {
    const kiosk = await fetch(`${base}/new/`).then(r => r.text());
    expect(kiosk).toContain('data-mode="kiosk"');
    const phone = await fetch(`${base}/new/app`).then(r => r.text());
    expect(phone).toContain('data-mode="phone"');
  });

  it("serves the page scripts, styles and Leaflet", async () => {
    for (const path of ["/new/js/app.js", "/new/css/app.css", "/new/vendor/leaflet/leaflet.js", "/new/vendor/qrcode.js"]) {
      expect((await fetch(base + path)).status, path).toBe(200);
    }
  });
});
