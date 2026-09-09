// Password-based admin sign-in — the simple path for a deployed site where
// Manus OAuth is not available. Set ADMIN_PASSWORD in the environment; the
// /admin login form checks it and gets an HMAC-signed cookie in return.

import crypto from "node:crypto";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const ADMIN_COOKIE_NAME = "npt_admin";
export const ADMIN_COOKIE_MAX_AGE_MS = TOKEN_MAX_AGE_MS;

/** Whether password admin login is available (i.e. ADMIN_PASSWORD is set). */
export const isPasswordAdminEnabled = (): boolean => ADMIN_PASSWORD.length > 0;

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function verifyAdminPassword(password: string): boolean {
  return isPasswordAdminEnabled() && timingSafeEqualStr(password, ADMIN_PASSWORD);
}

/** Create a signed session token: `<issuedAtMs>.<hmac>`. */
export function mintAdminToken(): string {
  const issued = Date.now().toString();
  const sig = crypto
    .createHmac("sha256", ADMIN_PASSWORD)
    .update(issued)
    .digest("hex");
  return `${issued}.${sig}`;
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!isPasswordAdminEnabled() || !token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const issued = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", ADMIN_PASSWORD)
    .update(issued)
    .digest("hex");
  if (!timingSafeEqualStr(sig, expected)) return false;
  const issuedAt = Number(issued);
  return Number.isFinite(issuedAt) && Date.now() - issuedAt < TOKEN_MAX_AGE_MS;
}
