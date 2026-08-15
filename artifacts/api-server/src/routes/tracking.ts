import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ordersTable, orderTrackingTable, deliveryPartnersTable, usersTable, storesTable, addressesTable, liveLocationsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();

function distanceKm(aLat?: number | null, aLng?: number | null, bLat?: number | null, bLng?: number | null): number {
  if ([aLat, aLng, bLat, bLng].some(v => v === null || v === undefined || Number.isNaN(Number(v)))) return 3.2;
  const toRad = (value: number) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(Number(bLat) - Number(aLat));
  const dLng = toRad(Number(bLng) - Number(aLng));
  const lat1 = toRad(Number(aLat));
  const lat2 = toRad(Number(bLat));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

function etaFromDistance(distance: number, status: string, fallback?: number | null) {
  if (status === "delivered") return 0;
  if (["pending", "confirmed", "preparing", "packed"].includes(status)) return Math.min(40, Math.max(18, fallback ?? 40));
  return Math.min(40, Math.max(4, Math.ceil(distance / 0.32) + 5));
}

function locationOrNull(lat?: number | string | null, lng?: number | string | null) {
  const nextLat = Number(lat);
  const nextLng = Number(lng);
  if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return null;
  return { lat: nextLat, lng: nextLng };
}

// GET /api/tracking/:orderId
router.get("/:orderId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);

    const [order] = await db.select().from(ordersTable)
      .where(eq(ordersTable.id, orderId)).limit(1);

    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const [[store], [address], timeline] = await Promise.all([
      db.select().from(storesTable).where(eq(storesTable.id, order.storeId)).limit(1),
      order.addressId ? db.select().from(addressesTable).where(eq(addressesTable.id, order.addressId)).limit(1) : Promise.resolve([null]),
      db.select().from(orderTrackingTable)
      .where(eq(orderTrackingTable.orderId, orderId))
      .orderBy(desc(orderTrackingTable.updatedAt)),
    ]);

    const latestTracking = timeline[0];
    if (req.user!.role === "customer" && order.userId !== req.user!.userId) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (req.user!.role === "vendor" && store?.userId !== req.user!.userId) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (req.user!.role === "delivery_partner") {
      const [dpForUser] = await db.select().from(deliveryPartnersTable)
        .where(eq(deliveryPartnersTable.userId, req.user!.userId)).limit(1);
      if (!dpForUser || latestTracking?.deliveryPartnerId !== dpForUser.id) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
    }

    let deliveryPartnerInfo = null;
    let latestLiveLocation = null as null | typeof liveLocationsTable.$inferSelect;
    if (latestTracking?.deliveryPartnerId) {
      const [dp] = await db.select().from(deliveryPartnersTable)
        .where(eq(deliveryPartnersTable.id, latestTracking.deliveryPartnerId)).limit(1);
      if (dp) {
        const [liveLocation] = await db.select().from(liveLocationsTable)
          .where(eq(liveLocationsTable.deliveryPartnerId, dp.id)).limit(1);
        latestLiveLocation = liveLocation ?? null;
        const [dpUser] = await db.select({ name: usersTable.name, phone: usersTable.phone, avatarUrl: usersTable.avatarUrl })
          .from(usersTable).where(eq(usersTable.id, dp.userId)).limit(1);
        deliveryPartnerInfo = {
          id: dp.id,
          name: dpUser?.name ?? "Delivery Partner",
          phone: dpUser?.phone ?? null,
          photoUrl: dpUser?.avatarUrl ?? null,
          publicProfilePhotoUrl: dpUser?.avatarUrl ?? null,
          rating: dp.rating,
          vehicleType: dp.vehicleType,
          vehicleNumber: dp.vehicleNumber,
          location: latestLiveLocation ? {
            lat: latestLiveLocation.lat,
            lng: latestLiveLocation.lng,
            speed: latestLiveLocation.speed,
            heading: latestLiveLocation.heading,
            updatedAt: latestLiveLocation.updatedAt,
          } : locationOrNull(dp.currentLat, dp.currentLng),
        };
      }
    }

    const storeCoords = locationOrNull(store?.lat, store?.lng);
    const customerCoords = locationOrNull(order.pickupLatitude, order.pickupLongitude) ?? locationOrNull(address?.lat, address?.lng);
    const partnerCoords = latestLiveLocation
      ? locationOrNull(latestLiveLocation.lat, latestLiveLocation.lng)
      : deliveryPartnerInfo?.location
        ? locationOrNull((deliveryPartnerInfo as any).location.lat, (deliveryPartnerInfo as any).location.lng)
        : locationOrNull(latestTracking?.lat, latestTracking?.lng);

    const storeLocation = storeCoords ? {
      ...storeCoords,
      label: store?.name ?? "Store hub",
      address: store?.address ?? "Pickup point",
    } : null;
    const customerLocation = customerCoords ? {
      ...customerCoords,
      label: (order.addressSnapshot as Record<string, unknown> | null)?.name as string ?? address?.label ?? "Customer",
      address: order.pickupAddress ?? (address ? `${address.line1}, ${address.city}` : "Delivery address"),
    } : null;
    const partnerLocation = partnerCoords ? {
      ...partnerCoords,
      speed: latestLiveLocation?.speed ?? 0,
      heading: latestLiveLocation?.heading ?? 0,
      updatedAt: latestLiveLocation?.updatedAt ?? latestTracking?.updatedAt,
    } : null;
    const distance = partnerLocation && customerLocation
      ? distanceKm(partnerLocation.lat, partnerLocation.lng, customerLocation.lat, customerLocation.lng)
      : null;
    const eta = distance !== null ? etaFromDistance(distance, order.status, order.estimatedDeliveryMins) : (order.estimatedDeliveryMins ?? null);

    res.json({
      orderId,
      status: order.status,
      deliveryPartner: deliveryPartnerInfo,
      storeLocation,
      customerLocation,
      partnerLocation,
      route: [storeLocation, partnerLocation, customerLocation].filter(Boolean),
      distanceKm: distance === null ? null : Number(distance.toFixed(1)),
      estimatedMins: eta,
      deliveryOtp: String(1000 + (order.id % 9000)),
      riderHeading: latestLiveLocation?.heading ?? 0,
      speed: latestLiveLocation?.speed ?? 0,
      lastLocationUpdatedAt: latestLiveLocation?.updatedAt ?? latestTracking?.updatedAt,
      timeline: timeline.map(t => ({
        status: t.status,
        message: t.message,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
