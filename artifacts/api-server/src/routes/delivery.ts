import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ordersTable, deliveryPartnersTable, liveLocationsTable, orderTrackingTable, storesTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("delivery_partner", "admin"));

async function getDP(userId: number) {
  const [dp] = await db.select().from(deliveryPartnersTable)
    .where(eq(deliveryPartnersTable.userId, userId)).limit(1);
  return dp;
}

// GET /api/delivery/orders
router.get("/orders", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(200).json([]); return; }

    const trackings = await db.select().from(orderTrackingTable)
      .where(eq(orderTrackingTable.deliveryPartnerId, dp.id));

    const orderIds = [...new Set(trackings.map(t => t.orderId))];
    if (orderIds.length === 0) { res.status(200).json([]); return; }

    const stores = await db.select().from(storesTable);
    const storeMap = new Map(stores.map(s => [s.id, s]));

    const orders = await Promise.all(orderIds.map(async id => {
      const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
      return order ? { ...order, store: storeMap.get(order.storeId) } : null;
    }));

    res.json(orders.filter(Boolean).sort((a: any, b: any) =>
      new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime()
    ));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/delivery/location
router.patch("/location", async (req: AuthRequest, res) => {
  try {
    const { lat, lng, speed, heading } = req.body as { lat: number; lng: number; speed?: number; heading?: number };
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }

    // Update current location on partner
    await db.update(deliveryPartnersTable)
      .set({ currentLat: lat, currentLng: lng })
      .where(eq(deliveryPartnersTable.id, dp.id));

    // Upsert live location
    const [existing] = await db.select().from(liveLocationsTable)
      .where(eq(liveLocationsTable.deliveryPartnerId, dp.id)).limit(1);

    if (existing) {
      await db.update(liveLocationsTable)
        .set({ lat, lng, speed: speed ?? 0, heading: heading ?? 0, updatedAt: new Date() })
        .where(eq(liveLocationsTable.deliveryPartnerId, dp.id));
    } else {
      await db.insert(liveLocationsTable).values({
        deliveryPartnerId: dp.id,
        lat, lng, speed: speed ?? 0, heading: heading ?? 0,
      });
    }

    res.json({ message: "Location updated" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/delivery/toggle-online
router.patch("/toggle-online", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }

    await db.update(deliveryPartnersTable)
      .set({ isOnline: !dp.isOnline })
      .where(eq(deliveryPartnersTable.id, dp.id));

    res.json({ message: `Now ${!dp.isOnline ? "online" : "offline"}` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
