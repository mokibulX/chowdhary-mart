import { pgTable, serial, text, varchar, timestamp, boolean, integer, decimal, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { serviceZonesTable } from "./zones";

export const storesTable = pgTable("stores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  zoneId: integer("zone_id").references(() => serviceZonesTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 100 }).default("Hatsingimari"),
  pincode: varchar("pincode", { length: 10 }).default("783135"),
  phone: varchar("phone", { length: 20 }),
  radiusKm: real("radius_km").notNull().default(5),
  minOrderValue: decimal("min_order_value", { precision: 10, scale: 2 }).default("0"),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).default("49"),
  freeDeliveryAbove: decimal("free_delivery_above", { precision: 10, scale: 2 }).default("299"),
  estimatedDeliveryMins: integer("estimated_delivery_mins").default(30),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  ratingCount: integer("rating_count").default(0),
  isOpen: boolean("is_open").notNull().default(true),
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  holidayMode: boolean("holiday_mode").notNull().default(false),
  gstin: varchar("gstin", { length: 20 }),
  commissionPercent: decimal("commission_percent", { precision: 5, scale: 2 }).default("10"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const storeHoursTable = pgTable("store_hours", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun, 6=Sat
  openTime: varchar("open_time", { length: 8 }).notNull(), // HH:MM
  closeTime: varchar("close_time", { length: 8 }).notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
});

export const bannersTable = pgTable("banners", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Store = typeof storesTable.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;
