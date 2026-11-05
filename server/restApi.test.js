import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerRestApi } from "./restApi.js";

// No DATABASE_URL in tests: the campus data comes from the built-in defaults.
let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerRestApi(app);
  await new Promise(resolve => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise(resolve => server.close(resolve)));

const get = path => fetch(base + path).then(async r => ({ status: r.status, body: await r.json() }));
const post = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(
    async r => ({ status: r.status, body: await r.json() })
  );

describe("plain JSON API", () => {
  it("serves public campus data as plain JSON", async () => {
    const { status, body } = await get("/api/campus/buildings");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty("name");
  });

  it("serves news, settings and the walkway network", async () => {
    for (const path of ["/api/campus/news", "/api/campus/settings", "/api/campus/walkNetwork"]) {
      const { status, body } = await get(path);
      expect(status, path).toBe(200);
      expect(body.ok, path).toBe(true);
    }
  });

  it("answers 404 for an unknown endpoint", async () => {
    const { status, body } = await get("/api/campus/nothingHere");
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
  });

  it("refuses the wrong HTTP method", async () => {
    expect((await post("/api/campus/buildings", {})).status).toBe(405);
    expect((await get("/api/chat/ask")).status).toBe(405);
  });

  it("keeps admin endpoints behind login", async () => {
    const { status, body } = await get("/api/admin/buildings/list");
    expect([401, 403]).toContain(status);
    expect(body.ok).toBe(false);
  });

  it("reports bad input as 400 with a message", async () => {
    const { status, body } = await post("/api/chat/ask", { messages: "not a list" });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(typeof body.error.message).toBe("string");
  });
});
