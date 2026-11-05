import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerSharedFiles } from "./sharedFiles.js";

let server;
let base;

beforeAll(async () => {
  const app = express();
  registerSharedFiles(app);
  await new Promise(resolve => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise(resolve => server.close(resolve)));

const status = path => fetch(base + path).then(r => r.status);

describe("/shared for the browser", () => {
  it("serves the shared JS modules and the map data", async () => {
    expect(await status("/shared/walkNetwork.js")).toBe(200);
    expect(await status("/shared/campus.js")).toBe(200);
    expect(await status("/shared/data/campusWalkNetwork.json")).toBe(200);
    const res = await fetch(base + "/shared/walkNetwork.js");
    expect(res.headers.get("content-type")).toMatch(/javascript/);
  });

  it("does not serve tests, the chat Q&A file or anything outside shared/", async () => {
    expect(await status("/shared/walkNetwork.test.js")).toBe(404);
    expect(await status("/shared/data/chatFaq.json")).toBe(404);
    expect(await status("/shared/../package.json")).toBe(404);
    expect(await status("/shared/%2e%2e/package.json")).toBe(404);
  });
});
