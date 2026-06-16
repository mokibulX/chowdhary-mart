import { Router } from "express";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import {
  db, storesTable, ordersTable, orderItemsTable, productsTable,
  orderTrackingTable, usersTable
} from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("vendor", "admin"));

async function getVendorStore(userId: number) {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.userId, userId)).limit(1);
  return store;
}

// GET /api/vendor/store
router.get("/store", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    res.json(store);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/vendor/store
router.patch("/store", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }

    const { name, description, logoUrl, bannerUrl, isOpen, phone, estimatedDeliveryMins } = req.body;
    const [updated] = await db.update(storesTable)
      .set({ name, description, logoUrl, bannerUrl, isOpen, phone, estimatedDeliveryMins, updatedAt: new Date() })
      .where(eq(storesTable.id, store.id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vendor/orders
router.get("/orders", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(200).json([]); return; }

    const { status } = req.query;
    const conditions = [eq(ordersTable.storeId, store.id)];
    if (status) conditions.push(eq(ordersTable.status, status as typeof ordersTable.$inferSelect["status"]));

    const orders = await db.select().from(ordersTable)
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt))
      .limit(50);

    res.json(orders.map(o => ({ ...o, store })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/vendor/orders/:orderId/status
router.patch("/orders/:orderId/status", async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { status } = req.body as { status: string };

    const store = await getVendorStore(req.user!.userId);

    const [order] = await db.update(ordersTable)
      .set({ status: status as typeof ordersTable.$inferInsert["status"], updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId))
      .returning();

    await db.insert(orderTrackingTable).values({
      orderId,
      status,
      message: `Order status updated to ${status}`,
    });

    res.json({ ...order, store });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vendor/products
router.get("/products", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(200).json([]); return; }

    const products = await db.select().from(productsTable)
      .where(eq(productsTable.storeId, store.id))
      .orderBy(desc(productsTable.createdAt));

    res.json(products);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/vendor/products
router.post("/products", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(400).json({ error: "No store found" }); return; }

    const { name, description, categoryId, brandId, price, mrp, images, weight, unit, stock, isAvailable, isFeatured } = req.body;
    const discountPercent = mrp && price ? (((Number(mrp) - Number(price)) / Number(mrp)) * 100).toFixed(2) : "0";

    const [product] = await db.insert(productsTable).values({
      storeId: store.id,
      name,
      description,
      categoryId,
      brandId,
      price,
      mrp,
      discountPercent,
      images: images ?? [],
      weight,
      unit,
      stock: stock ?? 0,
      isAvailable: isAvailable ?? true,
      isFeatured: isFeatured ?? false,
    }).returning();

    res.status(201).json(product);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/vendor/products/:productId
router.patch("/products/:productId", async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.params.productId);
    const { name, description, price, mrp, stock, isAvailable, isFeatured, images } = req.body;

    let discountPercent;
    if (mrp && price) {
      discountPercent = (((Number(mrp) - Number(price)) / Number(mrp)) * 100).toFixed(2);
    }

    const [product] = await db.update(productsTable)
      .set({ name, description, price, mrp, stock, isAvailable, isFeatured, images, discountPercent, updatedAt: new Date() })
      .where(eq(productsTable.id, productId))
      .returning();

    res.json(product);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/vendor/products/:productId
router.delete("/products/:productId", async (req: AuthRequest, res) => {
  try {
    await db.delete(productsTable).where(eq(productsTable.id, Number(req.params.productId)));
    res.json({ message: "Product deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vendor/dashboard
router.get("/dashboard", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) {
      res.json({ todayOrders: 0, todayRevenue: "0.00", pendingOrders: 0, totalProducts: 0, weekRevenue: "0.00", monthRevenue: "0.00", recentOrders: [] });
      return;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);

    const [allOrders, products] = await Promise.all([
      db.select().from(ordersTable).where(eq(ordersTable.storeId, store.id)),
      db.select({ count: sql<number>`count(*)` }).from(productsTable).where(eq(productsTable.storeId, store.id)),
    ]);

    const todayOrders = allOrders.filter(o => new Date(o.createdAt) >= today);
    const weekOrders = allOrders.filter(o => new Date(o.createdAt) >= weekAgo && o.status !== "cancelled");
    const monthOrders = allOrders.filter(o => new Date(o.createdAt) >= monthAgo && o.status !== "cancelled");
    const pending = allOrders.filter(o => ["pending", "confirmed", "preparing"].includes(o.status));

    const sum = (arr: typeof allOrders) => arr.reduce((s, o) => s + Number(o.total), 0);

    const recentOrders = allOrders
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(o => ({ ...o, store }));

    res.json({
      todayOrders: todayOrders.length,
      todayRevenue: sum(todayOrders.filter(o => o.status !== "cancelled")).toFixed(2),
      pendingOrders: pending.length,
      totalProducts: Number(products[0]?.count ?? 0),
      weekRevenue: sum(weekOrders).toFixed(2),
      monthRevenue: sum(monthOrders).toFixed(2),
      recentOrders,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
