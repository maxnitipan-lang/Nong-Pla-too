// Zod schemas shared by the admin tRPC procedures and the admin UI forms.
import { z } from "zod";
import { STAFF_ROLES, USER_ROLES } from "./roles";

export const CAMPUS_CATEGORIES = [
  "สายอุตสาหกรรม",
  "พาณิชยกรรม/คหกรรม/สามัญ",
  "บริหาร-สนับสนุน",
  "ส่วนกลาง-กิจกรรม",
] as const;

const idSchema = z
  .string()
  .trim()
  .min(1, "ต้องมีรหัส")
  .max(64, "รหัสยาวเกินไป")
  .regex(/^[a-z0-9-]+$/, "ใช้ได้เฉพาะ a-z, 0-9 และ -");

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "ต้องเป็นรหัสสี hex เช่น #123b52");

export const floorDetailSchema = z.object({
  level: z.number().int().min(0).max(60),
  label: z.string().trim().min(1, "ระบุชื่อชั้น").max(60),
  rooms: z.array(z.string().trim().min(1).max(160)).max(40),
});

export const departmentSchema = z.object({
  id: z.string().trim().min(1).max(80),
  floor: z.number().int().min(0).max(60),
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().max(2000).default(""),
  skills: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  careers: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  activities: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  accent: hexColorSchema.default("#3c8f8d"),
});

export const galleryImageSchema = z.object({
  id: z.string().trim().min(1).max(80),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => /^https:\/\//.test(v) || v.startsWith("/"), "ต้องเป็นลิงก์ https:// หรือ path ในเว็บ (/...)"),
  caption: z.string().trim().max(200).default(""),
  alt: z.string().trim().max(200).default(""),
});

export const buildingInputSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, "ระบุชื่ออาคาร").max(255),
  shortName: z.string().trim().min(1, "ระบุชื่อย่อ").max(120),
  category: z.enum(CAMPUS_CATEGORIES),
  description: z.string().trim().min(1, "ระบุคำอธิบาย").max(2000),
  floors: z.number().int().min(1, "อย่างน้อย 1 ชั้น").max(60),
  latitude: z.string().trim().max(32).optional().default(""),
  longitude: z.string().trim().max(32).optional().default(""),
  accent: hexColorSchema.default("#123b52"),
  mapX: z.number().int().min(0).max(100).default(50),
  mapY: z.number().int().min(0).max(100).default(50),
  mapWidth: z.number().int().min(1).max(100).default(18),
  mapHeight: z.number().int().min(1).max(100).default(17),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  floorDetails: z.array(floorDetailSchema).min(1, "ต้องมีอย่างน้อย 1 ชั้น").max(60),
  // Kiosk extras (not in the old API) — optional so old clients keep working.
  departments: z.array(departmentSchema).max(60).optional(),
  gallery: z.array(galleryImageSchema).max(40).optional(),
});
export type BuildingInput = z.infer<typeof buildingInputSchema>;

/** One row read from a Google My Maps CSV/KML export (admin.buildings.import). */
export const importedBuildingSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  shortName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
  category: z.enum(CAMPUS_CATEGORIES),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export type ImportedBuildingInput = z.infer<typeof importedBuildingSchema>;

export const newsInputSchema = z.object({
  id: idSchema,
  tag: z.string().trim().min(1, "ระบุป้ายกำกับ").max(80),
  title: z.string().trim().min(1, "ระบุหัวข้อ").max(255),
  excerpt: z.string().trim().max(2000).default(""),
  dateLabel: z.string().trim().min(1, "ระบุวันที่").max(80),
  timeLabel: z.string().trim().max(120).default(""),
  accent: hexColorSchema.default("#3c8f8d"),
  link: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\//.test(v), "ต้องเป็นลิงก์ http(s)")
    .default(""),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\//.test(v), "ต้องเป็นลิงก์รูปภาพ http(s)")
    .default(""),
  source: z.string().trim().max(80).default(""),
  published: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type NewsInput = z.infer<typeof newsInputSchema>;

export const settingsInputSchema = z.object({
  collegeName: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(400),
  contactEmail: z
    .string()
    .trim()
    .max(320)
    .refine(
      (v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      "อีเมลไม่ถูกต้อง",
    ),
  mapEmbedUrl: z
    .string()
    .trim()
    .max(1000)
    .refine(
      (v) => v === "" || /^https:\/\/(www\.)?google\.com\/maps\/d\/embed\?mid=/.test(v),
      "ต้องเป็นลิงก์ฝัง Google My Maps (https://www.google.com/maps/d/embed?mid=...)",
    ),
  mapCenterLat: z.number().min(-90).max(90),
  mapCenterLng: z.number().min(-180).max(180),
  // New (optional so the old settings form still validates): the kiosk's spot.
  kioskName: z.string().trim().max(80).optional(),
  kioskLat: z.number().min(-90).max(90).nullable().optional(),
  kioskLng: z.number().min(-180).max(180).nullable().optional(),
});
export type SettingsInput = z.infer<typeof settingsInputSchema>;

export const newAdminAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "ชื่อผู้ใช้อย่างน้อย 3 ตัว")
    .max(32, "ชื่อผู้ใช้ยาวเกินไป")
    .regex(/^[a-z0-9._-]+$/, "ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, . _ -"),
  name: z.string().trim().min(1, "ระบุชื่อที่แสดง").max(120),
  password: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัว").max(200),
  role: z.enum(STAFF_ROLES).default("editor"),
});

export const resetPasswordSchema = z.object({
  openId: z.string().trim().min(1).max(64),
  password: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัว").max(200),
});

export const setRoleSchema = z.object({
  openId: z.string().trim().min(1).max(64),
  role: z.enum(USER_ROLES),
});

const walkIdSchema = z.string().trim().min(1).max(64);

/** The campus walkway graph as saved from the admin editor (shared/walkNetwork.ts). */
export const walkNetworkSchema = z
  .object({
    version: z.literal(1),
    nodes: z
      .array(
        z.object({
          id: walkIdSchema,
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          name: z.string().trim().max(120).optional(),
          buildingId: z.string().trim().max(64).optional(),
          gate: z.boolean().optional(),
        }),
      )
      .max(5000),
    edges: z
      .array(z.object({ a: walkIdSchema, b: walkIdSchema, name: z.string().trim().max(120).optional() }))
      .max(10000),
  })
  .refine((net) => {
    const ids = new Set(net.nodes.map((n) => n.id));
    return ids.size === net.nodes.length && net.edges.every((e) => ids.has(e.a) && ids.has(e.b) && e.a !== e.b);
  }, "โครงข่ายทางเดินไม่ถูกต้อง: มีจุดซ้ำ หรือมีเส้นที่ต่อกับจุดที่ไม่มีอยู่");
