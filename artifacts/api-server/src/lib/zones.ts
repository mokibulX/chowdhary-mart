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

type GeoPoint = { lat: number; lng: number };

function pointFromGeometry(value: unknown): GeoPoint | null {
  if (Array.isArray(value) && value.length >= 2) {
    const first = Number(value[0]);
    const second = Number(value[1]);
    return Number.isFinite(first) && Number.isFinite(second) && Math.abs(second) <= 90 && Math.abs(first) <= 180
      ? { lat: second, lng: first }
      : null;
  }
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    const lat = Number(item.lat ?? item.latitude);
    const lng = Number(item.lng ?? item.lon ?? item.longitude);
    return validCoordinate(lat, lng) ? { lat, lng } : null;
  }
  return null;
}

function polygonRings(geometry: unknown): GeoPoint[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const value = geometry as Record<string, unknown>;
  const raw = value.type === "Polygon" && Array.isArray(value.coordinates)
    ? value.coordinates
    : value.coordinates ?? value.points ?? value.vertices ?? value.path;
  if (!Array.isArray(raw)) return [];
  const rings = value.type === "Polygon" ? raw : [raw];
  return rings
    .filter(Array.isArray)
    .map((ring) => (ring as unknown[]).map(pointFromGeometry).filter((point): point is GeoPoint => Boolean(point)))
    .filter((ring) => ring.length >= 3);
}

function pointInRing(point: GeoPoint, ring: GeoPoint[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const prior = ring[previous];
    const intersects = ((current.lng > point.lng) !== (prior.lng > point.lng))
      && point.lat < ((prior.lat - current.lat) * (point.lng - current.lng)) / (prior.lng - current.lng) + current.lat;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isInsideZone(zone: Pick<ServiceZone, "centreLatitude" | "centreLongitude" | "radiusMeters" | "boundaryGeometry">, lat: number, lng: number) {
  const rings = polygonRings(zone.boundaryGeometry);
  if (rings.length) return pointInRing({ lat, lng }, rings[0]) && rings.slice(1).every((ring) => !pointInRing({ lat, lng }, ring));
  return distanceKm(lat, lng, zone.centreLatitude, zone.centreLongitude) * 1000 <= Number(zone.radiusMeters ?? 5000);
}

export async function getActiveDeliveryZones(lat?: number, lng?: number) {
  const rows = await db.select().from(serviceZonesTable).where(and(
    eq(serviceZonesTable.isActive, true),
    eq(serviceZonesTable.acceptingOrders, true),
    eq(serviceZonesTable.deliveryEnabled, true),
    isNull(serviceZonesTable.archivedAt),
  ));
  return rows.map((zone) => {
    const distance = validCoordinate(lat, lng) ? distanceKm(Number(lat), Number(lng), zone.centreLatitude, zone.centreLongitude) : null;
    return { ...zone, distanceKm: distance === null ? null : Number(distance.toFixed(2)), insideServiceZone: distance === null ? false : isInsideZone(zone, Number(lat), Number(lng)) };
  });
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
        insideServiceZone: distance === null ? false : isInsideZone(zone, Number(lat), Number(lng)),
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
    centreLatitude: zone.centreLatitude,
    centreLongitude: zone.centreLongitude,
    boundaryGeometry: zone.boundaryGeometry ?? null,
    zoneType: polygonRings(zone.boundaryGeometry).length ? "polygon" : "radius",
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
