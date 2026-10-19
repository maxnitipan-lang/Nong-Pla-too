import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("campus public API", () => {
  it("returns building records with floor details", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const buildings = await caller.campus.buildings();

    expect(buildings.length).toBeGreaterThan(0);
    expect(buildings[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      floors: expect.any(Number),
      floorsDetail: expect.any(Array),
    });
  });

  it("returns published news records for the campus feed", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const news = await caller.campus.news();

    expect(news.length).toBeGreaterThan(0);
    expect(news[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      excerpt: expect.any(String),
      date: expect.any(String),
    });
  });
});

describe("old-API contract (API_REPORT.pdf §7)", () => {
  const caller = () => appRouter.createCaller(createPublicContext());

  it("sends building coordinates as strings and keeps x/y/width/height", async () => {
    const [first] = await caller().campus.buildings();
    expect(first).toMatchObject({
      latitude: expect.any(String),
      longitude: expect.any(String),
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
      accent: expect.any(String),
    });
  });

  it("sends news with link / image / source", async () => {
    const [first] = await caller().campus.news();
    expect(first).toMatchObject({
      link: expect.any(String),
      image: expect.any(String),
      source: expect.any(String),
      time: expect.any(String),
    });
  });

  it("serves campus.settings with a numeric map center", async () => {
    const settings = await caller().campus.settings();
    expect(settings).toMatchObject({
      collegeName: "วิทยาลัยเทคนิคสมุทรสงคราม",
      contactEmail: expect.any(String),
      mapEmbedUrl: expect.any(String),
      mapCenter: { lat: expect.any(Number), lng: expect.any(Number) },
    });
  });

  it("returns null from campus.walkingRoute for an unknown building", async () => {
    const route = await caller().campus.walkingRoute({
      from: { lat: 13.4197, lng: 100.0104 },
      buildingId: "does-not-exist",
    });
    expect(route).toBeNull();
  });
});
