import { pgTable, serial, text, varchar, timestamp, boolean, integer, decimal, json, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { storesTable } from "./stores";
import { addressesTable } from "./addresses";
import { productsTable } from "./products";
import { serviceZonesTable } from "./zones";

export const orderStatusEnum = pgEnum("order_status", [
  "pending", "confirmed", "preparing", "packed", "picked_up", "on_the_way", "arriving", "delivered", "cancelled", "returned"
]);

export const paymentMethodEnum = pgEnum("payment_method", ["cod", "online", "wallet", "upi"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed", "refunded"]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("order_number", { length: 20 }).notNull().unique(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  zoneId: integer("zone_id").references(() => serviceZonesTable.id),
  customerZoneId: integer("customer_zone_id").references(() => serviceZonesTable.id),
  shopZoneId: integer("shop_zone_id").references(() => serviceZonesTable.id),
  riderZoneId: integer("rider_zone_id").references(() => serviceZonesTable.id),
  addressId: integer("address_id").references(() => addressesTable.id),
  addressSnapshot: json("address_snapshot").$type<Record<string, string>>(),
  pickupLatitude: decimal("pickup_latitude", { precision: 10, scale: 7 }),
  pickupLongitude: decimal("pickup_longitude", { precision: 10, scale: 7 }),
  pickupAddress: text("pickup_address"),
  pickupDistanceKm: decimal("pickup_distance_km", { precision: 8, scale: 2 }),
  status: orderStatusEnum("status").notNull().default("pending"),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  discount: decimal("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  couponCode: varchar("coupon_code", { length: 50 }),
  couponDiscount: decimal("coupon_discount", { precision: 10, scale: 2 }).default("0"),
  walletUsed: decimal("wallet_used", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  loyaltyPointsEarned: integer("loyalty_points_earned").default(0),
  estimatedDeliveryMins: integer("estimated_delivery_mins"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  imageUrl: text("image_url"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  mrp: decimal("mrp", { precision: 10, scale: 2 }).notNull(),
  qty: integer("qty").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
});

export const returnsTable = pgTable("returns", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("pending"), // pending, approved, rejected, refunded
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }),
  refundMethod: varchar("refund_method", { length: 30 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });

export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
