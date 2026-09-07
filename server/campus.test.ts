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
