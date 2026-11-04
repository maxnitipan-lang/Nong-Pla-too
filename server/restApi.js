// Plain JSON API for the HTML/CSS/JS pages (no tRPC client, no superjson).
//
// Every tRPC procedure is also reachable as an ordinary HTTP endpoint:
//   GET  /api/campus/buildings                → campus.buildings (query)
//   GET  /api/admin/buildings/list?input={…}  → query with input (JSON in ?input=)
//   POST /api/chat/ask   body: {…}            → mutation, input is the JSON body
//
// Answers are plain JSON: { ok: true, data } or { ok: false, error: { code, message } }.
// Logins, roles and input checks are the same as tRPC's, because the call goes
// through the same router (appRouter.createCaller).

import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";

const procedures = appRouter._def.procedures;

/** "campus.buildings" → the caller function, or undefined. */
function callerFor(caller, dottedPath) {
  return dottedPath.split(".").reduce((node, key) => (node == null ? undefined : node[key]), caller);
}

function readInput(req, type) {
  if (type === "mutation") return req.body && Object.keys(req.body).length ? req.body : undefined;
  const raw = req.query.input;
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "?input= ต้องเป็น JSON" });
  }
}

export function registerRestApi(app) {
  app.all(/^\/api\/((?:campus|chat|auth|admin|system)(?:\/[A-Za-z0-9]+)+)\/?$/, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const path = req.params[0].replace(/\//g, ".");
    const procedure = procedures[path];
    if (!procedure) {
      res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: `ไม่มี API ${req.path}` } });
      return;
    }
    const type = procedure._def.type; // "query" | "mutation"
    const wantMethod = type === "mutation" ? "POST" : "GET";
    if (req.method !== wantMethod) {
      res.setHeader("Allow", wantMethod);
      res.status(405).json({ ok: false, error: { code: "METHOD_NOT_SUPPORTED", message: `ใช้ ${wantMethod} กับ ${req.path}` } });
      return;
    }
    try {
      const ctx = await createContext({ req, res });
      const fn = callerFor(appRouter.createCaller(ctx), path);
      const data = await fn(readInput(req, type));
      res.json({ ok: true, data: data === undefined ? null : data });
    } catch (error) {
      const err = error instanceof TRPCError ? error : new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: error });
      if (!(error instanceof TRPCError)) console.error(`[api] ${path}`, error);
      // Zod input errors arrive as a JSON list of issues; send the first message.
      let message = err.message;
      if (err.code === "BAD_REQUEST" && err.cause && Array.isArray(err.cause.issues)) {
        message = err.cause.issues[0]?.message ?? message;
      }
      if (err.code === "INTERNAL_SERVER_ERROR" && process.env.NODE_ENV === "production") message = "เกิดข้อผิดพลาดในเซิร์ฟเวอร์";
      res.status(getHTTPStatusCodeFromError(err)).json({ ok: false, error: { code: err.code, message } });
    }
  });
}
