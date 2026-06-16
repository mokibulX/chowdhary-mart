import { pgTable, serial, text, varchar, timestamp, boolean, integer, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // order_update, promo, wallet, system
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  data: json("data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type Notification = typeof notificationsTable.$inferSelect;
