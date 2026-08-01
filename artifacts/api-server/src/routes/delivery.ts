import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, ordersTable, deliveryPartnersTable, liveLocationsTable, orderTrackingTable, storesTable, activeDeliveryLocationsTable, deliveryTrackingHistoryTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";
import { riderZoneIds, isInsideZone } from "../lib/zones";

const router = Router();

router.use(requireAuth, requireRole("delivery_partner", "admin"));

async function getDP(userId: number) {
  const [dp] = await db.select().from(deliveryPartnersTable)
    .where(eq(deliveryPartnersTable.userId, userId)).limit(1);
  return dp;
}

async function getLatestAssignedTracking(orderId: number) {
  const rows = await db.select().from(orderTrackingTable)
    .where(eq(orderTrackingTable.orderId, orderId))
    .orderBy(desc(orderTrackingTable.updatedAt))
    .limit(25);
  return rows.find(row => row.deliveryPartnerId !== null) ?? null;
}

function isRejectedTracking(message?: string | null) {
  return message?.toLowerCase().includes("rejected") ?? false;
}

async function assertDeliveryAssignment(orderId: number, deliveryPartnerId: number) {
  const latestAssigned = await getLatestAssignedTracking(orderId);
  if (!latestAssigned || isRejectedTracking(latestAssigned.message)) return false;
  return latestAssigned.deliveryPartnerId === deliveryPartnerId;
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
      const store = order ? storeMap.get(order.storeId) : null;
      return order ? {
        ...order,
        store,
        liveTracking: {
          orderId: order.id,
          status: order.status,
          estimatedMins: order.estimatedDeliveryMins ?? 40,
          storeLocation: store ? { lat: store.lat, lng: store.lng, label: store.name, address: store.address } : null,
          customerLocation: order.pickupLatitude && order.pickupLongitude ? {
            lat: Number(order.pickupLatitude),
            lng: Number(order.pickupLongitude),
            label: "Customer pickup location",
            address: order.pickupAddress ?? "Confirmed pickup point",
          } : null,
        },
      } : null;
    }));

    res.json(orders.filter(Boolean).sort((a: any, b: any) =>
      new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime()
    ));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/delivery/available-orders
router.get("/available-orders", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp || !dp.isVerified || !dp.isOnline) { res.status(200).json([]); return; }
    const zones = await riderZoneIds(req.user!.userId);
    if (!zones.length) { res.status(200).json([]); return; }
    const orders = await db.select().from(ordersTable)
      .where(eq(ordersTable.status, "confirmed"))
      .orderBy(desc(ordersTable.createdAt))
      .limit(30);
    const stores = await db.select().from(storesTable);
    const storeMap = new Map(stores.map(s => [s.id, s]));
    res.json(orders
      .filter((order) => !order.zoneId || zones.includes(order.zoneId))
      .map(order => {
        const store = storeMap.get(order.storeId);
        return {
          ...order,
          store,
          liveTracking: {
            orderId: order.id,
            status: order.status,
            estimatedMins: order.estimatedDeliveryMins ?? 40,
            storeLocation: store ? { lat: store.lat, lng: store.lng, label: store.name, address: store.address } : null,
            customerLocation: order.pickupLatitude && order.pickupLongitude ? {
              lat: Number(order.pickupLatitude),
              lng: Number(order.pickupLongitude),
              label: "Customer pickup location",
              address: order.pickupAddress ?? "Confirmed pickup point",
            } : null,
          },
        };
      }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/delivery/orders/:orderId/accept
router.post("/orders/:orderId/accept", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    const orderId = Number(req.params.orderId);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (!dp.isVerified || !dp.isOnline) { res.status(403).json({ error: "Delivery partner must be approved and online." }); return; }
    const zones = await riderZoneIds(req.user!.userId);
    if (order.zoneId && !zones.includes(order.zoneId)) { res.status(403).json({ error: "This order belongs to another service zone." }); return; }
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId)).limit(1);
    if (store?.zoneId && !zones.includes(store.zoneId)) { res.status(403).json({ error: "Pickup store is outside your service zone." }); return; }

    const latestAssigned = await getLatestAssignedTracking(orderId);
    if (latestAssigned && !isRejectedTracking(latestAssigned.message) && latestAssigned.deliveryPartnerId !== dp.id) {
      res.status(409).json({ error: "This order has already been accepted by another delivery partner." });
      return;
    }

    await db.insert(orderTrackingTable).values({
      orderId,
      deliveryPartnerId: dp.id,
      status: order.status,
      message: "Delivery partner accepted the order",
      lat: dp.currentLat,
      lng: dp.currentLng,
    });

    res.json({ ...order, riderZoneId: order.zoneId ?? dp.currentZoneId, assignedDeliveryPartnerId: dp.id });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/delivery/orders/:orderId/reject
router.post("/orders/:orderId/reject", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    const orderId = Number(req.params.orderId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    const zones = await riderZoneIds(req.user!.userId);
    if (order.zoneId && !zones.includes(order.zoneId)) {
      res.status(403).json({ error: "This order belongs to another service zone." });
      return;
    }
    await db.insert(orderTrackingTable).values({
      orderId,
      deliveryPartnerId: dp.id,
      status: "confirmed",
      message: "Delivery partner rejected the order",
    });
    res.json({ message: "Order rejected" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/delivery/orders/:orderId/status
router.patch("/orders/:orderId/status", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    const orderId = Number(req.params.orderId);
    const { status } = req.body as { status: "picked_up" | "on_the_way" | "delivered" };
    const [targetOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    const zones = await riderZoneIds(req.user!.userId);
    if (!targetOrder || (targetOrder.zoneId && !zones.includes(targetOrder.zoneId))) { res.status(403).json({ error: "This order belongs to another service zone." }); return; }
    if (!(await assertDeliveryAssignment(orderId, dp.id))) {
      res.status(403).json({ error: "This order is not assigned to this delivery partner." });
      return;
    }

    const update: Partial<typeof ordersTable.$inferInsert> = { status, riderZoneId: targetOrder.zoneId ?? dp.currentZoneId ?? null, updatedAt: new Date() };
    if (status === "delivered") update.deliveredAt = new Date();

    const [order] = await db.update(ordersTable)
      .set(update)
      .where(eq(ordersTable.id, orderId))
      .returning();

    await db.insert(orderTrackingTable).values({
      orderId,
      deliveryPartnerId: dp.id,
      status,
      message: `Delivery partner marked ${status.replace(/_/g, " ")}`,
      lat: dp.currentLat,
      lng: dp.currentLng,
    });

    res.json(order);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/delivery/location
router.patch("/location", async (req: AuthRequest, res) => {
  try {
    const { lat, lng, speed, heading, accuracy, altitude, timestamp, orderId, zoneId } = req.body as {
      lat: number;
      lng: number;
      speed?: number;
      heading?: number;
      accuracy?: number;
      altitude?: number;
      timestamp?: string;
      orderId?: number;
      zoneId?: number;
    };
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    if (orderId && !(await assertDeliveryAssignment(Number(orderId), dp.id))) {
      res.status(403).json({ error: "Cannot update location for an order assigned to another delivery partner." });
      return;
    }

    // Update current location on partner
    await db.update(deliveryPartnersTable)
      .set({ currentLat: lat, currentLng: lng, currentZoneId: zoneId ?? dp.currentZoneId ?? null })
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

    const activeRows = await db.select().from(activeDeliveryLocationsTable)
      .where(eq(activeDeliveryLocationsTable.deliveryPartnerId, dp.id)).limit(1);
    if (activeRows[0]) {
      await db.update(activeDeliveryLocationsTable)
        .set({
          orderId: orderId ?? activeRows[0].orderId,
          latitude: lat,
          longitude: lng,
          speed: speed ?? 0,
          heading: heading ?? 0,
          accuracy: accuracy ?? null,
          altitude: altitude ?? null,
          zoneId: zoneId ?? activeRows[0].zoneId,
          status: "online",
          updatedAt: new Date(),
        })
        .where(eq(activeDeliveryLocationsTable.deliveryPartnerId, dp.id));
    } else {
      await db.insert(activeDeliveryLocationsTable).values({
        orderId: orderId ?? null,
        deliveryPartnerId: dp.id,
        latitude: lat,
        longitude: lng,
        speed: speed ?? 0,
        heading: heading ?? 0,
        accuracy: accuracy ?? null,
        altitude: altitude ?? null,
        zoneId: zoneId ?? null,
        status: "online",
      });
    }

    await db.insert(deliveryTrackingHistoryTable).values({
      orderId: orderId ?? null,
      deliveryPartnerId: dp.id,
      latitude: lat,
      longitude: lng,
      speed: speed ?? 0,
      heading: heading ?? 0,
      accuracy: accuracy ?? null,
      altitude: altitude ?? null,
      source: "gps",
      recordedAt: timestamp ? new Date(timestamp) : new Date(),
    });

    const payload = {
      deliveryPartnerId: dp.id,
      orderId: orderId ?? null,
      lat,
      lng,
      speed: speed ?? 0,
      heading: heading ?? 0,
      accuracy: accuracy ?? null,
      altitude: altitude ?? null,
      timestamp: timestamp ?? new Date().toISOString(),
    };

    const io = req.app.get("io");
    io?.to(`rider:location:${dp.id}`).emit("rider:location", payload);
    if (orderId) io?.to(`delivery:tracking:${orderId}`).emit("delivery:tracking", payload);
    if (zoneId) io?.to(`zone:riders:${zoneId}`).emit("zone:riders", payload);

    res.json({ message: "Location updated", location: payload });
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
    if (!dp.isVerified) { res.status(403).json({ error: "Admin approval required before going online." }); return; }
    const nextOnline = !dp.isOnline;
    const location = req.body?.location;
    const updates: Partial<typeof deliveryPartnersTable.$inferInsert> = { isOnline: nextOnline };
    if (nextOnline && location) {
      updates.currentLat = Number(location.lat);
      updates.currentLng = Number(location.lng);
    }

    const [updated] = await db.update(deliveryPartnersTable)
      .set(updates)
      .where(eq(deliveryPartnersTable.id, dp.id))
      .returning();
    if (!nextOnline) {
      await db.delete(activeDeliveryLocationsTable).where(eq(activeDeliveryLocationsTable.deliveryPartnerId, dp.id));
    }

    res.json({ message: `Now ${nextOnline ? "online" : "offline"}`, isOnline: nextOnline, partner: updated });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
