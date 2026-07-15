import { Router } from "express";
import { eq, desc, ilike, and, sql, inArray } from "drizzle-orm";
import {
  db, usersTable, ordersTable, storesTable, couponsTable, bannersTable,
  deliveryPartnersTable, productsTable, categoriesTable,
  homepageSectionsTable, homepageSectionProductsTable
} from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";
import { HOMEPAGE_PERMISSIONS, getHomepageSections, slugify } from "../lib/homepage";

const router = Router();

router.use(requireAuth, requireRole("admin"));

const homepageAuditLog: Array<Record<string, unknown>> = [];

function auditHomepage(req: AuthRequest, action: string, payload: Record<string, unknown>) {
  homepageAuditLog.unshift({
    id: Date.now(),
    adminId: req.user?.userId,
    action,
    ...payload,
    timestamp: new Date().toISOString(),
  });
  if (homepageAuditLog.length > 500) homepageAuditLog.length = 500;
}

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

router.get("/homepage/permissions", (_req, res) => {
  res.json({ roles: ["SUPER_ADMIN", "PLATFORM_ADMIN", "CONTENT_ADMIN", "ZONE_ADMIN"], permissions: HOMEPAGE_PERMISSIONS });
});

router.get("/homepage/sections", async (req: AuthRequest, res) => {
  try {
    const sections = await db.select().from(homepageSectionsTable).orderBy(homepageSectionsTable.sortOrder, homepageSectionsTable.createdAt);
    res.json(sections);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/homepage/sections", async (req: AuthRequest, res) => {
  try {
    const title = String(req.body.title ?? "").trim();
    if (!title) {
      res.status(400).json({ error: "Section title is required" });
      return;
    }
    const [section] = await db.insert(homepageSectionsTable).values({
      title,
      slug: slugify(req.body.slug ?? req.body.internalName ?? title),
      subtitle: req.body.subtitle ?? null,
      sectionType: req.body.sectionType ?? "MANUAL",
      layoutType: req.body.layoutType ?? "horizontal_product_scroll",
      icon: req.body.icon ?? null,
      bannerImageUrl: req.body.bannerImageUrl ?? null,
      zoneId: req.body.zoneId ? Number(req.body.zoneId) : null,
      cityId: req.body.cityId ? Number(req.body.cityId) : null,
      productLimit: Number(req.body.productLimit ?? 8),
      isActive: req.body.isActive ?? true,
      personalizedEnabled: req.body.personalizedEnabled ?? false,
      startAt: req.body.startAt ? new Date(req.body.startAt) : null,
      endAt: req.body.endAt ? new Date(req.body.endAt) : null,
      sortOrder: Number(req.body.sortOrder ?? 0),
      createdByAdminId: req.user?.userId,
      updatedByAdminId: req.user?.userId,
    }).returning();
    auditHomepage(req, "Section created", { sectionId: section.id, newValue: section });
    res.status(201).json(section);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/homepage/sections/:id", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [oldSection] = await db.select().from(homepageSectionsTable).where(eq(homepageSectionsTable.id, id)).limit(1);
    if (!oldSection) {
      res.status(404).json({ error: "Section not found" });
      return;
    }
    const [section] = await db.update(homepageSectionsTable).set({
      title: req.body.title ?? oldSection.title,
      slug: req.body.slug ? slugify(req.body.slug) : oldSection.slug,
      subtitle: req.body.subtitle ?? oldSection.subtitle,
      sectionType: req.body.sectionType ?? oldSection.sectionType,
      layoutType: req.body.layoutType ?? oldSection.layoutType,
      icon: req.body.icon ?? oldSection.icon,
      bannerImageUrl: req.body.bannerImageUrl ?? oldSection.bannerImageUrl,
      zoneId: req.body.zoneId === "" ? null : req.body.zoneId !== undefined ? Number(req.body.zoneId) : oldSection.zoneId,
      cityId: req.body.cityId === "" ? null : req.body.cityId !== undefined ? Number(req.body.cityId) : oldSection.cityId,
      productLimit: req.body.productLimit !== undefined ? Number(req.body.productLimit) : oldSection.productLimit,
      isActive: req.body.isActive ?? oldSection.isActive,
      personalizedEnabled: req.body.personalizedEnabled ?? oldSection.personalizedEnabled,
      startAt: req.body.startAt !== undefined ? (req.body.startAt ? new Date(req.body.startAt) : null) : oldSection.startAt,
      endAt: req.body.endAt !== undefined ? (req.body.endAt ? new Date(req.body.endAt) : null) : oldSection.endAt,
      sortOrder: req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : oldSection.sortOrder,
      updatedByAdminId: req.user?.userId,
      updatedAt: new Date(),
    }).where(eq(homepageSectionsTable.id, id)).returning();
    auditHomepage(req, "Section edited", { sectionId: id, oldValue: oldSection, newValue: section });
    res.json(section);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/homepage/sections/:id", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(homepageSectionsTable).where(eq(homepageSectionsTable.id, id));
    auditHomepage(req, "Section deleted", { sectionId: id });
    res.json({ message: "Section deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/homepage/products/search", async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const conditions = [eq(productsTable.isAvailable, true), sql`${productsTable.stock} > 0`];
    if (q) conditions.push(ilike(productsTable.name, `%${q}%`));
    if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));
    const products = await db.select().from(productsTable).where(and(...conditions)).orderBy(desc(productsTable.createdAt)).limit(40);
    const storeIds = [...new Set(products.map((product) => product.storeId))];
    const categoryIds = [...new Set(products.map((product) => product.categoryId).filter((id): id is number => Boolean(id)))];
    const [stores, categories] = await Promise.all([
      storeIds.length ? db.select().from(storesTable).where(inArray(storesTable.id, storeIds)) : [],
      categoryIds.length ? db.select().from(categoriesTable).where(inArray(categoriesTable.id, categoryIds)) : [],
    ]);
    const storeMap = new Map(stores.map((store) => [store.id, store]));
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    res.json(products.map((product) => ({ ...product, store: storeMap.get(product.storeId), category: product.categoryId ? categoryMap.get(product.categoryId) : null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/homepage/sections/:id/products", async (req: AuthRequest, res) => {
  try {
    const sectionId = Number(req.params.id);
    const productId = Number(req.body.productId);
    const [[section], [product]] = await Promise.all([
      db.select().from(homepageSectionsTable).where(eq(homepageSectionsTable.id, sectionId)).limit(1),
      db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1),
    ]);
    if (!section || !product) {
      res.status(404).json({ error: "Section or product not found" });
      return;
    }
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, product.storeId)).limit(1);
    if (!product.isAvailable || Number(product.stock) <= 0 || !store?.isActive || !store?.isVerified || !store?.isOpen) {
      res.status(400).json({ error: "Only approved, active, in-stock products from active approved shops can be curated." });
      return;
    }
    const title = `${section.title} ${section.slug}`.toLowerCase();
    const [category] = product.categoryId ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId)).limit(1) : [null];
    const haystack = `${product.name} ${category?.name ?? ""} ${(product.tags ?? []).join(" ")}`.toLowerCase();
    if (title.includes("electronics") && !/(electronic|mobile|phone|earphone|charger|smart|appliance|gadget|audio)/.test(haystack)) {
      res.status(400).json({ error: "Electronics Top Picks accepts only electronics products." });
      return;
    }
    const [item] = await db.insert(homepageSectionProductsTable).values({
      sectionId,
      productId,
      shopProductId: req.body.shopProductId ? Number(req.body.shopProductId) : null,
      zoneId: req.body.zoneId ? Number(req.body.zoneId) : null,
      priority: Number(req.body.priority ?? 0),
      isPinned: req.body.isPinned ?? false,
      startAt: req.body.startAt ? new Date(req.body.startAt) : null,
      endAt: req.body.endAt ? new Date(req.body.endAt) : null,
      addedByAdminId: req.user?.userId,
    }).returning();
    auditHomepage(req, "Product added", { sectionId, productId, newValue: item });
    res.status(201).json(item);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/homepage/sections/:id/products/:productId", async (req: AuthRequest, res) => {
  try {
    const sectionId = Number(req.params.id);
    const productId = Number(req.params.productId);
    await db.delete(homepageSectionProductsTable).where(and(eq(homepageSectionProductsTable.sectionId, sectionId), eq(homepageSectionProductsTable.productId, productId)));
    auditHomepage(req, "Product removed", { sectionId, productId });
    res.json({ message: "Product removed" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/homepage/sections/:id/reorder", async (req: AuthRequest, res) => {
  try {
    const sectionId = Number(req.params.id);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    for (const item of items) {
      await db.update(homepageSectionProductsTable)
        .set({ priority: Number(item.priority ?? 0), isPinned: item.isPinned ?? false, updatedAt: new Date() })
        .where(and(eq(homepageSectionProductsTable.sectionId, sectionId), eq(homepageSectionProductsTable.productId, Number(item.productId))));
    }
    auditHomepage(req, "Product reordered", { sectionId, newValue: items });
    res.json({ message: "Section order updated" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/homepage/sections/:id/publish", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [section] = await db.update(homepageSectionsTable)
      .set({ isActive: true, startAt: null, endAt: null, updatedAt: new Date(), updatedByAdminId: req.user?.userId })
      .where(eq(homepageSectionsTable.id, id))
      .returning();
    auditHomepage(req, "Section published", { sectionId: id, newValue: section });
    res.json(section);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/homepage/sections/:id/schedule", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [section] = await db.update(homepageSectionsTable)
      .set({ startAt: req.body.startAt ? new Date(req.body.startAt) : null, endAt: req.body.endAt ? new Date(req.body.endAt) : null, updatedAt: new Date(), updatedByAdminId: req.user?.userId })
      .where(eq(homepageSectionsTable.id, id))
      .returning();
    auditHomepage(req, "Section scheduled", { sectionId: id, newValue: section });
    res.json(section);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/homepage/preview", async (req: AuthRequest, res) => {
  try {
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : undefined;
    const sections = await getHomepageSections(Number.isFinite(zoneId) ? zoneId : undefined);
    res.json({ viewport: req.query.viewport ?? "mobile", zoneId, sections });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/homepage/audit", (_req, res) => {
  res.json(homepageAuditLog);
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
