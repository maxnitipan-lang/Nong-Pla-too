// Zod schemas shared by the admin tRPC procedures and the admin UI forms.
import { z } from "zod";

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
});
export type BuildingInput = z.infer<typeof buildingInputSchema>;

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
});
export type SettingsInput = z.infer<typeof settingsInputSchema>;

export const setRoleSchema = z.object({
  openId: z.string().trim().min(1).max(64),
  role: z.enum(["user", "admin"]),
});
