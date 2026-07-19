import { pgTable, serial, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const otpCodesTable = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  target: varchar("target", { length: 255 }).notNull(),
  channel: varchar("channel", { length: 20 }).notNull(),
  purpose: varchar("purpose", { length: 40 }).notNull(),
  codeHash: varchar("code_hash", { length: 255 }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  isUsed: boolean("is_used").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OtpCode = typeof otpCodesTable.$inferSelect;
