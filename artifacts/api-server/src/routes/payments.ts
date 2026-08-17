import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  cartItemsTable,
  cartsTable,
  db,
  paymentAttemptsTable,
  paymentOrdersTable,
  paymentsTable,
  productsTable,
  storesTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { createRazorpayOrder, getRazorpayConfig, verifyRazorpayPaymentSignature } from "../lib/razorpay";
import { assertTestModeFeature, testMode } from "../lib/test-mode";
import { calculateOrderPricing, ensurePricingSchema, getPricingSettings } from "../lib/pricing";
import { validateCouponForUser } from "../lib/coupons";

const router = Router();

function safeNum(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function verifiedCartTotal(userId: number, input: { latitude?: unknown; longitude?: unknown; couponCode?: string } = {}) {
  await ensurePricingSchema();
  const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.userId, userId)).limit(1);
  if (!cart?.storeId) throw Object.assign(new Error("Cart is empty"), { status: 400 });
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, cart.storeId)).limit(1);
  if (!store || !store.isActive || !store.isOpen) throw Object.assign(new Error("Seller is not active"), { status: 400 });
  const items = await db.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
  if (!items.length) throw Object.assign(new Error("Cart is empty"), { status: 400 });
  const products = await db.select().from(productsTable).where(inArray(productsTable.id, items.map((item) => item.productId)));
  const productMap = new Map(products.map((product) => [product.id, product]));
  let subtotal = 0;
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product || !product.isAvailable || Number(product.stock) < item.qty) {
      throw Object.assign(new Error(`${product?.name ?? "Product"} is unavailable`), { status: 400 });
    }
    subtotal += safeNum(product.price) * item.qty;
  }
  const coupon = input.couponCode ? await validateCouponForUser(db, { code: input.couponCode, orderAmount: subtotal, userId }) : null;
  const pricing = calculateOrderPricing({
    subtotal,
    store,
    customerLat: input.latitude,
    customerLng: input.longitude,
    settings: await getPricingSettings(),
    discountAmount: coupon?.discount ?? 0,
    eligibleItemCount: items.reduce((sum, item) => sum + item.qty, 0),
  });
  return { cart, store, items, subtotal, ...pricing, couponDiscount: coupon?.discount ?? 0 };
}

router.use(requireAuth);

router.post("/demo/complete", async (req: AuthRequest, res) => {
  try {
    assertTestModeFeature(testMode.allowDemoPayment, "Demo payment");
    const verified = await verifiedCartTotal(req.user!.userId, req.body ?? {});
    const providerOrderId = `DEMO_ORDER_${req.user!.userId}_${Date.now()}`;
    const providerPaymentId = `DEMO_PAY_${Date.now()}`;

    const [paymentOrder] = await db.insert(paymentOrdersTable).values({
      customerId: req.user!.userId,
      providerOrderId,
      amount: verified.finalCustomerAmount.toFixed(2),
      currency: "INR",
      status: "paid_test",
      cartSnapshot: {
        itemCount: verified.items.length,
        storeId: verified.store.id,
        subtotal: verified.subtotal,
        deliveryFee: verified.deliveryCharge,
        fullDeliveryCharge: verified.fullDeliveryCharge,
        firstItemDeliveryCharge: verified.firstItemDeliveryCharge,
        additionalItemDeliveryPercentage: verified.additionalItemDeliveryPercentage,
        additionalItemDeliveryCharge: verified.additionalItemDeliveryCharge,
        eligibleItemCount: verified.eligibleItemCount,
        secondItemDeliveryCharge: verified.secondItemDeliveryCharge,
        thirdItemDeliveryCharge: verified.thirdItemDeliveryCharge,
        freeDeliveryItemCount: verified.freeDeliveryItemCount,
        platformFee: verified.commissionAmount,
        commissionPercentage: verified.commissionPercentage,
        calculatedDistanceKm: verified.calculatedDistanceKm,
        deliveryRatePerKm: verified.deliveryRatePerKm,
        finalCustomerAmount: verified.finalCustomerAmount,
        isDemo: true,
        paymentMode: "DEMO",
        realMoney: false,
        createdInTestMode: true,
      },
    }).returning();

    const [payment] = await db.insert(paymentsTable).values({
      paymentOrderId: paymentOrder.id,
      customerId: req.user!.userId,
      providerOrderId,
      providerPaymentId,
      providerSignature: "DEMO_SIGNATURE_NOT_REAL",
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      paymentMethod: "demo",
      paymentStatus: "paid",
      captureStatus: "captured_test",
      capturedAt: new Date(),
    }).returning();

    res.status(201).json({
      verified: true,
      paymentId: payment.id,
      providerPaymentId,
      provider: "DEMO",
      status: "PAID_TEST",
      realMoney: false,
      message: "No real money was charged.",
    });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    req.log.error(err);
    res.status(status).json({ error: err instanceof Error ? err.message : "Demo payment failed" });
  }
});

router.post("/razorpay/order", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const verified = await verifiedCartTotal(userId, req.body ?? {});
    const amountPaise = Math.round(verified.finalCustomerAmount * 100);
    const receipt = `CM-${userId}-${Date.now()}`;
    const razorpayOrder = await createRazorpayOrder(amountPaise, receipt, { userId: String(userId), storeId: String(verified.store.id) });
    const providerOrderId = String(razorpayOrder.id);
    const [paymentOrder] = await db.insert(paymentOrdersTable).values({
      customerId: userId,
      providerOrderId,
      amount: verified.finalCustomerAmount.toFixed(2),
      currency: String(razorpayOrder.currency ?? getRazorpayConfig().currency),
      status: String(razorpayOrder.status ?? "created"),
      cartSnapshot: { itemCount: verified.items.length, eligibleItemCount: verified.eligibleItemCount, storeId: verified.store.id, subtotal: verified.subtotal, deliveryFee: verified.deliveryCharge, fullDeliveryCharge: verified.fullDeliveryCharge, firstItemDeliveryCharge: verified.firstItemDeliveryCharge, secondItemDeliveryCharge: verified.secondItemDeliveryCharge, thirdItemDeliveryCharge: verified.thirdItemDeliveryCharge, freeDeliveryItemCount: verified.freeDeliveryItemCount, additionalItemDeliveryPercentage: verified.additionalItemDeliveryPercentage, additionalItemDeliveryCharge: verified.additionalItemDeliveryCharge, platformFee: verified.commissionAmount, commissionPercentage: verified.commissionPercentage, calculatedDistanceKm: verified.calculatedDistanceKm, deliveryRatePerKm: verified.deliveryRatePerKm, finalCustomerAmount: verified.finalCustomerAmount },
    }).returning();
    res.status(201).json({
      id: paymentOrder.id,
      keyId: getRazorpayConfig().keyId,
      providerOrderId,
      amount: amountPaise,
      currency: paymentOrder.currency,
      name: "Chowdhary Mart",
      description: "Order payment",
    });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    req.log.error(err);
    res.status(status).json({ error: err instanceof Error ? err.message : "Payment order failed" });
  }
});

router.post("/razorpay/verify", async (req: AuthRequest, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ error: "Razorpay payment response is incomplete" });
      return;
    }
    const [paymentOrder] = await db.select().from(paymentOrdersTable).where(eq(paymentOrdersTable.providerOrderId, String(razorpay_order_id))).limit(1);
    if (!paymentOrder || paymentOrder.customerId !== req.user!.userId) {
      res.status(404).json({ error: "Payment order not found" });
      return;
    }
    const verified = verifyRazorpayPaymentSignature(String(razorpay_order_id), String(razorpay_payment_id), String(razorpay_signature));
    await db.insert(paymentAttemptsTable).values({
      paymentOrderId: paymentOrder.id,
      customerId: req.user!.userId,
      status: verified ? "verified" : "invalid_signature",
      metadata: { providerOrderId: razorpay_order_id },
    });
    if (!verified) {
      res.status(400).json({ error: "Invalid payment signature" });
      return;
    }
    const [payment] = await db.insert(paymentsTable).values({
      paymentOrderId: paymentOrder.id,
      customerId: req.user!.userId,
      providerOrderId: String(razorpay_order_id),
      providerPaymentId: String(razorpay_payment_id),
      providerSignature: String(razorpay_signature),
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      paymentMethod: "razorpay",
      paymentStatus: "paid",
      captureStatus: "captured",
      capturedAt: new Date(),
    }).returning();
    await db.update(paymentOrdersTable).set({ status: "paid", updatedAt: new Date() }).where(eq(paymentOrdersTable.id, paymentOrder.id));
    res.json({ verified: true, paymentId: payment.id, providerPaymentId: payment.providerPaymentId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

export default router;
