import { Router } from "express";
import { eq, and, desc, inArray, gte, sql } from "drizzle-orm";
import {
  db, ordersTable, orderItemsTable, orderTrackingTable,
  cartItemsTable, cartsTable, productsTable, storesTable,
  addressesTable, usersTable, couponUsesTable, couponsTable,
  paymentsTable,
  walletTransactionsTable, reviewsTable, deliveryPartnersTable,
  outboxEventsTable, inventoryLedgerTable
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { generateOrderNumber } from "../lib/auth";
import { getEligibleRegistrationZones } from "../lib/zones";
import { beginIdempotency, getIdempotencyKey, requestHash, saveIdempotencyResponse } from "../lib/idempotency";
import { validateCouponForUser } from "../lib/coupons";
import { createAndPushNotification } from "../lib/push-service";
import { deliveryOtp } from "../lib/order-lifecycle";
import { calculateOrderPricing, ensurePricingSchema, getPricingSettings } from "../lib/pricing";

const router = Router();

router.use(requireAuth);

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function distanceKm(aLat?: number | null, aLng?: number | null, bLat?: number | null, bLng?: number | null): number {
  if ([aLat, aLng, bLat, bLng].some(v => v === null || v === undefined || Number.isNaN(Number(v)))) return 9999;
  const toRad = (value: number) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(Number(bLat) - Number(aLat));
  const dLng = toRad(Number(bLng) - Number(aLng));
  const lat1 = toRad(Number(aLat));
  const lat2 = toRad(Number(bLat));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

async function assignNearestPartner(store: typeof storesTable.$inferSelect) {
  const partners = await db.select().from(deliveryPartnersTable);
  if (!partners.length) return null;
  const available = partners.filter(partner => partner.isOnline && partner.isVerified);
  const pool = available;
  return pool.sort((a, b) =>
    distanceKm(a.currentLat, a.currentLng, store.lat, store.lng) -
    distanceKm(b.currentLat, b.currentLng, store.lat, store.lng)
  )[0] ?? null;
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
    await ensurePricingSchema();
    const userId = req.user!.userId;
    const idempotencyKey = getIdempotencyKey(req.headers);
    if (!idempotencyKey) {
      res.status(400).json({ error: "Idempotency-Key header is required for checkout." });
      return;
    }
    const endpoint = "POST /api/orders";
    const hash = requestHash(req.body);
    const replay = await beginIdempotency(idempotencyKey, userId, endpoint, hash);
    if (replay.state === "claimed") {
      // This request owns the idempotency slot and may continue.
    } else
    if (replay.state === "replay") {
      res.status(replay.status).json(replay.body);
      return;
    }
    if (replay.state === "conflict" || replay.state === "processing") {
      res.status(replay.state === "conflict" ? 409 : 425).json({ error: replay.message });
      return;
    }
    const { addressId, paymentMethod, couponCode, useWallet, notes, pickupLatitude, pickupLongitude, pickupAddress, providerPaymentId } = req.body as {
      addressId: number;
      paymentMethod: "cod" | "online" | "wallet" | "upi";
      couponCode?: string;
      useWallet?: boolean;
      notes?: string;
      pickupLatitude?: number;
      pickupLongitude?: number;
      pickupAddress?: string;
      providerPaymentId?: string;
    };

    const result = await db.transaction(async (tx) => {
    // Get cart
    const [cart] = await tx.select().from(cartsTable).where(eq(cartsTable.userId, userId)).limit(1);
    if (!cart || !cart.storeId) {
      return { status: 400, body: { error: "Cart is empty" } };
    }

    const cartItems = await tx.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
    if (cartItems.length === 0) {
      return { status: 400, body: { error: "Cart is empty" } };
    }

    // Get store and address
    const [[store], [address]] = await Promise.all([
      tx.select().from(storesTable).where(eq(storesTable.id, cart.storeId)).limit(1),
      tx.select().from(addressesTable).where(eq(addressesTable.id, addressId)).limit(1),
    ]);

    if (!store) return { status: 400, body: { error: "Store not found" } };
    if (!address) return { status: 400, body: { error: "Address not found" } };
    if (!store.isActive || !store.isOpen || store.holidayMode) return { status: 400, body: { error: "This seller is not active right now." } };
    const pricingSettings = await getPricingSettings();
    const selectedLat = Number(pickupLatitude ?? address.lat);
    const selectedLng = Number(pickupLongitude ?? address.lng);
    const selectedAddress = String(pickupAddress ?? "").trim();
    if (!Number.isFinite(selectedLat) || !Number.isFinite(selectedLng) || !selectedAddress) {
      return { status: 400, body: { error: "Please confirm your exact delivery location on the map before placing the order." } };
    }
    const configuredMaxDistance = safeNum(pricingSettings.maxDeliveryDistanceKm, 0);
    const serviceRadiusKm = configuredMaxDistance > 0
      ? Math.min(Math.max(0.1, safeNum(store.radiusKm, configuredMaxDistance)), configuredMaxDistance)
      : Math.max(0.1, safeNum(store.radiusKm, 5));
    const shopDistanceKm = distanceKm(store.lat, store.lng, selectedLat, selectedLng);
    if (shopDistanceKm > serviceRadiusKm) {
      return { status: 400, body: { error: `Sorry! We currently deliver only within ${serviceRadiusKm.toFixed(0)} KM of this seller.` } };
    }
    const customerZones = await getEligibleRegistrationZones("seller", selectedLat, selectedLng);
    const customerZone = customerZones.find((zone) => zone.insideServiceZone && zone.acceptingOrders);
    const shopZoneId = store.zoneId ?? customerZone?.id ?? null;
    if (customerZone && shopZoneId !== customerZone.id && process.env.CROSS_ZONE_DELIVERY_ENABLED !== "true") {
      return { status: 400, body: { error: "Your cart store is outside the selected delivery zone. Please switch to a nearby store." } };
    }

    // Compute subtotal
    const productIds = cartItems.map(i => i.productId);
    const products = await tx.select().from(productsTable).where(inArray(productsTable.id, productIds));
    const productMap = new Map(products.map(p => [p.id, p]));

    let subtotal = 0;
    const orderItemsData = cartItems.map(item => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} disappeared during checkout`);
      const unitPrice = safeNum(product.price);
      const lineTotal = unitPrice * item.qty;
      subtotal += lineTotal;
      return {
        productId: item.productId,
        name: product.name,
        imageUrl: Array.isArray(product.images) ? (product.images as string[])[0] : null,
        price: unitPrice.toFixed(2),
        mrp: product.mrp,
        qty: item.qty,
        total: lineTotal.toFixed(2),
      };
    });

    // Coupon
    let couponDiscount = 0;
    let coupon = null;
    if (couponCode) {
      const validated = await validateCouponForUser(tx as any, { code: couponCode, orderAmount: subtotal, userId });
      coupon = validated.coupon;
      couponDiscount = validated.discount;
    }

    const pricing = calculateOrderPricing({
      subtotal,
      store,
      customerLat: selectedLat,
      customerLng: selectedLng,
      settings: pricingSettings,
      discountAmount: couponDiscount,
      eligibleItemCount: cartItems.reduce((sum, item) => sum + item.qty, 0),
    });
    const deliveryFee = pricing.deliveryCharge;

    // Wallet
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    let walletUsed = 0;
    if (useWallet && user) {
      walletUsed = Math.min(safeNum(user.walletBalance), subtotal + deliveryFee - couponDiscount);
      walletUsed = Math.max(0, walletUsed);
    }

    const total = Math.max(0, pricing.finalCustomerAmount - walletUsed);
    if (paymentMethod === "online") {
      if (!providerPaymentId) return { status: 400, body: { error: "Verified online payment is required." } };
      const [payment] = await tx.select().from(paymentsTable).where(and(eq(paymentsTable.providerPaymentId, String(providerPaymentId)), eq(paymentsTable.customerId, userId))).limit(1);
      if (!payment || payment.paymentStatus !== "paid" || Math.abs(Number(payment.amount) - pricing.finalCustomerAmount) > 0.01) {
        return { status: 400, body: { error: "Payment amount no longer matches the current order total. Please retry payment." } };
      }
    }
    const loyaltyEarned = Math.floor(total / 10); // 1 point per ₹10

    // Create order
    const promisedMins = Math.min(40, Math.max(20, store.estimatedDeliveryMins ?? 40));

    const [order] = await tx.insert(ordersTable).values({
      orderNumber: generateOrderNumber(),
      userId,
      storeId: cart.storeId,
      zoneId: customerZone?.id ?? store.zoneId ?? null,
      customerZoneId: customerZone?.id ?? null,
      shopZoneId,
      riderZoneId: null,
      addressId,
      addressSnapshot: { line1: selectedAddress || address.line1, city: address.city, pincode: address.pincode, name: address.name },
      pickupLatitude: selectedLat.toFixed(7),
      pickupLongitude: selectedLng.toFixed(7),
      pickupAddress: selectedAddress,
      pickupDistanceKm: shopDistanceKm.toFixed(2),
      status: "pending",
      paymentMethod,
      paymentStatus: "pending",
      subtotal: subtotal.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      platformFee: pricing.commissionAmount.toFixed(2),
      commissionPercentage: pricing.commissionPercentage.toFixed(2),
      commissionAmount: pricing.commissionAmount.toFixed(2),
      calculatedDistanceKm: pricing.calculatedDistanceKm?.toFixed(2) ?? null,
      deliveryRatePerKm: pricing.deliveryRatePerKm.toFixed(2),
      deliveryFullCharge: pricing.fullDeliveryCharge.toFixed(2),
      deliveryFirstItemCharge: pricing.firstItemDeliveryCharge.toFixed(2),
      deliveryAdditionalItemPercentage: pricing.additionalItemDeliveryPercentage.toFixed(2),
      deliveryAdditionalItemCharge: pricing.additionalItemDeliveryCharge.toFixed(2),
      deliveryEligibleItemCount: pricing.eligibleItemCount,
      deliverySecondItemCharge: pricing.secondItemDeliveryCharge.toFixed(2),
      deliveryThirdItemCharge: pricing.thirdItemDeliveryCharge.toFixed(2),
      deliveryFreeItemCount: pricing.freeDeliveryItemCount,
      finalCustomerAmount: pricing.finalCustomerAmount.toFixed(2),
      discount: "0.00",
      couponCode: couponCode ?? null,
      couponDiscount: couponDiscount.toFixed(2),
      walletUsed: walletUsed.toFixed(2),
      total: total.toFixed(2),
      loyaltyPointsEarned: loyaltyEarned,
      estimatedDeliveryMins: promisedMins,
      notes,
    }).returning();

    for (const item of cartItems) {
      const [reserved] = await tx.update(productsTable)
        .set({ stock: sql`${productsTable.stock} - ${item.qty}`, updatedAt: new Date() })
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.isAvailable, true), gte(productsTable.stock, item.qty)))
        .returning({ id: productsTable.id, stock: productsTable.stock });
      if (!reserved) throw new Error(`OUT_OF_STOCK:${item.productId}`);
      await tx.insert(inventoryLedgerTable).values({
        productId: item.productId,
        orderId: order.id,
        type: "RESERVED",
        qty: item.qty,
        idempotencyKey,
        note: `Reserved for order ${order.orderNumber}`,
      });
    }

    // Insert order items
    await tx.insert(orderItemsTable).values(
      orderItemsData.map(item => ({ ...item, orderId: order.id }))
    );

    // Insert tracking event
    await tx.insert(orderTrackingTable).values([
      {
        orderId: order.id,
        status: "pending",
        message: "Order placed. Waiting for seller acceptance.",
      },
      {
        orderId: order.id,
        status: "pending",
        message: "Seller has been alerted and must accept or reject the order.",
        lat: store.lat,
        lng: store.lng,
      },
    ]);

    // Clear cart
    await tx.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));

    // Update wallet and loyalty
    if (walletUsed > 0 && user) {
      const newBalance = safeNum(user.walletBalance) - walletUsed;
      await tx.update(usersTable)
        .set({ walletBalance: newBalance.toFixed(2) })
        .where(eq(usersTable.id, userId));
      await tx.insert(walletTransactionsTable).values({
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
      await tx.update(usersTable)
        .set({ loyaltyPoints: user.loyaltyPoints + loyaltyEarned })
        .where(eq(usersTable.id, userId));
    }

    // Mark coupon used
    if (coupon) {
      await tx.insert(couponUsesTable).values({
        couponId: coupon.id,
        userId,
        orderId: order.id,
        discountApplied: couponDiscount.toFixed(2),
      });
      await tx.update(couponsTable)
        .set({ usedCount: (coupon.usedCount ?? 0) + 1 })
        .where(eq(couponsTable.id, coupon.id));
    }

    await tx.insert(outboxEventsTable).values({
      aggregateType: "order",
      aggregateId: String(order.id),
      eventType: "order.created",
      eventVersion: 1,
      idempotencyKey,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId,
        storeId: order.storeId,
        zoneId: order.zoneId,
        total: order.total,
        paymentMethod: order.paymentMethod,
      },
    });

    const [storeData] = await tx.select().from(storesTable).where(eq(storesTable.id, order.storeId)).limit(1);
    return { status: 201, body: { ...order, store: storeData } };
    });

    await saveIdempotencyResponse({
      key: idempotencyKey,
      userId,
      endpoint,
      hash,
      status: result.status,
      body: result.body as Record<string, unknown>,
      resourceId: String((result.body as { id?: number }).id ?? ""),
    });
    const createdOrder = result.body as { id: number; orderNumber: string; total: string; store?: { userId?: number } };
    if (createdOrder.store?.userId) {
      try {
        await createAndPushNotification({
          userId: createdOrder.store.userId,
          type: "new_order",
          title: "New order received",
          body: `Order #${createdOrder.orderNumber} for Rs.${Number(createdOrder.total).toFixed(0)} is waiting for your decision.`,
          data: { orderId: createdOrder.id, orderNumber: createdOrder.orderNumber, status: "pending" },
        });
      } catch (notificationError) {
        req.log.warn({ err: notificationError, orderId: createdOrder.id }, "Seller new-order notification failed");
      }
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("OUT_OF_STOCK:")) {
      res.status(409).json({ error: "Some products are out of stock. Please refresh your cart." });
      return;
    }
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
        deliveryOtp: ["picked_up", "on_the_way", "arriving"].includes(order.status) ? deliveryOtp(order.id) : null,
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
    if (order.status !== "delivered") {
      res.status(400).json({ error: "Review can be submitted only after delivery" });
      return;
    }

    const [orderedItem] = await db.select().from(orderItemsTable)
      .where(and(eq(orderItemsTable.orderId, orderId), eq(orderItemsTable.productId, productId)))
      .limit(1);
    if (!orderedItem) {
      res.status(400).json({ error: "You can review only products from this order" });
      return;
    }

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
