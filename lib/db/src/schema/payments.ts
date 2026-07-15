import { pgTable, serial, text, varchar, timestamp, boolean, integer, decimal, json, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

export const paymentOrdersTable = pgTable("payment_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  parentOrderId: integer("parent_order_id").references(() => ordersTable.id),
  provider: varchar("provider", { length: 30 }).notNull().default("razorpay"),
  providerOrderId: varchar("provider_order_id", { length: 100 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("INR"),
  status: varchar("status", { length: 30 }).notNull().default("created"),
  cartSnapshot: json("cart_snapshot").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  providerOrderIdx: uniqueIndex("payment_orders_provider_order_id_idx").on(table.providerOrderId),
}));

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  paymentOrderId: integer("payment_order_id").references(() => paymentOrdersTable.id),
  parentOrderId: integer("parent_order_id").references(() => ordersTable.id),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  provider: varchar("provider", { length: 30 }).notNull().default("razorpay"),
  providerOrderId: varchar("provider_order_id", { length: 100 }).notNull(),
  providerPaymentId: varchar("provider_payment_id", { length: 100 }),
  providerSignature: text("provider_signature"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("INR"),
  paymentMethod: varchar("payment_method", { length: 40 }),
  paymentStatus: varchar("payment_status", { length: 30 }).notNull().default("pending"),
  captureStatus: varchar("capture_status", { length: 30 }).notNull().default("pending"),
  webhookVerified: boolean("webhook_verified").notNull().default(false),
  failureCode: varchar("failure_code", { length: 100 }),
  failureDescription: text("failure_description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  capturedAt: timestamp("captured_at"),
  failedAt: timestamp("failed_at"),
}, (table) => ({
  paymentIdx: uniqueIndex("payments_provider_payment_id_idx").on(table.providerPaymentId),
}));

export const paymentAttemptsTable = pgTable("payment_attempts", {
  id: serial("id").primaryKey(),
  paymentOrderId: integer("payment_order_id").references(() => paymentOrdersTable.id),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  provider: varchar("provider", { length: 30 }).notNull().default("razorpay"),
  status: varchar("status", { length: 30 }).notNull(),
  failureCode: varchar("failure_code", { length: 100 }),
  failureDescription: text("failure_description"),
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentWebhookEventsTable = pgTable("payment_webhook_events", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 30 }).notNull().default("razorpay"),
  eventId: varchar("event_id", { length: 140 }).notNull(),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  verified: boolean("verified").notNull().default(false),
  processedAt: timestamp("processed_at"),
  payload: json("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: uniqueIndex("payment_webhook_events_event_id_idx").on(table.eventId),
}));

export const refundsTable = pgTable("refunds", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").references(() => paymentsTable.id),
  parentOrderId: integer("parent_order_id").references(() => ordersTable.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("requested"),
  providerRefundId: varchar("provider_refund_id", { length: 100 }),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});
