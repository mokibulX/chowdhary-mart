import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, orderItemsTable, ordersTable, returnsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();
const LATE_DELIVERY_RETURN_MS = 60 * 60_000;

router.use(requireAuth);

function isReturnEligible(order: typeof ordersTable.$inferSelect) {
  if (["cancelled", "returned"].includes(order.status)) return false;
  return order.status === "delivered"
    || Date.now() - new Date(order.createdAt).getTime() >= LATE_DELIVERY_RETURN_MS;
}

async function presentReturn(item: typeof returnsTable.$inferSelect) {
  const [orderItem] = await db.select().from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, item.orderId))
    .limit(1);
  const [order] = await db.select({ orderNumber: ordersTable.orderNumber })
    .from(ordersTable).where(eq(ordersTable.id, item.orderId)).limit(1);
  return {
    ...item,
    orderNumber: order?.orderNumber,
    productId: orderItem?.productId,
    productName: orderItem?.name,
    imageUrl: orderItem?.imageUrl,
    timeline: [{ status: item.status, message: "Return request submitted", updatedAt: item.createdAt }],
  };
}

router.get("/", async (req: AuthRequest, res) => {
  try {
    const items = await db.select().from(returnsTable)
      .where(eq(returnsTable.userId, req.user!.userId))
      .orderBy(desc(returnsTable.createdAt));
    res.json(await Promise.all(items.map(presentReturn)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Unable to load return requests." });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.body?.orderId);
    const reason = String(req.body?.reason ?? "").trim();
    if (!Number.isInteger(orderId) || !reason) {
      res.status(400).json({ error: "Order and return reason are required." });
      return;
    }

    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.user!.userId)))
      .limit(1);
    if (!order) { res.status(404).json({ error: "Order not found." }); return; }
    if (!isReturnEligible(order)) {
      res.status(400).json({ error: "This order is not eligible for a return request yet." });
      return;
    }

    const [existing] = await db.select({ id: returnsTable.id })
      .from(returnsTable)
      .where(and(eq(returnsTable.orderId, orderId), eq(returnsTable.userId, req.user!.userId)))
      .limit(1);
    if (existing) { res.status(409).json({ error: "A return request already exists for this order." }); return; }

    const [item] = await db.select().from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, orderId)).limit(1);
    const [created] = await db.insert(returnsTable).values({
      orderId,
      userId: req.user!.userId,
      reason,
      status: "pending",
      refundAmount: item?.total ?? order.total,
      refundMethod: "original_payment_method",
    }).returning();
    res.status(201).json(await presentReturn(created));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Unable to submit the return request." });
  }
});

export default router;
