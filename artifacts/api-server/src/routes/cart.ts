import { Router } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, cartsTable, cartItemsTable, productsTable, storesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { calculateOrderPricing, ensurePricingSchema, getPricingSettings } from "../lib/pricing";
import { validateCouponForUser } from "../lib/coupons";

const router = Router();

router.use(requireAuth);

async function buildCartResponse(userId: number) {
  const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.userId, userId)).limit(1);
  if (!cart) {
    return {
      storeId: null,
      store: null,
      items: [],
      subtotal: "0.00",
      deliveryFee: "0.00",
      discount: "0.00",
      total: "0.00",
      itemCount: 0,
      pricingPending: true,
    };
  }

  const rawItems = await db.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
  const items = await Promise.all(
    rawItems.map(async (item) => {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId)).limit(1);
      return { ...item, product };
    })
  );

  let store = null;
  if (cart.storeId) {
    const [s] = await db.select().from(storesTable).where(eq(storesTable.id, cart.storeId)).limit(1);
    store = s;
  }

  const subtotal = items.reduce((sum, item) => sum + Number(item.product?.price ?? item.price) * item.qty, 0);
  const total = subtotal;

  return {
    storeId: cart.storeId,
    store,
    items: items.map((item) => ({ ...item, price: item.product?.price ?? item.price })),
    subtotal: subtotal.toFixed(2),
    deliveryFee: "0.00",
    discount: "0.00",
    total: total.toFixed(2),
    itemCount: items.reduce((sum, i) => sum + i.qty, 0),
    pricingPending: true,
  };
}

router.get("/pricing", async (req: AuthRequest, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "A valid delivery location is required before delivery pricing can be calculated." });
      return;
    }
    await ensurePricingSchema();
    const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.userId, req.user!.userId)).limit(1);
    if (!cart?.storeId) { res.json({ pricingPending: false, sellerBaseAmount: 0, productSubtotal: 0, commissionAmount: 0, deliveryCharge: 0, discountAmount: 0, finalCustomerAmount: 0, currency: "INR" }); return; }
    const [[store], items] = await Promise.all([
      db.select().from(storesTable).where(eq(storesTable.id, cart.storeId)).limit(1),
      db.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id)),
    ]);
    if (!store) { res.status(404).json({ error: "Seller not found" }); return; }
    const products = items.length ? await db.select().from(productsTable).where(inArray(productsTable.id, items.map((item) => item.productId))) : [];
    const productMap = new Map(products.map((product) => [product.id, product]));
    const subtotal = items.reduce((sum, item) => sum + Number(productMap.get(item.productId)?.price ?? 0) * item.qty, 0);
    let discountAmount = 0;
    const couponCode = String(req.query.couponCode ?? "").trim();
    if (couponCode) discountAmount = (await validateCouponForUser(db, { code: couponCode, orderAmount: subtotal, userId: req.user!.userId })).discount;
    const pricing = calculateOrderPricing({ subtotal, store, customerLat: lat, customerLng: lng, settings: await getPricingSettings(), discountAmount, eligibleItemCount: items.reduce((sum, item) => sum + item.qty, 0) });
    res.json({ ...pricing, pricingPending: false, storeId: store.id });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not calculate delivery pricing" });
  }
});

// GET /api/cart
router.get("/", async (req: AuthRequest, res) => {
  try {
    res.json(await buildCartResponse(req.user!.userId));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/cart/items
router.post("/items", async (req: AuthRequest, res) => {
  try {
    const { productId, qty = 1 } = req.body as { productId: number; qty?: number };
    const userId = req.user!.userId;

    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    // Get or create cart
    let [cart] = await db.select().from(cartsTable).where(eq(cartsTable.userId, userId)).limit(1);
    if (!cart) {
      [cart] = await db.insert(cartsTable).values({ userId, storeId: product.storeId }).returning();
    } else if (cart.storeId !== product.storeId) {
      // Different store — clear cart and switch
      await db.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
      [cart] = await db.update(cartsTable).set({ storeId: product.storeId }).where(eq(cartsTable.id, cart.id)).returning();
    }

    // Check if item already in cart
    const [existing] = await db.select().from(cartItemsTable)
      .where(and(eq(cartItemsTable.cartId, cart.id), eq(cartItemsTable.productId, productId)))
      .limit(1);

    if (existing) {
      await db.update(cartItemsTable).set({ qty: existing.qty + qty }).where(eq(cartItemsTable.id, existing.id));
    } else {
      await db.insert(cartItemsTable).values({
        cartId: cart.id,
        productId,
        qty,
        price: product.price,
      });
    }

    res.json(await buildCartResponse(userId));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/cart/items/:itemId
router.patch("/items/:itemId", async (req: AuthRequest, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const { qty } = req.body as { qty: number };
    const userId = req.user!.userId;

    if (qty <= 0) {
      await db.delete(cartItemsTable).where(eq(cartItemsTable.id, itemId));
    } else {
      await db.update(cartItemsTable).set({ qty }).where(eq(cartItemsTable.id, itemId));
    }

    res.json(await buildCartResponse(userId));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/cart/items/:itemId
router.delete("/items/:itemId", async (req: AuthRequest, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const userId = req.user!.userId;
    await db.delete(cartItemsTable).where(eq(cartItemsTable.id, itemId));
    res.json(await buildCartResponse(userId));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/cart
router.delete("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.userId, userId)).limit(1);
    if (cart) {
      await db.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
    }
    res.json({ message: "Cart cleared" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
