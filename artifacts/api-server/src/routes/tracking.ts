import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ordersTable, orderTrackingTable, deliveryPartnersTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/tracking/:orderId
router.get("/:orderId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);

    const [order] = await db.select().from(ordersTable)
      .where(eq(ordersTable.id, orderId)).limit(1);

    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const timeline = await db.select().from(orderTrackingTable)
      .where(eq(orderTrackingTable.orderId, orderId))
      .orderBy(desc(orderTrackingTable.updatedAt));

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
          lat: dp.currentLat,
          lng: dp.currentLng,
        };
      }
    }

    res.json({
      orderId,
      status: order.status,
      deliveryPartner: deliveryPartnerInfo,
      timeline: timeline.map(t => ({
        status: t.status,
        message: t.message,
        updatedAt: t.updatedAt,
      })),
      estimatedMins: order.estimatedDeliveryMins,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
