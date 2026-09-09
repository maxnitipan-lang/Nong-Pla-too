import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const DEV_ADMIN_OPEN_ID = "local-dev-admin";

/**
 * Local-only admin: with `DEV_ADMIN=1` in `.env` (never in production) the app
 * treats every request as a signed-in admin, so `/admin` works on your own
 * machine without setting up Manus OAuth. Needs a database connection.
 */
async function devAdminUser(): Promise<User | null> {
  if (ENV.isProduction || process.env.DEV_ADMIN !== "1") return null;
  try {
    await upsertUser({
      openId: DEV_ADMIN_OPEN_ID,
      name: "ผู้ดูแล (เครื่องนี้)",
      role: "admin",
      lastSignedIn: new Date(),
    });
    return (await getUserByOpenId(DEV_ADMIN_OPEN_ID)) ?? null;
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user) {
    user = await devAdminUser();
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
