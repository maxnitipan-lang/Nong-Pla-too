import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  CAMPUS_BUILDINGS,
  CAMPUS_NEWS,
  CAMPUS_SETTINGS_DEFAULTS,
  type CampusBuilding,
  type CampusNewsItem,
  type CampusSettings,
  type DepartmentProfile,
  type FloorDetail,
  type GalleryImage,
} from "@shared/campus";
import type {
  BuildingInput,
  ImportedBuildingInput,
  NewsInput,
  SettingsInput,
} from "@shared/adminSchemas";
import {
  campusBuildings,
  campusNews,
  type CampusBuildingRow,
  type CampusNewsRow,
  InsertUser,
  siteSettings,
  type User,
  type UserRow,
  users,
  walkNetworks,
} from "../drizzle/schema";
import type { WalkNetwork } from "@shared/walkNetwork";
import DEFAULT_WALK_NETWORK from "@shared/data/campusWalkNetwork.json";
import { ENV } from "./_core/env";
import type { StaffRole, UserRole } from "@shared/roles";
import { LOCAL_PREFIX, hashPassword, isLocalAccount, usernameToOpenId } from "./_core/localAccounts";

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

/** Full row, password hash included — only for verifying a login. */
export async function getUserRowByOpenId(openId: string): Promise<UserRow | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

/** Strip the password hash — everything that leaves the auth code uses this shape. */
export function toSafeUser(row: UserRow): User {
  const { passwordHash: _hidden, ...safe } = row;
  return safe;
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const row = await getUserRowByOpenId(openId);
  return row ? toSafeUser(row) : undefined;
}

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------

export async function listUsers() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  return rows.map((row) => ({
    ...toSafeUser(row),
    /** Set for username/password accounts created in the admin panel. */
    username: isLocalAccount(row.openId) ? row.openId.slice(LOCAL_PREFIX.length) : null,
  }));
}

/** New username + password staff account (admin / editor / viewer). */
export async function createLocalAdmin(input: { username: string; name: string; password: string; role: StaffRole }): Promise<void> {
  const db = await requireDb();
  const openId = usernameToOpenId(input.username);
  if (input.username.trim().toLowerCase() === (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase()) {
    throw new Error("ชื่อผู้ใช้นี้สงวนไว้สำหรับบัญชีหลักใน .env — เลือกชื่ออื่น");
  }
  if (await getUserRowByOpenId(openId)) throw new Error("ชื่อผู้ใช้นี้มีอยู่แล้ว — เลือกชื่ออื่น");
  await db.insert(users).values({
    openId,
    name: input.name,
    loginMethod: "password",
    role: input.role,
    passwordHash: hashPassword(input.password),
  });
}

export async function setLocalPassword(openId: string, password: string): Promise<void> {
  const db = await requireDb();
  if (!isLocalAccount(openId)) throw new Error("บัญชีนี้ไม่ได้ใช้รหัสผ่าน (เข้าสู่ระบบผ่าน OAuth)");
  await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.openId, openId));
}

export async function deleteUser(openId: string): Promise<void> {
  const db = await requireDb();
  await db.delete(users).where(eq(users.openId, openId));
}

export async function setUserRole(openId: string, role: UserRole) {
  const db = await requireDb();
  await db.update(users).set({ role }).where(eq(users.openId, openId));
}

// ---------------------------------------------------------------------------
// Campus buildings
// ---------------------------------------------------------------------------

const DEMO_BUILDINGS_BY_ID = new Map(CAMPUS_BUILDINGS.map((b) => [b.id, b]));

function rowToBuilding(row: CampusBuildingRow): CampusBuilding {
  const demo = DEMO_BUILDINGS_BY_ID.get(row.id);
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
    // NULL = never edited → reuse the built-in stub for known buildings.
    departments: (row.departments as DepartmentProfile[] | null) ?? demo?.departments ?? [],
    gallery: (row.gallery as GalleryImage[] | null) ?? demo?.gallery ?? [],
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
    // undefined = leave the stored value alone (old clients don't send these).
    ...(input.departments !== undefined && { departments: input.departments }),
    ...(input.gallery !== undefined && { gallery: input.gallery }),
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

/**
 * Upsert buildings read from a Google My Maps export. Only the name, category,
 * description and coordinates are overwritten on existing rows, so floors,
 * departments and gallery entered in the admin panel survive a re-import.
 */
export async function importCampusBuildings(
  items: ImportedBuildingInput[],
): Promise<{ imported: number }> {
  const db = await requireDb();
  for (const item of items) {
    const mapped = {
      name: item.name,
      shortName: item.shortName,
      category: item.category,
      description: item.description || "นำเข้าจาก Google My Maps",
      latitude: String(item.latitude),
      longitude: String(item.longitude),
    };
    await db
      .insert(campusBuildings)
      .values({
        id: item.id,
        ...mapped,
        floors: 1,
        floorDetails: [{ level: 1, label: "ชั้น 1", rooms: [] }],
        sortOrder: 500,
      })
      .onDuplicateKeyUpdate({ set: mapped });
  }
  return { imported: items.length };
}

export async function deleteCampusBuilding(id: string): Promise<void> {
  const db = await requireDb();
  await db.delete(campusBuildings).where(eq(campusBuildings.id, id));
}

// ---------------------------------------------------------------------------
// Campus news
// ---------------------------------------------------------------------------

/**
 * Hand-entered news first (by sortOrder), then items pulled from the college
 * website newest-first — their ids end in the site's increasing article number,
 * which is more reliable than sortOrder across separate sync runs.
 */
function sortNewsRows<T extends { id: string; source: string; sortOrder: number; createdAt: Date }>(rows: T[]): T[] {
  const siteNumber = (id: string) => Number(/(\d+)$/.exec(id)?.[1] ?? 0);
  return [...rows].sort((a, b) => {
    const aSite = a.source === "sstc.ac.th";
    const bSite = b.source === "sstc.ac.th";
    if (aSite !== bSite) return aSite ? 1 : -1;
    if (aSite) return siteNumber(b.id) - siteNumber(a.id);
    return a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime();
  });
}

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
    return sortNewsRows(rows).map(rowToNews);
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
  return sortNewsRows(rows).map((row) => ({
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
      kiosk: (() => {
        const lat = Number(map.get("kioskLat"));
        const lng = Number(map.get("kioskLng"));
        if (!map.get("kioskLat") || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { name: map.get("kioskName") || "ตู้ประชาสัมพันธ์", lat, lng };
      })(),
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
  // Kiosk fields are only written when the form sends them (old clients don't).
  if (input.kioskName !== undefined) entries.push(["kioskName", input.kioskName]);
  if (input.kioskLat !== undefined) entries.push(["kioskLat", input.kioskLat === null ? "" : String(input.kioskLat)]);
  if (input.kioskLng !== undefined) entries.push(["kioskLng", input.kioskLng === null ? "" : String(input.kioskLng)]);
  for (const [key, value] of entries) {
    await db
      .insert(siteSettings)
      .values({ key, value })
      .onDuplicateKeyUpdate({ set: { value } });
  }
}

// ---------------------------------------------------------------------------
// Campus walkway network (turn-by-turn routing)
// ---------------------------------------------------------------------------

const WALK_NETWORK_ID = "campus";

/** The saved network, or the starter network built from OpenStreetMap. */
export async function getWalkNetwork(): Promise<WalkNetwork & { source: "database" | "default" }> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.select().from(walkNetworks).where(eq(walkNetworks.id, WALK_NETWORK_ID)).limit(1);
      if (rows[0]) return { ...(rows[0].data as WalkNetwork), source: "database" };
    } catch (error) {
      console.warn("[Database] Could not load walk network, using default:", error);
    }
  }
  return { ...(DEFAULT_WALK_NETWORK as WalkNetwork), source: "default" };
}

export async function saveWalkNetwork(network: WalkNetwork): Promise<void> {
  const db = await requireDb();
  await db
    .insert(walkNetworks)
    .values({ id: WALK_NETWORK_ID, data: network })
    .onDuplicateKeyUpdate({ set: { data: network } });
}

/** Drop the saved network so the OpenStreetMap starter network is used again. */
export async function resetWalkNetwork(): Promise<void> {
  const db = await requireDb();
  await db.delete(walkNetworks).where(eq(walkNetworks.id, WALK_NETWORK_ID));
}
