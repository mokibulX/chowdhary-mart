import { Router } from "express";
import { eq, desc, ilike, and, sql } from "drizzle-orm";
import {
  db, usersTable, ordersTable, storesTable, couponsTable, bannersTable,
  deliveryPartnersTable, productsTable
} from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin"));

// GET /api/admin/dashboard
router.get("/dashboard", async (req: AuthRequest, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [users, allOrders, stores, deliveryPartners] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(usersTable),
      db.select().from(ordersTable),
      db.select({ count: sql<number>`count(*)` }).from(storesTable),
      db.select({ count: sql<number>`count(*)` }).from(deliveryPartnersTable).where(eq(deliveryPartnersTable.isOnline, true)),
    ]);

    const todayOrders = allOrders.filter(o => new Date(o.createdAt) >= today);
    const completed = allOrders.filter(o => o.status === "delivered");
    const totalRevenue = completed.reduce((s, o) => s + Number(o.total), 0);
    const todayRevenue = todayOrders.filter(o => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0);

    const recentOrders = await db.select().from(ordersTable)
      .orderBy(desc(ordersTable.createdAt)).limit(10);

    const [firstStore] = await db.select().from(storesTable).limit(1);

    res.json({
      totalUsers: Number(users[0]?.count ?? 0),
      totalOrders: allOrders.length,
      totalRevenue: totalRevenue.toFixed(2),
      totalStores: Number(stores[0]?.count ?? 0),
      todayOrders: todayOrders.length,
      todayRevenue: todayRevenue.toFixed(2),
      activeDeliveryPartners: Number(deliveryPartners[0]?.count ?? 0),
      recentOrders: recentOrders.map(o => ({ ...o, store: firstStore })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/users
router.get("/users", async (req: AuthRequest, res) => {
  try {
    const { role, q } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const conditions = [];
    if (role) conditions.push(eq(usersTable.role, role as "customer" | "vendor" | "delivery_partner" | "admin"));
    if (q) conditions.push(ilike(usersTable.name, `%${q}%`));

    const users = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      phone: usersTable.phone,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
      role: usersTable.role,
      walletBalance: usersTable.walletBalance,
      loyaltyPoints: usersTable.loyaltyPoints,
      referralCode: usersTable.referralCode,
      isVerified: usersTable.isVerified,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    }).from(usersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(usersTable.createdAt))
      .limit(limit).offset(offset);

    res.json(users);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/orders
router.get("/orders", async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const { status } = req.query;

    const conditions = status ? [eq(ordersTable.status, status as typeof ordersTable.$inferSelect["status"])] : [];

    const orders = await db.select().from(ordersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit).offset(offset);

    const stores = await db.select().from(storesTable);
    const storeMap = new Map(stores.map(s => [s.id, s]));

    res.json(orders.map(o => ({ ...o, store: storeMap.get(o.storeId) })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/stores
router.get("/stores", async (req: AuthRequest, res) => {
  try {
    const stores = await db.select().from(storesTable).orderBy(desc(storesTable.createdAt));
    res.json(stores);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/coupons
router.get("/coupons", async (req: AuthRequest, res) => {
  try {
    const coupons = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
    res.json(coupons);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/coupons
router.post("/coupons", async (req: AuthRequest, res) => {
  try {
    const { code, description, discountType, discountValue, minOrderValue, maxDiscount, usageLimit, perUserLimit, expiresAt } = req.body;
    const [coupon] = await db.insert(couponsTable).values({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscount,
      usageLimit,
      perUserLimit,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();
    res.status(201).json(coupon);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/banners
router.get("/banners", async (req: AuthRequest, res) => {
  try {
    const banners = await db.select().from(bannersTable).orderBy(bannersTable.sortOrder);
    res.json(banners);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
