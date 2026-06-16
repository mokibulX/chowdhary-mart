import { pgTable, serial, text, varchar, timestamp, boolean, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const addressesTable = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 50 }).notNull().default("Home"),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }).notNull(),
  pincode: varchar("pincode", { length: 10 }).notNull(),
  lat: real("lat"),
  lng: real("lng"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAddressSchema = createInsertSchema(addressesTable).omit({ id: true, createdAt: true });
export type Address = typeof addressesTable.$inferSelect;
export type InsertAddress = z.infer<typeof insertAddressSchema>;
