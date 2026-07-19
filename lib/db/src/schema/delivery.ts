import { pgTable, serial, text, varchar, timestamp, boolean, integer, decimal, real, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { ordersTable } from "./orders";
import { serviceZonesTable } from "./zones";

export const vehicleTypeEnum = pgEnum("vehicle_type", ["bike", "bicycle", "scooter", "car"]);

export const deliveryPartnersTable = pgTable("delivery_partners", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  currentZoneId: integer("current_zone_id").references(() => serviceZonesTable.id),
  vehicleType: vehicleTypeEnum("vehicle_type").notNull().default("bike"),
  vehicleNumber: varchar("vehicle_number", { length: 20 }),
  licenseNumber: varchar("license_number", { length: 30 }),
  isOnline: boolean("is_online").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  currentLat: real("current_lat"),
  currentLng: real("current_lng"),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  totalDeliveries: integer("total_deliveries").default(0),
  totalEarnings: decimal("total_earnings", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orderTrackingTable = pgTable("order_tracking", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  deliveryPartnerId: integer("delivery_partner_id").references(() => deliveryPartnersTable.id),
  status: varchar("status", { length: 30 }).notNull(),
  message: text("message"),
  lat: real("lat"),
  lng: real("lng"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const liveLocationsTable = pgTable("live_locations", {
  id: serial("id").primaryKey(),
  deliveryPartnerId: integer("delivery_partner_id").notNull().references(() => deliveryPartnersTable.id, { onDelete: "cascade" }).unique(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  speed: real("speed").default(0),
  heading: real("heading").default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const activeDeliveryLocationsTable = pgTable("active_delivery_locations", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "cascade" }),
  deliveryPartnerId: integer("delivery_partner_id").notNull().references(() => deliveryPartnersTable.id, { onDelete: "cascade" }),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  heading: real("heading").default(0),
  speed: real("speed").default(0),
  accuracy: real("accuracy"),
  altitude: real("altitude"),
  status: varchar("status", { length: 30 }).notNull().default("online"),
  zoneId: integer("zone_id"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const deliveryRoutesTable = pgTable("delivery_route", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  deliveryPartnerId: integer("delivery_partner_id").references(() => deliveryPartnersTable.id),
  pickupLat: real("pickup_lat"),
  pickupLng: real("pickup_lng"),
  dropLat: real("drop_lat"),
  dropLng: real("drop_lng"),
  provider: varchar("provider", { length: 30 }).notNull().default("google"),
  encodedPolyline: text("encoded_polyline"),
  routeJson: jsonb("route_json"),
  distanceMeters: integer("distance_meters"),
  durationSeconds: integer("duration_seconds"),
  durationInTrafficSeconds: integer("duration_in_traffic_seconds"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const deliveryTrackingHistoryTable = pgTable("delivery_tracking_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "cascade" }),
  deliveryPartnerId: integer("delivery_partner_id").notNull().references(() => deliveryPartnersTable.id, { onDelete: "cascade" }),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  heading: real("heading").default(0),
  speed: real("speed").default(0),
  accuracy: real("accuracy"),
  altitude: real("altitude"),
  source: varchar("source", { length: 30 }).notNull().default("gps"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const deliveryEarningsTable = pgTable("delivery_earnings", {
  id: serial("id").primaryKey(),
  deliveryPartnerId: integer("delivery_partner_id").notNull().references(() => deliveryPartnersTable.id),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DeliveryPartner = typeof deliveryPartnersTable.$inferSelect;
export type LiveLocation = typeof liveLocationsTable.$inferSelect;
export type OrderTracking = typeof orderTrackingTable.$inferSelect;
export type ActiveDeliveryLocation = typeof activeDeliveryLocationsTable.$inferSelect;
export type DeliveryRoute = typeof deliveryRoutesTable.$inferSelect;
export type DeliveryTrackingHistory = typeof deliveryTrackingHistoryTable.$inferSelect;
