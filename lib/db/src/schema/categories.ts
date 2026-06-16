import { pgTable, serial, text, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  imageUrl: text("image_url"),
  iconEmoji: varchar("icon_emoji", { length: 10 }),
  colorClass: varchar("color_class", { length: 50 }),
  parentId: integer("parent_id"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const brandsTable = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true, createdAt: true });
export const insertBrandSchema = createInsertSchema(brandsTable).omit({ id: true, createdAt: true });

export type Category = typeof categoriesTable.$inferSelect;
export type Brand = typeof brandsTable.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
