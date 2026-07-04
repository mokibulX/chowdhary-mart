import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ordersTable, orderTrackingTable, deliveryPartnersTable, usersTable, storesTable, addressesTable } from "@workspace/db";
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

    let deliveryPartnerInfo = null;
    const latestTracking = timeline[0];
    if (latestTracking?.deliveryPartnerId) {
      const [dp] = await db.select().from(deliveryPartnersTable)
        .where(eq(deliveryPartnersTable.id, latestTracking.deliveryPartnerId)).limit(1);
      if (dp) {
        const [dpUser] = await db.select({ name: usersTable.name, phone: usersTable.phone })
          .from(usersTable).where(eq(usersTable.id, dp.userId)).limit(1);
        deliveryPartnerInfo = {
          id: dp.id,
          name: dpUser?.name ?? "Delivery Partner",
          phone: dpUser?.phone ?? null,
          rating: dp.rating,
          vehicleType: dp.vehicleType,
          vehicleNumber: dp.vehicleNumber,
          lat: dp.currentLat ?? store?.lat ?? 22.5726,
          lng: dp.currentLng ?? store?.lng ?? 88.3639,
        };
      }
    }

    const storeLocation = {
      lat: Number(store?.lat ?? 22.5726),
      lng: Number(store?.lng ?? 88.3639),
      label: store?.name ?? "Store hub",
      address: store?.address ?? "Pickup point",
    };
    const customerLocation = {
      lat: Number(address?.lat ?? (storeLocation.lat + 0.026)),
      lng: Number(address?.lng ?? (storeLocation.lng + 0.031)),
      label: address?.label ?? "Customer",
      address: address ? `${address.line1}, ${address.city}` : "Delivery address",
    };
    const partnerLocation = deliveryPartnerInfo
      ? { lat: Number((deliveryPartnerInfo as any).lat), lng: Number((deliveryPartnerInfo as any).lng) }
      : { lat: storeLocation.lat + 0.006, lng: storeLocation.lng + 0.004 };
    const distance = distanceKm(partnerLocation.lat, partnerLocation.lng, customerLocation.lat, customerLocation.lng);
    const eta = etaFromDistance(distance, order.status, order.estimatedDeliveryMins);

    res.json({
      orderId,
      status: order.status,
      deliveryPartner: deliveryPartnerInfo,
      storeLocation,
      customerLocation,
      partnerLocation,
      route: [storeLocation, partnerLocation, customerLocation],
      distanceKm: Number(distance.toFixed(1)),
      estimatedMins: eta,
      deliveryOtp: String(1000 + (order.id % 9000)),
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
