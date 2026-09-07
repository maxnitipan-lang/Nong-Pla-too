import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { CAMPUS_BUILDINGS, CAMPUS_NEWS } from "@shared/campus";
import { campusBuildings, campusNews, InsertUser, users } from "../drizzle/schema";
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

export async function getCampusBuildings() {
  const db = await getDb();
  if (!db) return CAMPUS_BUILDINGS;

  try {
    const rows = await db.select().from(campusBuildings);
    if (!rows.length) return CAMPUS_BUILDINGS;

    return CAMPUS_BUILDINGS.map((fallback) => {
      const row = rows.find((item) => item.id === fallback.id);
      if (!row) return fallback;
      return {
        ...fallback,
        name: row.name,
        shortName: row.shortName,
        category: row.category,
        description: row.description,
        floors: row.floors,
        floorsDetail: (row.floorDetails as typeof fallback.floorsDetail) ?? fallback.floorsDetail,
      };
    });
  } catch (error) {
    console.warn("[Database] Could not load campus buildings, using demo data:", error);
    return CAMPUS_BUILDINGS;
  }
}

export async function getCampusNews() {
  const db = await getDb();
  if (!db) return CAMPUS_NEWS;

  try {
    const rows = await db.select().from(campusNews).where(eq(campusNews.published, 1));
    if (!rows.length) return CAMPUS_NEWS;
    return rows.map((row) => ({
      id: row.id,
      tag: row.tag,
      title: row.title,
      excerpt: row.excerpt,
      date: row.dateLabel,
      time: row.timeLabel,
      accent: row.accent,
    }));
  } catch (error) {
    console.warn("[Database] Could not load campus news, using demo data:", error);
    return CAMPUS_NEWS;
  }
}
