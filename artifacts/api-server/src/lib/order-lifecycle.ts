import { and, eq, inArray, sql } from "drizzle-orm";
import { db, orderItemsTable, ordersTable, orderTrackingTable, productsTable } from "@workspace/db";
import { createAndPushNotification } from "./push-service";

export const SELLER_DECISION_MS = 5 * 60_000;
export const SELLER_PREPARATION_MS = 10 * 60_000;
export const RIDER_PICKUP_MS = 5 * 60_000;

export function pickupOtp(orderId: number) {
  return String(2000 + (orderId % 8000));
}

export function deliveryOtp(orderId: number) {
  return String(1000 + (orderId % 9000));
}

export async function expireOrderIfNeeded(order: typeof ordersTable.$inferSelect) {
  if (["cancelled", "delivered", "picked_up", "on_the_way", "arriving"].includes(order.status)) return order;
  const tracking = await db.select().from(orderTrackingTable).where(eq(orderTrackingTable.orderId, order.id));
  const sellerAccepted = tracking.find((item) => item.message?.includes("Seller accepted"));
  const riderAccepted = tracking.find((item) => item.message?.includes("Delivery partner accepted"));
  const now = Date.now();
  let reason = "";
  // Keep the pending order visible throughout the seller's five-minute
  // decision window. Refreshing the page does not shorten that window.
  if (order.status === "pending" && now > new Date(order.createdAt).getTime() + SELLER_DECISION_MS) {
    reason = "Seller did not respond within 5 minutes";
  } else if (["confirmed", "preparing"].includes(order.status) && sellerAccepted && now > new Date(sellerAccepted.updatedAt).getTime() + SELLER_PREPARATION_MS) {
    reason = "Seller did not mark the order ready within 10 minutes";
  } else if (["confirmed", "preparing", "packed"].includes(order.status) && riderAccepted && now > new Date(riderAccepted.updatedAt).getTime() + RIDER_PICKUP_MS) {
    reason = "Delivery partner did not complete pickup within 5 minutes";
  }
  if (!reason) return order;

  const [cancelled] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(ordersTable).set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason,
      updatedAt: new Date(),
    }).where(and(eq(ordersTable.id, order.id), sql`${ordersTable.status} <> 'cancelled'`)).returning();
    if (!updated) return [];
    const items = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    for (const item of items) {
      if (item.productId) await tx.update(productsTable).set({ stock: sql`${productsTable.stock} + ${item.qty}`, updatedAt: new Date() }).where(eq(productsTable.id, item.productId));
    }
    await tx.insert(orderTrackingTable).values({ orderId: order.id, status: "cancelled", message: `Automatically cancelled: ${reason}` });
    return [updated];
  });
  if (!cancelled) return order;
  try {
    await createAndPushNotification({
      userId: order.userId,
      type: "order_cancelled",
      title: "Order automatically cancelled",
      body: `Order #${order.orderNumber}: ${reason}.`,
      data: { orderId: order.id, status: "cancelled" },
    });
  } catch {
    // Cancellation remains authoritative even when a push provider is unavailable.
  }
  return cancelled;
}

export async function lifecycleMeta(order: typeof ordersTable.$inferSelect) {
  const tracking = await db.select().from(orderTrackingTable).where(eq(orderTrackingTable.orderId, order.id));
  const sellerAccepted = tracking.find((item) => item.message?.includes("Seller accepted"));
  const riderAccepted = tracking.find((item) => item.message?.includes("Delivery partner accepted"));
  return {
    sellerDecisionDeadline: new Date(new Date(order.createdAt).getTime() + SELLER_DECISION_MS).toISOString(),
    preparationDeadline: sellerAccepted ? new Date(new Date(sellerAccepted.updatedAt).getTime() + SELLER_PREPARATION_MS).toISOString() : null,
    pickupDeadline: riderAccepted ? new Date(new Date(riderAccepted.updatedAt).getTime() + RIDER_PICKUP_MS).toISOString() : null,
    pickupOtp: pickupOtp(order.id),
    deliveryOtp: deliveryOtp(order.id),
    assignedDeliveryPartnerId: riderAccepted?.deliveryPartnerId ?? null,
  };
}

let sweepRunning = false;
export async function sweepExpiredOrders() {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const active = await db.select().from(ordersTable).where(inArray(ordersTable.status, ["pending", "confirmed", "preparing", "packed"]));
    for (const order of active) await expireOrderIfNeeded(order);
  } finally {
    sweepRunning = false;
  }
}
