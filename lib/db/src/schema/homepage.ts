import { pgTable, serial, text, varchar, timestamp, boolean, integer, decimal, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const homepageSectionsTable = pgTable("homepage_sections", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  subtitle: text("subtitle"),
  sectionType: varchar("section_type", { length: 40 }).notNull().default("MANUAL"),
  layoutType: varchar("layout_type", { length: 60 }).notNull().default("horizontal_product_scroll"),
  icon: varchar("icon", { length: 80 }),
  bannerImageUrl: text("banner_image_url"),
  zoneId: integer("zone_id"),
  cityId: integer("city_id"),
  productLimit: integer("product_limit").notNull().default(8),
  isActive: boolean("is_active").notNull().default(true),
  personalizedEnabled: boolean("personalized_enabled").notNull().default(false),
  outOfStockBehaviour: varchar("out_of_stock_behaviour", { length: 40 }).notNull().default("hide"),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),
  createdByAdminId: integer("created_by_admin_id"),
  updatedByAdminId: integer("updated_by_admin_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const homepageSectionProductsTable = pgTable("homepage_section_products", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").notNull().references(() => homepageSectionsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  shopProductId: integer("shop_product_id"),
  zoneId: integer("zone_id"),
  priority: integer("priority").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  addedByAdminId: integer("added_by_admin_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const homepageBundlesTable = pgTable("homepage_bundles", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").notNull().references(() => homepageSectionsTable.id, { onDelete: "cascade" }),
  bundleName: varchar("bundle_name", { length: 180 }).notNull(),
  imageStorageKey: text("image_storage_key"),
  zoneId: integer("zone_id"),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }).notNull().default("0"),
  bundlePrice: decimal("bundle_price", { precision: 10, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const homepageBundleItemsTable = pgTable("homepage_bundle_items", {
  id: serial("id").primaryKey(),
  bundleId: integer("bundle_id").notNull().references(() => homepageBundlesTable.id, { onDelete: "cascade" }),
  shopProductId: integer("shop_product_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
});

export const insertHomepageSectionSchema = createInsertSchema(homepageSectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHomepageSectionProductSchema = createInsertSchema(homepageSectionProductsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type HomepageSection = typeof homepageSectionsTable.$inferSelect;
export type HomepageSectionProduct = typeof homepageSectionProductsTable.$inferSelect;
export type InsertHomepageSection = z.infer<typeof insertHomepageSectionSchema>;
