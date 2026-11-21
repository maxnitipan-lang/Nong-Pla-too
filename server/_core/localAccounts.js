// Per-person admin accounts (username + password), for sites where Manus OAuth
// isn't available. Accounts are rows in `users` with openId "local:<username>"
// and a scrypt `passwordHash`; a signed `npt_user` cookie keeps them signed in.
//
// The shared ADMIN_PASSWORD login (adminSession.js) keeps working alongside this.

import crypto from "node:crypto";

export const LOCAL_PREFIX = "local:";
export const USER_COOKIE_NAME = "npt_user";
export const USER_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const usernameToOpenId = username => `${LOCAL_PREFIX}${username.trim().toLowerCase()}`;
export const isLocalAccount = openId => openId.startsWith(LOCAL_PREFIX);

// ---------------------------------------------------------------------------
// Password hashing — scrypt, per-password random salt: "scrypt$<salt>$<hash>"
// ---------------------------------------------------------------------------

const KEY_LEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Session cookie: "<base64url openId>.<issuedAtMs>.<hmac>"
// The HMAC covers the password hash too, so changing a password (or deleting the
// account) signs that person out everywhere.
// ---------------------------------------------------------------------------

function sessionSecret() {
  return process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || "";
}

function sign(openId, issued, passwordHash) {
  return crypto.createHmac("sha256", sessionSecret()).update(`${openId}\n${issued}\n${passwordHash}`).digest("hex");
}

export function mintUserToken(openId, passwordHash) {
  const issued = Date.now().toString();
  return `${Buffer.from(openId).toString("base64url")}.${issued}.${sign(openId, issued, passwordHash)}`;
}

/** The openId a token claims (not yet verified — check with verifyUserToken). */
export function readUserToken(token) {
  if (!token) return null;
  const [id, issued, sig] = token.split(".");
  if (!id || !issued || !sig) return null;
  try {
    return { openId: Buffer.from(id, "base64url").toString("utf8"), issued, sig };
  } catch {
    return null;
  }
}

export function verifyUserToken(token, passwordHash) {
  const parsed = readUserToken(token);
  if (!parsed || !passwordHash || !sessionSecret()) return false;
  const expected = sign(parsed.openId, parsed.issued, passwordHash);
  const a = Buffer.from(parsed.sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const issuedAt = Number(parsed.issued);
  return Number.isFinite(issuedAt) && Date.now() - issuedAt < USER_COOKIE_MAX_AGE_MS;
}

export const isLocalLoginAvailable = () => sessionSecret().length > 0;

// ---------------------------------------------------------------------------
// Brute-force brake: 10 wrong passwords per IP per 15 minutes.
// ---------------------------------------------------------------------------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}

export function isLoginBlocked(req) {
  const entry = failures.get(clientIp(req));
  if (!entry) return false;
  if (Date.now() - entry.since > WINDOW_MS) {
    failures.delete(clientIp(req));
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordLoginFailure(req) {
  const ip = clientIp(req);
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.since > WINDOW_MS) failures.set(ip, { count: 1, since: Date.now() });
  else entry.count++;
  if (failures.size > 5000) failures.clear();
}

export function clearLoginFailures(req) {
  failures.delete(clientIp(req));
}
