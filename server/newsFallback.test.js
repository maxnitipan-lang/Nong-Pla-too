import { afterAll, describe, expect, it, vi } from "vitest";

// No database and the college website unreachable (like Render behind Cloudflare).
describe("news when nothing real is available", () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, DATABASE_URL: process.env.DATABASE_URL };
  afterAll(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    process.env.DATABASE_URL = saved.DATABASE_URL;
    vi.unstubAllGlobals();
  });

  it("the real site shows no made-up sample news", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 403 })));
    vi.resetModules();
    const { getCampusNews } = await import("./db.js");
    expect(await getCampusNews()).toEqual([]);
  });

  it("while developing, the sample cards still show", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 403 })));
    vi.resetModules();
    const { getCampusNews } = await import("./db.js");
    expect((await getCampusNews()).length).toBeGreaterThan(0);
  });
});
