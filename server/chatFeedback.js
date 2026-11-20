// 👍 / 👎 under an answer.
//
// The server hands out a signed token with each answer it recorded for /admin/learned. The token holds
// exactly what was recorded (question + language) plus where the answer came from and its start, so a
// 👎 always lands on the right row, and nobody can dispute questions the server never answered.

import crypto from "node:crypto";

// No secret set: a random one per process (tokens from before a restart just stop working).
const SECRET = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || crypto.randomBytes(32).toString("hex");

const sign = (body) => crypto.createHmac("sha256", SECRET).update(body).digest("base64url");

/** A token for the 👍 / 👎 buttons under one answer. */
export function feedbackToken({ question, lang, source, answer }) {
  const body = Buffer.from(
    JSON.stringify({ q: String(question), l: lang === "en" ? "en" : "th", s: String(source ?? "ai").slice(0, 16), a: String(answer ?? "").slice(0, 200) })
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** What a token says, or null when it is not one this server signed. */
export function readFeedbackToken(token) {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { q, l, s, a } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof q === "string" && q ? { question: q, lang: l === "en" ? "en" : "th", source: String(s ?? ""), answer: String(a ?? "") } : null;
  } catch {
    return null;
  }
}

/** Was this answer made by the AI (so its 👍 / 👎 belong in the "การใช้งาน AI" numbers)? */
export const isAiSource = (source) => /^ai/.test(String(source ?? ""));
