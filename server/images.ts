// Pictures uploaded in /admin (department logos, building photos).
//
// Stored in the database, not on disk, because Render wipes the disk on every
// deploy. The browser shrinks a picture before uploading it, so a logo is a few
// tens of KB. Each picture is served at /api/images/<id>; the id is a hash of
// the content, so the same file uploaded twice is stored once and the URL can
// be cached forever.

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Express } from "express";
import { campusImages } from "../drizzle/schema";
import { getDb } from "./db";

/** Largest picture accepted after the browser has shrunk it. */
export const MAX_IMAGE_BYTES = 1_500_000;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const ID_RE = /^[a-f0-9]{24}$/;

/** Same table as drizzle/0008_campus_images.sql — created on first use so no manual migration is needed. */
let tableReady: Promise<void> | null = null;
async function ensureTable() {
  const db = await getDb();
  if (!db) throw new Error("ยังไม่ได้เชื่อมต่อฐานข้อมูล — อัปโหลดรูปไม่ได้");
  tableReady ??= db
    .execute(
      sql.raw(
        "CREATE TABLE IF NOT EXISTS `campus_images` (`id` varchar(32) NOT NULL, `mime` varchar(40) NOT NULL, `data` mediumtext NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `campus_images_id` PRIMARY KEY(`id`))"
      )
    )
    .then(() => undefined)
    .catch(error => {
      tableReady = null; // try again next time
      throw error;
    });
  await tableReady;
  return db;
}

/** Parse "data:image/png;base64,…" — throws a readable error for anything else. */
export function parseImageDataUrl(dataUrl: string): { mime: string; base64: string; bytes: number } {
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
  if (!match) throw new Error("ไฟล์นี้ไม่ใช่รูปภาพ");
  const [, mime, base64] = match;
  if (!ALLOWED.has(mime)) throw new Error("รองรับเฉพาะรูป PNG, JPG หรือ WebP");
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) throw new Error("รูปใหญ่เกินไป (เกิน 1.5 MB)");
  return { mime, base64, bytes };
}

/** Store a picture and return the URL to use for it. */
export async function saveImage(dataUrl: string): Promise<{ url: string; bytes: number }> {
  const { mime, base64, bytes } = parseImageDataUrl(dataUrl);
  const id = createHash("sha256").update(base64).digest("hex").slice(0, 24);
  const db = await ensureTable();
  await db.insert(campusImages).values({ id, mime, data: base64 }).onDuplicateKeyUpdate({ set: { id } });
  return { url: `/api/images/${id}`, bytes };
}

/** GET /api/images/:id — the stored picture, cached by the browser for a year. */
export function registerImageRoutes(app: Express) {
  app.get("/api/images/:id", async (req, res) => {
    const { id } = req.params;
    if (!ID_RE.test(id)) return res.status(404).end();
    try {
      const db = await ensureTable();
      const [row] = await db.select().from(campusImages).where(eq(campusImages.id, id)).limit(1);
      if (!row) return res.status(404).end();
      res.setHeader("Content-Type", row.mime);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(Buffer.from(row.data, "base64"));
    } catch (error) {
      console.warn("[images] read failed:", error instanceof Error ? error.message : error);
      res.status(503).end();
    }
  });
}
