// Per-IP request limits (sliding minute), kept in memory. Used by the voice and chat feedback endpoints.

const hits = new Map();

/** The visitor's IP (Render puts it first in x-forwarded-for). */
export function clientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req?.socket?.remoteAddress || "?";
}

/** true = this request is allowed; false = this IP used up `perMinute` requests for `bucket` in the last minute. */
export function allow(req, bucket, perMinute) {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(t => now - t < 60_000);
  if (recent.length >= perMinute) return false;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
  return true;
}
