import { Router } from "express";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import {
  db, storesTable, ordersTable, orderItemsTable, productsTable,
  orderTrackingTable, usersTable, mediaLibraryTable, categoriesTable
} from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";
import { sellerZoneIds } from "../lib/zones";

const router = Router();

router.use(requireAuth, requireRole("vendor", "admin"));

let mediaLibraryReady: Promise<void> | null = null;
function ensureMediaLibraryTable() {
  mediaLibraryReady ??= (async () => {
    await db.execute(sql`
      create table if not exists media_library (
        id serial primary key,
        title varchar(180) not null,
        description text,
        image_url text not null,
        storage_path text,
        storage_provider varchar(40),
        mime_type varchar(80),
        size_bytes integer,
        category_id integer references categories(id) on delete set null,
        source_type varchar(40) not null default 'admin_upload',
        tags json default '[]'::json,
        is_approved boolean not null default true,
        created_by_admin_id integer references users(id) on delete set null,
        created_at timestamp not null default now(),
        updated_at timestamp not null default now()
      )
    `);
    await db.execute(sql`alter table media_library add column if not exists storage_path text`);
    await db.execute(sql`alter table media_library add column if not exists storage_provider varchar(40)`);
    await db.execute(sql`alter table media_library add column if not exists mime_type varchar(80)`);
    await db.execute(sql`alter table media_library add column if not exists size_bytes integer`);
    await db.execute(sql`create index if not exists media_library_category_created_idx on media_library (category_id, created_at desc)`);
    await db.execute(sql`create index if not exists media_library_approved_created_idx on media_library (is_approved, created_at desc)`);
  })();
  return mediaLibraryReady;
}

async function getVendorStore(userId: number) {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.userId, userId)).limit(1);
  return store;
}

async function assertSellerZoneScope(userId: number, zoneId?: number | null) {
  if (!zoneId) return true;
  const zones = await sellerZoneIds(userId);
  return zones.includes(zoneId);
}

function cleanProductImages(images: unknown) {
  if (!Array.isArray(images)) return [];
  const urls = images
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  if (urls.some((url) => url.startsWith("data:image/"))) {
    throw new Error("Base64 product images are not allowed. Upload images to storage first.");
  }
  const valid = urls.filter((url) => /^https?:\/\//i.test(url));
  if (valid.length !== urls.length) throw new Error("Every product image must be a valid storage URL.");
  return Array.from(new Set(valid)).slice(0, 12);
}

// GET /api/vendor/store
router.get("/store", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    if (!(await assertSellerZoneScope(req.user!.userId, store.zoneId))) { res.status(403).json({ error: "You cannot manage another service zone." }); return; }
    res.json(store);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not save product" });
  }
});

// PATCH /api/vendor/store
router.patch("/store", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    if (!(await assertSellerZoneScope(req.user!.userId, store.zoneId))) { res.status(403).json({ error: "You cannot manage another service zone." }); return; }

    const {
      name,
      description,
      logoUrl,
      bannerUrl,
      isOpen,
      phone,
      estimatedDeliveryMins,
      deliveryFee,
      freeDeliveryAbove,
      minOrderValue,
      lat,
      lng,
      pickupAddress,
      address,
      city,
      pincode,
    } = req.body;
    const updates: Partial<typeof storesTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = description;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl;
    if (bannerUrl !== undefined) updates.bannerUrl = bannerUrl;
    if (isOpen !== undefined) updates.isOpen = Boolean(isOpen);
    if (phone !== undefined) updates.phone = phone;
    if (estimatedDeliveryMins !== undefined) updates.estimatedDeliveryMins = Number(estimatedDeliveryMins);
    if (deliveryFee !== undefined) updates.deliveryFee = String(deliveryFee);
    if (freeDeliveryAbove !== undefined) updates.freeDeliveryAbove = String(freeDeliveryAbove);
    if (minOrderValue !== undefined) updates.minOrderValue = String(minOrderValue);
    if (lat !== undefined && Number.isFinite(Number(lat))) updates.lat = Number(lat);
    if (lng !== undefined && Number.isFinite(Number(lng))) updates.lng = Number(lng);
    const nextAddress = pickupAddress ?? address;
    if (nextAddress !== undefined && String(nextAddress).trim()) updates.address = String(nextAddress).trim();
    if (city !== undefined) updates.city = city;
    if (pincode !== undefined) updates.pincode = pincode;

    const [updated] = await db.update(storesTable)
      .set(updates)
      .where(eq(storesTable.id, store.id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update product" });
  }
});

// GET /api/vendor/orders
router.get("/orders", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(200).json([]); return; }
    if (!(await assertSellerZoneScope(req.user!.userId, store.zoneId))) { res.status(403).json({ error: "You cannot view another service zone." }); return; }

    const { status } = req.query;
    const conditions = [eq(ordersTable.storeId, store.id)];
    if (store.zoneId) conditions.push(eq(ordersTable.zoneId, store.zoneId));
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
    if (!store || !(await assertSellerZoneScope(req.user!.userId, store.zoneId))) { res.status(403).json({ error: "Order is outside your service zone." }); return; }
    const [targetOrder] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, store.id))).limit(1);
    if (!targetOrder || (store.zoneId && targetOrder.zoneId && targetOrder.zoneId !== store.zoneId)) { res.status(404).json({ error: "Order not found in your zone" }); return; }

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
    if (!(await assertSellerZoneScope(req.user!.userId, store.zoneId))) { res.status(403).json({ error: "You cannot view another service zone." }); return; }

    const products = await db.select().from(productsTable)
      .where(eq(productsTable.storeId, store.id))
      .orderBy(desc(productsTable.createdAt));

    res.json(products);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vendor/media-library?categoryId=1
router.get("/media-library", async (req: AuthRequest, res) => {
  try {
    await ensureMediaLibraryTable();
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(200).json([]); return; }
    if (!(await assertSellerZoneScope(req.user!.userId, store.zoneId))) { res.status(403).json({ error: "You cannot view another service zone." }); return; }
    const categoryId = Number(req.query.categoryId ?? 0);
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 60);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const q = String(req.query.q ?? "").trim();
    const conditions = [eq(mediaLibraryTable.isApproved, true)];
    if (categoryId) conditions.push(eq(mediaLibraryTable.categoryId, categoryId));
    if (q) {
      const term = `%${q}%`;
      conditions.push(sql`(${mediaLibraryTable.title} ilike ${term} or coalesce(${mediaLibraryTable.description}, '') ilike ${term} or ${mediaLibraryTable.tags}::text ilike ${term})`);
    }
    const rows = await db
      .select({ item: mediaLibraryTable, category: categoriesTable })
      .from(mediaLibraryTable)
      .leftJoin(categoriesTable, eq(mediaLibraryTable.categoryId, categoriesTable.id))
      .where(and(...conditions))
      .orderBy(desc(mediaLibraryTable.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(rows.map(({ item, category }) => ({ ...item, category })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load image library" });
  }
});

// POST /api/vendor/products
router.post("/products", async (req: AuthRequest, res) => {
  try {
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(400).json({ error: "No store found" }); return; }

    const { name, description, categoryId, brandId, price, mrp, images, weight, unit, stock, isAvailable, isFeatured } = req.body;
    const productImages = cleanProductImages(images);
    const discountPercent = mrp && price ? (((Number(mrp) - Number(price)) / Number(mrp)) * 100).toFixed(2) : "0";

    const [product] = await db.insert(productsTable).values({
      storeId: store.id,
      zoneId: store.zoneId,
      name,
      description,
      categoryId,
      brandId,
      price,
      mrp,
      discountPercent,
      images: productImages,
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

    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const [existing] = await db.select().from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.storeId, store.id))).limit(1);
    if (!existing || (store.zoneId && existing.zoneId && existing.zoneId !== store.zoneId)) { res.status(404).json({ error: "Product not found in your zone" }); return; }
    const nextImages = images === undefined ? existing.images : cleanProductImages(images);

    const [product] = await db.update(productsTable)
      .set({ name, description, price, mrp, stock, isAvailable, isFeatured, images: nextImages, discountPercent, updatedAt: new Date() })
      .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, store.id)))
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
    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    await db.delete(productsTable).where(and(eq(productsTable.id, Number(req.params.productId)), eq(productsTable.storeId, store.id)));
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
