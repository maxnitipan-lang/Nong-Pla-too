import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  CAMPUS_BUILDINGS,
  CAMPUS_NEWS,
  CAMPUS_SETTINGS_DEFAULTS,
  type CampusBuilding,
  type CampusNewsItem,
  type CampusSettings,
  type FloorDetail,
} from "@shared/campus";
import type { BuildingInput, NewsInput, SettingsInput } from "@shared/adminSchemas";
import {
  campusBuildings,
  campusNews,
  type CampusBuildingRow,
  type CampusNewsRow,
  InsertUser,
  siteSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Whether a database connection string is configured at all. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** For admin writes: fail loudly instead of silently no-op when there is no DB. */
async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า DATABASE_URL — เชื่อมต่อฐานข้อมูล MySQL แล้วรัน `pnpm db:push` ก่อนใช้งานส่วนผู้ดูแล",
    );
  }
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------

export async function listUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(asc(users.createdAt));
}

export async function setUserRole(openId: string, role: "user" | "admin") {
  const db = await requireDb();
  await db.update(users).set({ role }).where(eq(users.openId, openId));
}

// ---------------------------------------------------------------------------
// Campus buildings
// ---------------------------------------------------------------------------

function rowToBuilding(row: CampusBuildingRow): CampusBuilding {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    category: row.category,
    description: row.description,
    floors: row.floors,
    x: row.mapX,
    y: row.mapY,
    width: row.mapWidth,
    height: row.mapHeight,
    accent: row.accent,
    latitude: row.latitude || undefined,
    longitude: row.longitude || undefined,
    floorsDetail: (row.floorDetails as FloorDetail[]) ?? [],
  };
}

function buildingInputToValues(input: BuildingInput) {
  return {
    id: input.id,
    name: input.name,
    shortName: input.shortName,
    category: input.category,
    description: input.description,
    floors: input.floors,
    latitude: input.latitude ?? "",
    longitude: input.longitude ?? "",
    floorDetails: input.floorDetails,
    accent: input.accent,
    mapX: input.mapX,
    mapY: input.mapY,
    mapWidth: input.mapWidth,
    mapHeight: input.mapHeight,
    sortOrder: input.sortOrder,
  };
}

export async function getCampusBuildings(): Promise<CampusBuilding[]> {
  const db = await getDb();
  if (!db) return CAMPUS_BUILDINGS;

  try {
    const rows = await db
      .select()
      .from(campusBuildings)
      .orderBy(asc(campusBuildings.sortOrder), asc(campusBuildings.name));
    if (!rows.length) return CAMPUS_BUILDINGS;
    return rows.map(rowToBuilding);
  } catch (error) {
    console.warn("[Database] Could not load campus buildings, using demo data:", error);
    return CAMPUS_BUILDINGS;
  }
}

export async function upsertCampusBuilding(input: BuildingInput): Promise<void> {
  const db = await requireDb();
  const values = buildingInputToValues(input);
  const { id: _omit, ...updateSet } = values;
  await db.insert(campusBuildings).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function deleteCampusBuilding(id: string): Promise<void> {
  const db = await requireDb();
  await db.delete(campusBuildings).where(eq(campusBuildings.id, id));
}

// ---------------------------------------------------------------------------
// Campus news
// ---------------------------------------------------------------------------

function rowToNews(row: CampusNewsRow): CampusNewsItem {
  return {
    id: row.id,
    tag: row.tag,
    title: row.title,
    excerpt: row.excerpt,
    date: row.dateLabel,
    time: row.timeLabel,
    accent: row.accent,
    link: row.link ?? "",
    image: row.imageUrl ?? "",
    source: row.source ?? "",
  };
}

export async function getCampusNews(): Promise<CampusNewsItem[]> {
  const db = await getDb();
  if (!db) return CAMPUS_NEWS;

  try {
    const rows = await db
      .select()
      .from(campusNews)
      .where(eq(campusNews.published, 1))
      .orderBy(asc(campusNews.sortOrder), asc(campusNews.createdAt));
    if (!rows.length) return CAMPUS_NEWS;
    return rows.map(rowToNews);
  } catch (error) {
    console.warn("[Database] Could not load campus news, using demo data:", error);
    return CAMPUS_NEWS;
  }
}

export type CampusNewsAdmin = CampusNewsItem & { published: boolean; sortOrder: number };

export async function listCampusNewsAdmin(): Promise<CampusNewsAdmin[]> {
  const db = await getDb();
  if (!db) return CAMPUS_NEWS.map((item) => ({ ...item, published: true, sortOrder: 0 }));
  const rows = await db
    .select()
    .from(campusNews)
    .orderBy(asc(campusNews.sortOrder), asc(campusNews.createdAt));
  return rows.map((row) => ({
    ...rowToNews(row),
    published: row.published === 1,
    sortOrder: row.sortOrder,
  }));
}

export async function upsertCampusNews(input: NewsInput): Promise<void> {
  const db = await requireDb();
  const values = {
    id: input.id,
    tag: input.tag,
    title: input.title,
    excerpt: input.excerpt,
    dateLabel: input.dateLabel,
    timeLabel: input.timeLabel,
    accent: input.accent,
    link: input.link,
    imageUrl: input.imageUrl,
    source: input.source,
    published: input.published ? 1 : 0,
    sortOrder: input.sortOrder,
  };
  const { id: _omit, ...updateSet } = values;
  await db.insert(campusNews).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function deleteCampusNews(id: string): Promise<void> {
  const db = await requireDb();
  await db.delete(campusNews).where(eq(campusNews.id, id));
}

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------

export async function getCampusSettings(): Promise<CampusSettings> {
  const db = await getDb();
  if (!db) return CAMPUS_SETTINGS_DEFAULTS;

  try {
    const rows = await db.select().from(siteSettings);
    const map = new Map(rows.map((row) => [row.key, row.value]));
    const num = (key: string, fallback: number) => {
      const raw = map.get(key);
      const parsed = raw != null ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
      collegeName: map.get("collegeName") || CAMPUS_SETTINGS_DEFAULTS.collegeName,
      address: map.get("address") || CAMPUS_SETTINGS_DEFAULTS.address,
      contactEmail: map.get("contactEmail") ?? CAMPUS_SETTINGS_DEFAULTS.contactEmail,
      mapEmbedUrl: map.get("mapEmbedUrl") ?? CAMPUS_SETTINGS_DEFAULTS.mapEmbedUrl,
      mapCenter: {
        lat: num("mapCenterLat", CAMPUS_SETTINGS_DEFAULTS.mapCenter.lat),
        lng: num("mapCenterLng", CAMPUS_SETTINGS_DEFAULTS.mapCenter.lng),
      },
    };
  } catch (error) {
    console.warn("[Database] Could not load site settings, using defaults:", error);
    return CAMPUS_SETTINGS_DEFAULTS;
  }
}

export async function updateCampusSettings(input: SettingsInput): Promise<void> {
  const db = await requireDb();
  const entries: Array<[string, string]> = [
    ["collegeName", input.collegeName],
    ["address", input.address],
    ["contactEmail", input.contactEmail],
    ["mapEmbedUrl", input.mapEmbedUrl],
    ["mapCenterLat", String(input.mapCenterLat)],
    ["mapCenterLng", String(input.mapCenterLng)],
  ];
  for (const [key, value] of entries) {
    await db
      .insert(siteSettings)
      .values({ key, value })
      .onDuplicateKeyUpdate({ set: { value } });
  }
}
