import { pgTable, serial, text, varchar, timestamp, boolean, integer, decimal, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["customer", "vendor", "delivery_partner", "admin"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 20 }).unique(),
  passwordHash: text("password_hash"),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("customer"),
  walletBalance: decimal("wallet_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  referralCode: varchar("referral_code", { length: 20 }).unique(),
  referredBy: integer("referred_by"),
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const loyaltyTransactionsTable = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  points: integer("points").notNull(),
  type: varchar("type", { length: 20 }).notNull(), // earn, redeem
  description: text("description"),
  orderId: integer("order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true });

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Session = typeof sessionsTable.$inferSelect;
