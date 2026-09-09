import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const campusBuildings = mysqlTable("campus_buildings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  shortName: varchar("shortName", { length: 120 }).notNull(),
  category: mysqlEnum("category", [
    "สายอุตสาหกรรม",
    "พาณิชยกรรม/คหกรรม/สามัญ",
    "บริหาร-สนับสนุน",
    "ส่วนกลาง-กิจกรรม",
  ]).notNull(),
  description: text("description").notNull(),
  floors: int("floors").notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  floorDetails: json("floorDetails").notNull(),
  /** Marker / accent colour (hex) shown on the illustrated fallback map. */
  accent: varchar("accent", { length: 20 }).default("#123b52").notNull(),
  /** Marker position + footprint on the illustrated fallback map, 0–100 (%). */
  mapX: int("mapX").default(50).notNull(),
  mapY: int("mapY").default(50).notNull(),
  mapWidth: int("mapWidth").default(18).notNull(),
  mapHeight: int("mapHeight").default(17).notNull(),
  /** Ascending display order in the sidebar list. */
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const campusNews = mysqlTable("campus_news", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tag: varchar("tag", { length: 80 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  excerpt: text("excerpt").notNull(),
  dateLabel: varchar("dateLabel", { length: 80 }).notNull(),
  timeLabel: varchar("timeLabel", { length: 120 }).notNull(),
  accent: varchar("accent", { length: 20 }).notNull(),
  /** Full-article URL — clicking the card opens this. "" = no link. */
  link: varchar("link", { length: 500 }).default("").notNull(),
  /** Thumbnail image URL. "" = show the plain accent card. */
  imageUrl: varchar("imageUrl", { length: 500 }).default("").notNull(),
  /** "" = added by hand, "sstc.ac.th" = pulled from the college website. */
  source: varchar("source", { length: 80 }).default("").notNull(),
  published: int("published").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Key–value store for editable site-wide settings (map embed URL, address…). */
export const siteSettings = mysqlTable("site_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CampusBuildingRow = typeof campusBuildings.$inferSelect;
export type CampusNewsRow = typeof campusNews.$inferSelect;
export type SiteSettingRow = typeof siteSettings.$inferSelect;
