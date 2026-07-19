import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  serviceZonesTable,
  sellerZoneAssignmentsTable,
  riderZoneAssignmentsTable,
  storesTable,
  deliveryPartnersTable,
  zoneAuditLogsTable,
  type ServiceZone,
} from "@workspace/db";
import type { AuthRequest } from "../middleware/auth";

export function distanceKm(aLat?: number | null, aLng?: number | null, bLat?: number | null, bLng?: number | null): number {
  if ([aLat, aLng, bLat, bLng].some((value) => value === null || value === undefined || Number.isNaN(Number(value)))) return Number.POSITIVE_INFINITY;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(Number(bLat) - Number(aLat));
  const dLng = toRad(Number(bLng) - Number(aLng));
  const lat1 = toRad(Number(aLat));
  const lat2 = toRad(Number(bLat));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function validCoordinate(lat: unknown, lng: unknown) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

export function isInsideZone(zone: Pick<ServiceZone, "centreLatitude" | "centreLongitude" | "radiusMeters">, lat: number, lng: number) {
  return distanceKm(lat, lng, zone.centreLatitude, zone.centreLongitude) * 1000 <= Number(zone.radiusMeters ?? 5000);
}

export async function getEligibleRegistrationZones(type: "seller" | "rider", lat?: number, lng?: number) {
  const rows = await db.select().from(serviceZonesTable).where(and(
    eq(serviceZonesTable.isActive, true),
    eq(serviceZonesTable.registrationEnabled, true),
    isNull(serviceZonesTable.archivedAt),
    type === "seller" ? eq(serviceZonesTable.sellerRegistrationEnabled, true) : eq(serviceZonesTable.riderRegistrationEnabled, true),
    type === "rider" ? eq(serviceZonesTable.deliveryEnabled, true) : undefined,
  ));
  return rows
    .map((zone) => {
      const distance = validCoordinate(lat, lng) ? distanceKm(Number(lat), Number(lng), zone.centreLatitude, zone.centreLongitude) : null;
      return {
        ...zone,
        distanceKm: distance === null ? null : Number(distance.toFixed(2)),
        insideServiceZone: distance === null ? false : distance * 1000 <= Number(zone.radiusMeters ?? 5000),
      };
    })
    .sort((a, b) => Number(a.distanceKm ?? 9999) - Number(b.distanceKm ?? 9999));
}

export async function validateZoneSelection(type: "seller" | "rider", zoneId: unknown, lat: unknown, lng: unknown) {
  if (!validCoordinate(lat, lng)) return { ok: false as const, error: "Live GPS location is required for service zone validation." };
  const id = Number(zoneId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false as const, error: "Please select an active service zone." };
  const [zone] = await db.select().from(serviceZonesTable).where(and(
    eq(serviceZonesTable.id, id),
    eq(serviceZonesTable.isActive, true),
    eq(serviceZonesTable.registrationEnabled, true),
    isNull(serviceZonesTable.archivedAt),
    type === "seller" ? eq(serviceZonesTable.sellerRegistrationEnabled, true) : eq(serviceZonesTable.riderRegistrationEnabled, true),
    type === "rider" ? eq(serviceZonesTable.deliveryEnabled, true) : undefined,
  )).limit(1);
  if (!zone) return { ok: false as const, error: "Please select an active service zone." };
  if (!isInsideZone(zone, Number(lat), Number(lng))) {
    return { ok: false as const, error: type === "seller" ? "Your shop location is outside the selected service zone." : "Your current location is outside the selected service zone." };
  }
  return { ok: true as const, zone };
}

export async function sellerZoneIds(userId: number) {
  const assignments = await db.select().from(sellerZoneAssignmentsTable).where(and(
    eq(sellerZoneAssignmentsTable.sellerId, userId),
    eq(sellerZoneAssignmentsTable.status, "approved"),
    isNull(sellerZoneAssignmentsTable.removedAt),
  ));
  if (assignments.length) return assignments.map((item) => item.zoneId);
  const [store] = await db.select().from(storesTable).where(eq(storesTable.userId, userId)).limit(1);
  return store?.zoneId ? [store.zoneId] : [];
}

export async function riderZoneIds(userId: number) {
  const assignments = await db.select().from(riderZoneAssignmentsTable).where(and(
    eq(riderZoneAssignmentsTable.riderId, userId),
    eq(riderZoneAssignmentsTable.status, "approved"),
    isNull(riderZoneAssignmentsTable.removedAt),
  ));
  if (assignments.length) return assignments.map((item) => item.zoneId);
  const [dp] = await db.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.userId, userId)).limit(1);
  return dp?.currentZoneId ? [dp.currentZoneId] : [];
}

export async function auditZone(req: AuthRequest, action: string, payload: { zoneId?: number | null; targetUserId?: number | null; oldValue?: Record<string, unknown> | null; newValue?: Record<string, unknown> | null }) {
  await db.insert(zoneAuditLogsTable).values({
    actorId: req.user?.userId ?? null,
    actorRole: req.user?.role ?? null,
    action,
    zoneId: payload.zoneId ?? null,
    targetUserId: payload.targetUserId ?? null,
    oldValue: payload.oldValue ?? null,
    newValue: payload.newValue ?? null,
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? null,
  }).catch(() => undefined);
}

export function publicZone(zone: ServiceZone & { distanceKm?: number | null; insideServiceZone?: boolean }) {
  return {
    id: zone.id,
    code: zone.code,
    name: zone.name,
    city: zone.city,
    state: zone.state,
    approximateArea: `${zone.city ?? "Local area"} service zone`,
    radiusMeters: zone.radiusMeters,
    deliveryMinutes: zone.deliveryMinutes,
    minimumOrderAmount: zone.minimumOrderAmount,
    registrationAvailable: zone.registrationEnabled && zone.isActive && !zone.archivedAt,
    acceptingOrders: zone.acceptingOrders,
    deliveryEnabled: zone.deliveryEnabled,
    distanceKm: zone.distanceKm ?? null,
    insideServiceZone: Boolean(zone.insideServiceZone),
  };
}
