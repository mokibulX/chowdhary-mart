import { Router } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db, ordersTable, orderItemsTable, orderTrackingTable,
  cartItemsTable, cartsTable, productsTable, storesTable,
  addressesTable, usersTable, couponUsesTable, couponsTable,
  walletTransactionsTable, reviewsTable
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { generateOrderNumber } from "../lib/auth";

const router = Router();

router.use(requireAuth);

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

async function enrichOrder(order: typeof ordersTable.$inferSelect) {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId)).limit(1);
  return { ...order, store };
}

// GET /api/orders
router.get("/", async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;
    const { status } = req.query;

    const conditions = [eq(ordersTable.userId, req.user!.userId)];
    if (status) conditions.push(eq(ordersTable.status, status as typeof ordersTable.$inferSelect["status"]));

    const orders = await db.select().from(ordersTable)
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit).offset(offset);

    const enriched = await Promise.all(orders.map(enrichOrder));
    res.json(enriched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/orders — place order from cart
router.post("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { addressId, paymentMethod, couponCode, useWallet, notes } = req.body as {
      addressId: number;
      paymentMethod: "cod" | "online" | "wallet" | "upi";
      couponCode?: string;
      useWallet?: boolean;
      notes?: string;
    };

    // Get cart
    const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.userId, userId)).limit(1);
    if (!cart || !cart.storeId) {
      res.status(400).json({ error: "Cart is empty" });
      return;
    }

    const cartItems = await db.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
    if (cartItems.length === 0) {
      res.status(400).json({ error: "Cart is empty" });
      return;
    }

    // Get store and address
    const [[store], [address]] = await Promise.all([
      db.select().from(storesTable).where(eq(storesTable.id, cart.storeId)).limit(1),
      db.select().from(addressesTable).where(eq(addressesTable.id, addressId)).limit(1),
    ]);

    if (!store) { res.status(400).json({ error: "Store not found" }); return; }
    if (!address) { res.status(400).json({ error: "Address not found" }); return; }

    // Compute subtotal
    const productIds = cartItems.map(i => i.productId);
    const products = await db.select().from(productsTable).where(inArray(productsTable.id, productIds));
    const productMap = new Map(products.map(p => [p.id, p]));

    let subtotal = 0;
    const orderItemsData = cartItems.map(item => {
      const product = productMap.get(item.productId)!;
      const lineTotal = safeNum(item.price) * item.qty;
      subtotal += lineTotal;
      return {
        productId: item.productId,
        name: product.name,
        imageUrl: Array.isArray(product.images) ? (product.images as string[])[0] : null,
        price: item.price,
        mrp: product.mrp,
        qty: item.qty,
        total: lineTotal.toFixed(2),
      };
    });

    const deliveryFee = subtotal >= safeNum(store.freeDeliveryAbove, 299) ? 0 : safeNum(store.deliveryFee, 49);

    // Coupon
    let couponDiscount = 0;
    let coupon = null;
    if (couponCode) {
      [coupon] = await db.select().from(couponsTable)
        .where(and(eq(couponsTable.code, couponCode.toUpperCase()), eq(couponsTable.isActive, true)))
        .limit(1);
      if (coupon) {
        if (coupon.discountType === "percent") {
          couponDiscount = (subtotal * safeNum(coupon.discountValue)) / 100;
          if (coupon.maxDiscount) couponDiscount = Math.min(couponDiscount, safeNum(coupon.maxDiscount));
        } else {
          couponDiscount = safeNum(coupon.discountValue);
        }
        couponDiscount = Math.min(couponDiscount, subtotal);
      }
    }

    // Wallet
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    let walletUsed = 0;
    if (useWallet && user) {
      walletUsed = Math.min(safeNum(user.walletBalance), subtotal + deliveryFee - couponDiscount);
      walletUsed = Math.max(0, walletUsed);
    }

    const total = Math.max(0, subtotal + deliveryFee - couponDiscount - walletUsed);
    const loyaltyEarned = Math.floor(total / 10); // 1 point per ₹10

    // Create order
    const [order] = await db.insert(ordersTable).values({
      orderNumber: generateOrderNumber(),
      userId,
      storeId: cart.storeId,
      addressId,
      addressSnapshot: { line1: address.line1, city: address.city, pincode: address.pincode, name: address.name },
      status: "confirmed",
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "pending" : "paid",
      subtotal: subtotal.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      discount: "0.00",
      couponCode: couponCode ?? null,
      couponDiscount: couponDiscount.toFixed(2),
      walletUsed: walletUsed.toFixed(2),
      total: total.toFixed(2),
      loyaltyPointsEarned: loyaltyEarned,
      estimatedDeliveryMins: store.estimatedDeliveryMins ?? 30,
      notes,
    }).returning();

    // Insert order items
    await db.insert(orderItemsTable).values(
      orderItemsData.map(item => ({ ...item, orderId: order.id }))
    );

    // Insert tracking event
    await db.insert(orderTrackingTable).values({
      orderId: order.id,
      status: "confirmed",
      message: "Order confirmed by store",
    });

    // Clear cart
    await db.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));

    // Update wallet and loyalty
    if (walletUsed > 0 && user) {
      const newBalance = safeNum(user.walletBalance) - walletUsed;
      await db.update(usersTable)
        .set({ walletBalance: newBalance.toFixed(2) })
        .where(eq(usersTable.id, userId));
      await db.insert(walletTransactionsTable).values({
        userId,
        type: "debit",
        amount: walletUsed.toFixed(2),
        balance: newBalance.toFixed(2),
        description: `Used for order #${order.orderNumber}`,
        referenceId: String(order.id),
        referenceType: "order",
      });
    }

    if (loyaltyEarned > 0 && user) {
      await db.update(usersTable)
        .set({ loyaltyPoints: user.loyaltyPoints + loyaltyEarned })
        .where(eq(usersTable.id, userId));
    }

    // Mark coupon used
    if (coupon) {
      await db.insert(couponUsesTable).values({
        couponId: coupon.id,
        userId,
        orderId: order.id,
        discountApplied: couponDiscount.toFixed(2),
      });
      await db.update(couponsTable)
        .set({ usedCount: (coupon.usedCount ?? 0) + 1 })
        .where(eq(couponsTable.id, coupon.id));
    }

    const [storeData] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId)).limit(1);
    res.status(201).json({ ...order, store: storeData });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/orders/:orderId
router.get("/:orderId", async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.user!.userId)))
      .limit(1);

    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const [items, [store], [address], tracking] = await Promise.all([
      db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId)),
      db.select().from(storesTable).where(eq(storesTable.id, order.storeId)).limit(1),
      order.addressId ? db.select().from(addressesTable).where(eq(addressesTable.id, order.addressId)).limit(1) : Promise.resolve([null]),
      db.select().from(orderTrackingTable).where(eq(orderTrackingTable.orderId, orderId)).orderBy(desc(orderTrackingTable.updatedAt)),
    ]);

    res.json({
      ...order,
      items,
      store,
      address,
      tracking: {
        orderId,
        status: order.status,
        timeline: tracking.map(t => ({ status: t.status, message: t.message, updatedAt: t.updatedAt })),
        estimatedMins: order.estimatedDeliveryMins,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/orders/:orderId/cancel
router.post("/:orderId/cancel", async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { reason } = req.body as { reason: string };
    const userId = req.user!.userId;

    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)))
      .limit(1);

    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (["delivered", "cancelled"].includes(order.status)) {
      res.status(400).json({ error: "Order cannot be cancelled" });
      return;
    }

    const [updated] = await db.update(ordersTable)
      .set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: reason, updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId))
      .returning();

    await db.insert(orderTrackingTable).values({
      orderId,
      status: "cancelled",
      message: `Cancelled: ${reason}`,
    });

    // Refund wallet if used
    if (safeNum(order.walletUsed) > 0) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      const newBalance = safeNum(user?.walletBalance ?? "0") + safeNum(order.walletUsed);
      await db.update(usersTable)
        .set({ walletBalance: newBalance.toFixed(2) })
        .where(eq(usersTable.id, userId));
      await db.insert(walletTransactionsTable).values({
        userId,
        type: "credit",
        amount: order.walletUsed!,
        balance: newBalance.toFixed(2),
        description: `Refund for cancelled order #${order.orderNumber}`,
        referenceId: String(orderId),
        referenceType: "refund",
      });
    }

    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, updated.storeId)).limit(1);
    res.json({ ...updated, store });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/orders/:orderId/review
router.post("/:orderId/review", async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { productId, rating, title, body: reviewBody, images } = req.body as {
      productId: number;
      rating: number;
      title?: string;
      body?: string;
      images?: string[];
    };
    const userId = req.user!.userId;

    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)))
      .limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const [review] = await db.insert(reviewsTable).values({
      userId,
      productId,
      orderId,
      rating,
      title: title ?? null,
      body: reviewBody ?? null,
      images: images ?? [],
      isVerifiedPurchase: 1,
    }).returning();

    // Update product rating
    const allReviews = await db.select({ rating: reviewsTable.rating })
      .from(reviewsTable).where(eq(reviewsTable.productId, productId));
    const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
    await db.update(productsTable)
      .set({ rating: avg.toFixed(2), reviewCount: allReviews.length })
      .where(eq(productsTable.id, productId));

    res.status(201).json(review);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
