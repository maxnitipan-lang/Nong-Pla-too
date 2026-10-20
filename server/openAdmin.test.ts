import { afterEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import type { TrpcContext } from "./_core/context";

function anonymousRequest() {
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as Parameters<typeof createContext>[0];
}

describe("OPEN_ADMIN (no login for /admin)", () => {
  const before = process.env.OPEN_ADMIN;
  afterEach(() => {
    if (before === undefined) delete process.env.OPEN_ADMIN;
    else process.env.OPEN_ADMIN = before;
  });

  it("makes a visitor who is not signed in an admin", async () => {
    process.env.OPEN_ADMIN = "1";
    const ctx = await createContext(anonymousRequest());
    expect(ctx.user).toMatchObject({ role: "admin", loginMethod: "open" });
    await expect(appRouter.createCaller(ctx).admin.overview()).resolves.toMatchObject({
      buildingCount: expect.any(Number),
    });
  });

  it("still requires a login when it is not set", async () => {
    delete process.env.OPEN_ADMIN;
    const ctx = await createContext(anonymousRequest());
    expect(ctx.user).toBeNull();
    await expect(appRouter.createCaller(ctx).admin.overview()).rejects.toThrow(/10001|10002|login/i);
  });
});
