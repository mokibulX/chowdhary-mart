import { pgTable, serial, text, varchar, timestamp, boolean, integer, real, decimal, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const serviceZonesTable = pgTable("service_zones", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  cityId: integer("city_id"),
  stateId: integer("state_id"),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 120 }),
  centreLatitude: real("centre_latitude").notNull(),
  centreLongitude: real("centre_longitude").notNull(),
  radiusMeters: integer("radius_meters").notNull().default(5000),
  boundaryGeometry: jsonb("boundary_geometry").$type<Record<string, unknown> | null>(),
  deliveryMinutes: integer("delivery_minutes").notNull().default(40),
  minimumOrderAmount: decimal("minimum_order_amount", { precision: 10, scale: 2 }).notNull().default("99"),
  isActive: boolean("is_active").notNull().default(true),
  acceptingOrders: boolean("accepting_orders").notNull().default(true),
  deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
  registrationEnabled: boolean("registration_enabled").notNull().default(true),
  sellerRegistrationEnabled: boolean("seller_registration_enabled").notNull().default(true),
  riderRegistrationEnabled: boolean("rider_registration_enabled").notNull().default(true),
  createdByAdminId: integer("created_by_admin_id").references(() => usersTable.id),
  updatedByAdminId: integer("updated_by_admin_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  codeIdx: uniqueIndex("service_zones_code_idx").on(table.code),
}));

export const sellerZoneAssignmentsTable = pgTable("seller_zone_assignments", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  shopId: integer("shop_id"),
  zoneId: integer("zone_id").notNull().references(() => serviceZonesTable.id),
  assignmentType: varchar("assignment_type", { length: 30 }).notNull().default("primary"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  assignedByAdminId: integer("assigned_by_admin_id").references(() => usersTable.id),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  removedAt: timestamp("removed_at"),
});

export const riderZoneAssignmentsTable = pgTable("rider_zone_assignments", {
  id: serial("id").primaryKey(),
  riderId: integer("rider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  zoneId: integer("zone_id").notNull().references(() => serviceZonesTable.id),
  isPrimary: boolean("is_primary").notNull().default(true),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  assignedByAdminId: integer("assigned_by_admin_id").references(() => usersTable.id),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  removedAt: timestamp("removed_at"),
});

export const zoneChangeRequestsTable = pgTable("zone_change_requests", {
  id: serial("id").primaryKey(),
  userType: varchar("user_type", { length: 30 }).notNull(),
  sellerId: integer("seller_id").references(() => usersTable.id, { onDelete: "cascade" }),
  riderId: integer("rider_id").references(() => usersTable.id, { onDelete: "cascade" }),
  currentZoneId: integer("current_zone_id").references(() => serviceZonesTable.id),
  requestedZoneId: integer("requested_zone_id").notNull().references(() => serviceZonesTable.id),
  reason: text("reason"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedByAdminId: integer("reviewed_by_admin_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
});

export const zoneAdminAssignmentsTable = pgTable("zone_admin_assignments", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  zoneId: integer("zone_id").notNull().references(() => serviceZonesTable.id, { onDelete: "cascade" }),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

export const zoneAuditLogsTable = pgTable("zone_audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => usersTable.id),
  actorRole: varchar("actor_role", { length: 40 }),
  action: varchar("action", { length: 80 }).notNull(),
  zoneId: integer("zone_id").references(() => serviceZonesTable.id),
  targetUserId: integer("target_user_id").references(() => usersTable.id),
  oldValue: jsonb("old_value").$type<Record<string, unknown> | null>(),
  newValue: jsonb("new_value").$type<Record<string, unknown> | null>(),
  ipAddress: varchar("ip_address", { length: 80 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ServiceZone = typeof serviceZonesTable.$inferSelect;
