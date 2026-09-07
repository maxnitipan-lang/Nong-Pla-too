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
  category: mysqlEnum("category", ["วิชาการ", "ปฏิบัติการ", "บริการ", "กิจกรรม"]).notNull(),
  description: text("description").notNull(),
  floors: int("floors").notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  floorDetails: json("floorDetails").notNull(),
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
  published: int("published").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CampusBuilding = typeof campusBuildings.$inferSelect;
export type CampusNews = typeof campusNews.$inferSelect;
