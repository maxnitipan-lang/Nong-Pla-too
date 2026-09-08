import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "user" | "admin" | null): TrpcContext {
  const user =
    role === null
      ? null
      : {
          id: 1,
          openId: "owner-1",
          email: "owner@example.com",
          name: "Owner",
          loginMethod: "manus",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("admin API access control", () => {
  it("rejects anonymous callers", async () => {
    const caller = appRouter.createCaller(contextFor(null));
    await expect(caller.admin.overview()).rejects.toThrow();
  });

  it("rejects signed-in users without the admin role", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.admin.buildings.list()).rejects.toThrow();
  });

  it("lets an admin read the overview from demo data", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    const overview = await caller.admin.overview();
    expect(overview.buildingCount).toBeGreaterThan(0);
    expect(overview.newsCount).toBeGreaterThan(0);
    expect(overview.mapConfigured).toBe(false);
  });

  it("stops an admin from removing their own admin role", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(
      caller.admin.users.setRole({ openId: "owner-1", role: "user" }),
    ).rejects.toThrow(/ตัวเอง/);
  });

  it("surfaces a helpful error when writing without a database", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(
      caller.admin.buildings.save({
        id: "demo-test",
        name: "อาคารทดสอบ",
        shortName: "ทดสอบ",
        category: "บริการ",
        description: "อาคารสำหรับทดสอบ",
        floors: 1,
        latitude: "",
        longitude: "",
        accent: "#123b52",
        mapX: 50,
        mapY: 50,
        mapWidth: 18,
        mapHeight: 17,
        sortOrder: 0,
        floorDetails: [{ level: 1, label: "ชั้น 1", rooms: ["ห้องทดสอบ"] }],
      }),
    ).rejects.toThrow(/DATABASE_URL/);
  });
});
