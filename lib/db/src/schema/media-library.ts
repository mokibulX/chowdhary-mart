import { pgTable, serial, text, varchar, timestamp, boolean, integer, json } from "drizzle-orm/pg-core";
import { categoriesTable } from "./categories";
import { usersTable } from "./users";

export const mediaLibraryTable = pgTable("media_library", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  storagePath: text("storage_path"),
  storageProvider: varchar("storage_provider", { length: 40 }),
  mimeType: varchar("mime_type", { length: 80 }),
  sizeBytes: integer("size_bytes"),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  sourceType: varchar("source_type", { length: 40 }).notNull().default("admin_upload"),
  tags: json("tags").$type<string[]>().default([]),
  isApproved: boolean("is_approved").notNull().default(true),
  createdByAdminId: integer("created_by_admin_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MediaLibraryItem = typeof mediaLibraryTable.$inferSelect;
