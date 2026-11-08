import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { createServer } from "http";
import net from "net";
import { appRouter } from "../routers.js";
import { startNewsAutoSync } from "../newsScraper.js";
import { registerImageRoutes } from "../images.js";
import { registerVoiceRoutes } from "../voice.js";
import { registerRestApi } from "../restApi.js";
import { registerSharedFiles } from "../sharedFiles.js";
import { registerNotFound, registerWebPages } from "../webPages.js";
import { createContext } from "./context.js";
import { registerOAuthRoutes } from "./oauth.js";
import { registerStorageProxy } from "./storageProxy.js";

function isPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Basic browser safety headers. Microphone + location stay allowed for this site (voice, GPS).
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Permissions-Policy", "microphone=(self), geolocation=(self), camera=()");
    next();
  });
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerVoiceRoutes(app);
  registerImageRoutes(app);
  // Cheap liveness probe (no DB) — Render's health check and the kiosk keep-alive ping hit this.
  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, uptime: Math.round(process.uptime()) });
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  // The same procedures as plain JSON endpoints (/api/campus/buildings …) for the HTML/JS pages.
  registerRestApi(app);
  registerSharedFiles(app);
  // Kiosk ( / ), phone app ( /app ), admin ( /admin ) and their files — plain HTML/CSS/JS in web/.
  registerWebPages(app);
  registerNotFound(app);
  // Broken request bodies (bad JSON, too large) get a JSON error like the rest of the API, not Express's HTML page.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error("[Server]", err);
    const message = err.type === "entity.parse.failed" ? "ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง" : status === 413 ? "ข้อมูลใหญ่เกินไป" : "เกิดข้อผิดพลาด";
    if (res.headersSent) return;
    res.status(status).json({ ok: false, error: { code: status === 500 ? "INTERNAL" : "BAD_REQUEST", message } });
  });

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  // In production (a host like Render/Railway) bind to the assigned $PORT exactly;
  // the port-scan is only a local-dev convenience so parallel runs don't collide.
  const isProduction = process.env.NODE_ENV === "production";
  const port = isProduction ? preferredPort : await findAvailablePort(preferredPort);
  if (!isProduction && port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  startNewsAutoSync();

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch(console.error);
