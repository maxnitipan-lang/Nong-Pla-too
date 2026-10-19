import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { UserRole } from "@shared/roles";

function as(role: UserRole): TrpcContext {
  return {
    user: {
      id: 7,
      openId: `local:${role}-person`,
      name: role,
      email: null,
      loginMethod: "password",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const newsItem = { id: "role-test", tag: "ทดสอบ", title: "ทดสอบ", dateLabel: "วันนี้" };

describe("staff roles", () => {
  it("viewer can read the admin pages", async () => {
    const caller = appRouter.createCaller(as("viewer"));
    await expect(caller.admin.overview()).resolves.toMatchObject({ buildingCount: expect.any(Number) });
    await expect(caller.admin.news.list()).resolves.toBeInstanceOf(Array);
    await expect(caller.admin.walkNetwork.get()).resolves.toMatchObject({ version: 1 });
  });

  it("viewer cannot change anything", async () => {
    const caller = appRouter.createCaller(as("viewer"));
    await expect(caller.admin.news.save(newsItem as never)).rejects.toThrow(/ดูได้อย่างเดียว/);
    await expect(caller.admin.news.syncFromWebsite()).rejects.toThrow(/ดูได้อย่างเดียว/);
    await expect(caller.admin.users.list()).rejects.toThrow(/10002/);
  });

  it("editor can write content (reaches the DB layer) but not manage users", async () => {
    const caller = appRouter.createCaller(as("editor"));
    await expect(caller.admin.news.save(newsItem as never)).rejects.toThrow(/DATABASE_URL/); // passed the guard
    await expect(caller.admin.users.list()).rejects.toThrow(/10002/);
    await expect(
      caller.admin.users.create({ username: "someone", name: "x", password: "12345678", role: "viewer" }),
    ).rejects.toThrow(/10002/);
  });

  it("plain users get nothing", async () => {
    const caller = appRouter.createCaller(as("user"));
    await expect(caller.admin.overview()).rejects.toThrow(/10002/);
  });

  it("login needs a username", async () => {
    const caller = appRouter.createCaller({ ...as("user"), user: null });
    await expect(caller.auth.adminLogin({ password: "anything" } as never)).rejects.toThrow();
  });
});
