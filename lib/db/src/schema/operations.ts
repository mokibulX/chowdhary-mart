import { boolean, integer, json, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { productsTable } from "./products";
import { ordersTable } from "./orders";

export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "published", "failed", "dead"]);
export const inventoryLedgerTypeEnum = pgEnum("inventory_ledger_type", ["RESERVED", "RELEASED", "SOLD", "RETURNED", "MANUAL_ADJUSTMENT"]);

export const idempotencyRecordsTable = pgTable("idempotency_records", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 180 }).notNull(),
  userId: integer("user_id").references(() => usersTable.id),
  endpoint: varchar("endpoint", { length: 180 }).notNull(),
  requestHash: varchar("request_hash", { length: 96 }).notNull(),
  responseStatus: integer("response_status"),
  responseBody: json("response_body").$type<Record<string, unknown>>(),
  resourceId: varchar("resource_id", { length: 120 }),
  lockedUntil: timestamp("locked_until"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  keyEndpointIdx: uniqueIndex("idempotency_records_key_endpoint_idx").on(table.key, table.endpoint),
}));

export const outboxEventsTable = pgTable("outbox_events", {
  id: serial("id").primaryKey(),
  aggregateType: varchar("aggregate_type", { length: 80 }).notNull(),
  aggregateId: varchar("aggregate_id", { length: 120 }).notNull(),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  eventVersion: integer("event_version").notNull().default(1),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 180 }),
  status: outboxStatusEnum("status").notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  availableAt: timestamp("available_at").notNull().defaultNow(),
  publishedAt: timestamp("published_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  idemIdx: uniqueIndex("outbox_events_idempotency_idx").on(table.idempotencyKey, table.eventType),
}));

export const inventoryLedgerTable = pgTable("inventory_ledger", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  orderId: integer("order_id").references(() => ordersTable.id),
  type: inventoryLedgerTypeEnum("type").notNull(),
  qty: integer("qty").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 180 }),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  idemIdx: uniqueIndex("inventory_ledger_idempotency_idx").on(table.idempotencyKey, table.productId, table.type),
}));

export const systemErrorsTable = pgTable("system_errors", {
  id: serial("id").primaryKey(),
  referenceId: varchar("reference_id", { length: 40 }).notNull().unique(),
  requestId: varchar("request_id", { length: 40 }),
  userId: integer("user_id").references(() => usersTable.id),
  role: varchar("role", { length: 40 }),
  route: varchar("route", { length: 240 }),
  method: varchar("method", { length: 12 }),
  safeMessage: text("safe_message").notNull(),
  internalMessage: text("internal_message"),
  stack: text("stack"),
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
