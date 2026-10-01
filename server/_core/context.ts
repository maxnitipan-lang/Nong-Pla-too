import { parse as parseCookieHeader } from "cookie";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, getUserRowByOpenId, toSafeUser, upsertUser } from "../db";
import { USER_COOKIE_NAME, isLocalAccount, readUserToken, verifyUserToken } from "./localAccounts";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "./adminSession";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const DEV_ADMIN_OPEN_ID = "local-dev-admin";

/** Username/password account from the admin panel (`npt_user` cookie). */
async function localAccountUser(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  const token = parseCookieHeader(req.headers.cookie ?? "")[USER_COOKIE_NAME];
  const claimed = readUserToken(token);
  if (!claimed || !isLocalAccount(claimed.openId)) return null;
  try {
    const row = await getUserRowByOpenId(claimed.openId);
    if (!row || !verifyUserToken(token, row.passwordHash)) return null;
    return toSafeUser(row);
  } catch {
    return null;
  }
}

/** Synthetic admin user for the password-based login (no DB row needed). */
function passwordAdminUser(req: CreateExpressContextOptions["req"]): User | null {
  const token = parseCookieHeader(req.headers.cookie ?? "")[ADMIN_COOKIE_NAME];
  if (!verifyAdminToken(token)) return null;
  const now = new Date();
  return {
    id: -2,
    openId: "password-admin",
    name: "ผู้ดูแลระบบ",
    email: null,
    loginMethod: "password",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

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
    user = (await localAccountUser(opts.req)) ?? passwordAdminUser(opts.req) ?? (await devAdminUser());
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
