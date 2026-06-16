import { pgTable, serial, text, varchar, timestamp, integer, decimal, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const walletTxnTypeEnum = pgEnum("wallet_txn_type", ["credit", "debit"]);

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: walletTxnTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  referenceId: varchar("reference_id", { length: 100 }),
  referenceType: varchar("reference_type", { length: 30 }), // order, refund, referral, bonus
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
