import { Router } from "express";
import { eq, desc, ilike, and, sql, inArray } from "drizzle-orm";
import {
  db, usersTable, ordersTable, storesTable, couponsTable, couponUsesTable, bannersTable,
  deliveryPartnersTable, productsTable, categoriesTable,
  homepageSectionsTable, homepageSectionProductsTable, walletTransactionsTable,
  serviceZonesTable, sellerZoneAssignmentsTable, riderZoneAssignmentsTable, zoneChangeRequestsTable,
  mediaLibraryTable,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";
import { generateReferralCode, hashPassword } from "../lib/auth";
import { HOMEPAGE_PERMISSIONS, getHomepageSections, slugify } from "../lib/homepage";
import { assertTestModeFeature, testMode } from "../lib/test-mode";
import { auditZone, validCoordinate } from "../lib/zones";

const router = Router();

router.use(requireAuth, requireRole("admin"));

const homepageAuditLog: Array<Record<string, unknown>> = [];
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
    await db.execute(sql`create index if not exists media_library_title_idx on media_library using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')))`);
  })();
  return mediaLibraryReady;
}

function mediaPayload(body: Record<string, unknown>, adminId?: number) {
  const title = String(body.title ?? "").trim();
  const imageUrl = String(body.imageUrl ?? "").trim();
  if (title.length < 2) throw new Error("Image title is required");
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    throw new Error("Storage image URL is required. Upload the file first; do not save base64 images in database.");
  }
  return {
    title,
    imageUrl,
    storagePath: String(body.storagePath ?? "").trim() || null,
    storageProvider: String(body.storageProvider ?? "").trim() || null,
    mimeType: String(body.mimeType ?? "").trim() || null,
    sizeBytes: body.sizeBytes ? Number(body.sizeBytes) : null,
    description: String(body.description ?? "").trim() || null,
    categoryId: body.categoryId ? Number(body.categoryId) : null,
    sourceType: String(body.sourceType ?? "admin_upload").trim() || "admin_upload",
    tags: Array.isArray(body.tags) ? body.tags.map((item) => String(item).trim()).filter(Boolean) : String(body.tags ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    isApproved: body.isApproved !== undefined ? Boolean(body.isApproved) : true,
    createdByAdminId: adminId ?? null,
    updatedAt: new Date(),
  };
}

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

const demoAccounts = [
  { role: "customer" as const, name: "Demo Customer", email: "customer.demo@chowdharymart.test", phone: "9876543210", password: "Demo@Customer123", wallet: "0.00" },
  { role: "vendor" as const, name: "Demo Seller", email: "seller.demo@chowdharymart.test", phone: "9876500002", password: "Demo@Seller123", wallet: "5000.00" },
  { role: "delivery_partner" as const, name: "Demo Rider", email: "rider.demo@chowdharymart.test", phone: "9876500004", password: "Demo@Rider123", wallet: "1500.00" },
  { role: "admin" as const, name: "Demo Admin", email: "admin.demo@chowdharymart.test", phone: "9876500001", password: "Demo@Admin123", wallet: "0.00" },
];

function zonePayload(body: Record<string, unknown>, adminId?: number) {
  const code = String(body.code ?? body.zoneCode ?? "").trim().toUpperCase();
  const name = String(body.name ?? body.zoneName ?? "New Service Zone").trim();
  const centreLatitude = Number(body.centreLatitude ?? body.lat);
  const centreLongitude = Number(body.centreLongitude ?? body.lng);
  if (!code) throw new Error("Zone code is required");
  if (!validCoordinate(centreLatitude, centreLongitude)) throw new Error("Valid zone centre GPS is required");
  return {
    code,
    name,
    city: body.city ? String(body.city) : null,
    state: body.state ? String(body.state) : null,
    centreLatitude,
    centreLongitude,
    radiusMeters: Math.max(500, Math.min(25000, Number(body.radiusMeters ?? 5000))),
    boundaryGeometry: body.boundaryGeometry ? body.boundaryGeometry as Record<string, unknown> : null,
    deliveryMinutes: Math.max(10, Math.min(180, Number(body.deliveryMinutes ?? body.defaultDeliveryTime ?? 40))),
    minimumOrderAmount: String(body.minimumOrderAmount ?? "99"),
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : body.status !== "paused",
    acceptingOrders: body.acceptingOrders !== false,
    deliveryEnabled: body.deliveryEnabled !== false,
    registrationEnabled: body.registrationEnabled !== false,
    sellerRegistrationEnabled: body.sellerRegistrationEnabled !== false,
    riderRegistrationEnabled: body.riderRegistrationEnabled !== false,
    updatedByAdminId: adminId ?? null,
  };
}

async function ensureDemoUser(account: typeof demoAccounts[number]) {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, account.email)).limit(1);
  if (existing) return { ...existing, created: false };
  const [user] = await db.insert(usersTable).values({
    name: account.name,
    email: account.email,
    phone: account.phone,
    passwordHash: await hashPassword(account.password),
    role: account.role,
    walletBalance: account.wallet,
    isVerified: true,
    isActive: true,
    referralCode: generateReferralCode(),
  }).returning();
  if (Number(account.wallet) > 0) {
    await db.insert(walletTransactionsTable).values({
      userId: user.id,
      type: "credit",
      amount: account.wallet,
      balance: account.wallet,
      description: "Demo wallet seed - no real money",
      referenceId: `DEMO-SEED-${user.id}`,
      referenceType: "demo_seed",
    });
  }
  return { ...user, created: true };
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

router.get("/test-controls", (_req, res) => {
  res.json({
    testMode: testMode.enabled,
    demoOtpEnabled: testMode.enabled && testMode.allowDemoOtp,
    demoPaymentEnabled: testMode.enabled && testMode.allowDemoPayment,
    demoPayoutEnabled: testMode.enabled && testMode.allowDemoPayout,
    demoApprovalEnabled: testMode.enabled && testMode.allowDemoApproval,
    requireRealGps: testMode.requireRealGps,
    allowFakeGps: testMode.allowFakeGps,
    maxAccuracyMeters: testMode.maxAccuracyMeters,
    locationUpdateIntervalSeconds: testMode.locationIntervalSeconds,
    demoAccounts: demoAccounts.map(({ password: _password, ...account }) => account),
  });
});

router.post("/test-controls/seed", async (req: AuthRequest, res) => {
  try {
    assertTestModeFeature(testMode.allowDemoApproval, "Demo seed");
    const users = [];
    for (const account of demoAccounts) users.push(await ensureDemoUser(account));
    const seller = users.find((user) => user.email === "seller.demo@chowdharymart.test");
    const rider = users.find((user) => user.email === "rider.demo@chowdharymart.test");

    if (seller) {
      const [existingStore] = await db.select().from(storesTable).where(eq(storesTable.userId, seller.id)).limit(1);
      let store = existingStore;
      if (!store) {
        [store] = await db.insert(storesTable).values({
          userId: seller.id,
          name: "Alom Demo Grocery",
          description: "Demo quick-commerce grocery store. Location must be adjusted with real GPS before live testing.",
          logoUrl: "/app-logo.png",
          bannerUrl: "/app-logo.png",
          lat: 22.6076,
          lng: 88.4695,
          address: "Demo shop address - replace with live GPS in seller panel",
          city: "Kolkata",
          pincode: "700156",
          phone: "9876500002",
          radiusKm: 5,
          deliveryFee: "40",
          freeDeliveryAbove: "299",
          estimatedDeliveryMins: 40,
          isOpen: true,
          isVerified: true,
          isActive: true,
          commissionPercent: "8",
        }).returning();
      } else {
        await db.update(storesTable).set({ isVerified: true, isActive: true, isOpen: true, updatedAt: new Date() }).where(eq(storesTable.id, store.id));
      }

      const [category] = await db.insert(categoriesTable).values({
        name: "Demo Grocery",
        slug: `demo-grocery-${Date.now()}`,
        imageUrl: "/app-logo.png",
        iconEmoji: "🥬",
        colorClass: "bg-green-100 text-green-700",
        sortOrder: 1,
        isActive: true,
      }).returning();

      const products = [
        { name: "Demo Tomato", price: "40.00", mrp: "50.00", unit: "kg", weight: "1 kg", images: ["https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=800&q=80"] },
        { name: "Demo Potato", price: "30.00", mrp: "38.00", unit: "kg", weight: "1 kg", images: ["https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=800&q=80"] },
        { name: "Demo Onion", price: "35.00", mrp: "45.00", unit: "kg", weight: "1 kg", images: ["https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=800&q=80"] },
      ];
      for (const product of products) {
        const [existingProduct] = await db.select().from(productsTable).where(and(eq(productsTable.storeId, store.id), eq(productsTable.name, product.name))).limit(1);
        if (!existingProduct) {
          await db.insert(productsTable).values({
            storeId: store.id,
            categoryId: category.id,
            name: product.name,
            description: "Demo product for test mode. No real payment is charged in demo checkout.",
            price: product.price,
            mrp: product.mrp,
            discountPercent: "10",
            images: product.images,
            weight: product.weight,
            unit: product.unit,
            sku: `DEMO-${slugify(product.name)}-${Date.now()}`,
            stock: 50,
            rating: "4.50",
            reviewCount: 12,
            specifications: { Mode: "DEMO", Location: "Use real GPS before delivery testing" },
            tags: ["demo", "test-mode", "grocery"],
            isAvailable: true,
            isFeatured: true,
          });
        }
      }
    }

    if (rider) {
      const [partner] = await db.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.userId, rider.id)).limit(1);
      if (!partner) {
        await db.insert(deliveryPartnersTable).values({
          userId: rider.id,
          vehicleType: "bike",
          vehicleNumber: "WB00DEMO",
          isOnline: false,
          isVerified: true,
          rating: "4.80",
        });
      } else {
        await db.update(deliveryPartnersTable).set({ isVerified: true }).where(eq(deliveryPartnersTable.id, partner.id));
      }
    }

    res.status(201).json({
      message: "Demo users, seller, rider and grocery products are ready.",
      users: users.map((user) => ({ id: user.id, email: user.email, role: user.role, created: user.created })),
    });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    req.log.error(err);
    res.status(status).json({ error: err instanceof Error ? err.message : "Demo seed failed" });
  }
});

router.delete("/test-controls/data", async (_req, res) => {
  try {
    assertTestModeFeature(testMode.allowDemoApproval, "Demo data cleanup");
    const emails = demoAccounts.map((account) => account.email);
    const users = await db.select().from(usersTable).where(inArray(usersTable.email, emails));
    for (const user of users) {
      await db.delete(walletTransactionsTable).where(eq(walletTransactionsTable.userId, user.id));
      await db.delete(deliveryPartnersTable).where(eq(deliveryPartnersTable.userId, user.id));
      const stores = await db.select().from(storesTable).where(eq(storesTable.userId, user.id));
      for (const store of stores) await db.delete(storesTable).where(eq(storesTable.id, store.id));
      if (user.email !== process.env.ADMIN_EMAIL) await db.delete(usersTable).where(eq(usersTable.id, user.id));
    }
    res.json({ message: "Demo data removed where safe." });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    res.status(status).json({ error: err instanceof Error ? err.message : "Demo cleanup failed" });
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

    res.json(orders.map(o => {
      const store = storeMap.get(o.storeId);
      return {
        ...o,
        store,
        liveTracking: {
          orderId: o.id,
          status: o.status,
          estimatedMins: o.estimatedDeliveryMins ?? 40,
          storeLocation: store ? { lat: store.lat, lng: store.lng, label: store.name, address: store.address } : null,
          customerLocation: o.pickupLatitude && o.pickupLongitude ? {
            lat: Number(o.pickupLatitude),
            lng: Number(o.pickupLongitude),
            label: "Customer pickup location",
            address: o.pickupAddress ?? "Confirmed pickup point",
          } : null,
          distanceKm: o.pickupDistanceKm ? Number(o.pickupDistanceKm) : null,
        },
      };
    }));
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

// GET /api/admin/media-library
router.get("/media-library", async (req: AuthRequest, res) => {
  try {
    await ensureMediaLibraryTable();
    const categoryId = Number(req.query.categoryId ?? 0);
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const q = String(req.query.q ?? "").trim();
    const conditions = [];
    if (categoryId) conditions.push(eq(mediaLibraryTable.categoryId, categoryId));
    if (q) {
      const term = `%${q}%`;
      conditions.push(sql`(${mediaLibraryTable.title} ilike ${term} or coalesce(${mediaLibraryTable.description}, '') ilike ${term} or ${mediaLibraryTable.tags}::text ilike ${term})`);
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ count }]] = await Promise.all([
      db
        .select({ item: mediaLibraryTable, category: categoriesTable })
        .from(mediaLibraryTable)
        .leftJoin(categoriesTable, eq(mediaLibraryTable.categoryId, categoriesTable.id))
        .where(whereClause)
        .orderBy(desc(mediaLibraryTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(mediaLibraryTable).where(whereClause),
    ]);
    const total = Number(count ?? 0);
    res.json({
      items: rows.map(({ item, category }) => ({ ...item, category })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load image library" });
  }
});

// POST /api/admin/media-library
router.post("/media-library", async (req: AuthRequest, res) => {
  try {
    await ensureMediaLibraryTable();
    const payload = mediaPayload(req.body, req.user?.userId);
    const [item] = await db.insert(mediaLibraryTable).values(payload).returning();
    res.status(201).json(item);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not save image" });
  }
});

// PATCH /api/admin/media-library/:id
router.patch("/media-library/:id", async (req: AuthRequest, res) => {
  try {
    await ensureMediaLibraryTable();
    const id = Number(req.params.id);
    const payload = mediaPayload(req.body, req.user?.userId);
    const [item] = await db.update(mediaLibraryTable).set(payload).where(eq(mediaLibraryTable.id, id)).returning();
    if (!item) { res.status(404).json({ error: "Image not found" }); return; }
    res.json(item);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update image" });
  }
});

// DELETE /api/admin/media-library/:id
router.delete("/media-library/:id", async (req: AuthRequest, res) => {
  try {
    await ensureMediaLibraryTable();
    await db.delete(mediaLibraryTable).where(eq(mediaLibraryTable.id, Number(req.params.id)));
    res.json({ message: "Image removed from library" });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: "Could not delete image" });
  }
});

// POST /api/admin/coupons
router.post("/coupons", async (req: AuthRequest, res) => {
  try {
    const { code, description, discountType, discountValue, minOrderValue, maxDiscount, usageLimit, perUserLimit, expiresAt, isActive, isSpecial } = req.body;
    const nextCode = String(code ?? "").trim().toUpperCase();
    const nextType = discountType === "percent" ? "percent" : "flat";
    const nextValue = Number(discountValue);
    if (!/^[A-Z0-9_-]{3,20}$/.test(nextCode)) { res.status(400).json({ error: "Coupon code must be 3-20 letters/numbers" }); return; }
    if (!Number.isFinite(nextValue) || nextValue <= 0) { res.status(400).json({ error: "Discount value required" }); return; }
    if (nextType === "percent" && nextValue > 100) { res.status(400).json({ error: "Percent discount cannot be more than 100" }); return; }
    const [coupon] = await db.insert(couponsTable).values({
      code: nextCode,
      description: String(description ?? "").trim(),
      discountType: nextType,
      discountValue: nextValue.toFixed(2),
      minOrderValue: minOrderValue !== undefined && minOrderValue !== "" ? Number(minOrderValue).toFixed(2) : "0",
      maxDiscount: maxDiscount !== undefined && maxDiscount !== "" ? Number(maxDiscount).toFixed(2) : null,
      usageLimit: usageLimit !== undefined && usageLimit !== "" ? Number(usageLimit) : null,
      perUserLimit: perUserLimit !== undefined && perUserLimit !== "" ? Number(perUserLimit) : 1,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      isSpecial: Boolean(isSpecial),
    }).returning();
    res.status(201).json(coupon);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not create coupon" });
  }
});

// PATCH /api/admin/coupons/:couponId
router.patch("/coupons/:couponId", async (req: AuthRequest, res) => {
  try {
    const couponId = Number(req.params.couponId);
    const [existing] = await db.select().from(couponsTable).where(eq(couponsTable.id, couponId)).limit(1);
    if (!existing) { res.status(404).json({ error: "Coupon not found" }); return; }

    const nextCode = req.body.code !== undefined ? String(req.body.code).trim().toUpperCase() : existing.code;
    const nextType = req.body.discountType === "percent" ? "percent" : req.body.discountType === "flat" ? "flat" : existing.discountType;
    const nextValue = req.body.discountValue !== undefined ? Number(req.body.discountValue) : Number(existing.discountValue);
    if (!/^[A-Z0-9_-]{3,20}$/.test(nextCode)) { res.status(400).json({ error: "Coupon code must be 3-20 letters/numbers" }); return; }
    if (!Number.isFinite(nextValue) || nextValue <= 0) { res.status(400).json({ error: "Discount value required" }); return; }
    if (nextType === "percent" && nextValue > 100) { res.status(400).json({ error: "Percent discount cannot be more than 100" }); return; }

    const [coupon] = await db.update(couponsTable).set({
      code: nextCode,
      description: req.body.description !== undefined ? String(req.body.description).trim() : existing.description,
      discountType: nextType,
      discountValue: nextValue.toFixed(2),
      minOrderValue: req.body.minOrderValue !== undefined && req.body.minOrderValue !== "" ? Number(req.body.minOrderValue).toFixed(2) : req.body.minOrderValue === "" ? "0" : existing.minOrderValue,
      maxDiscount: req.body.maxDiscount !== undefined && req.body.maxDiscount !== "" ? Number(req.body.maxDiscount).toFixed(2) : req.body.maxDiscount === "" ? null : existing.maxDiscount,
      usageLimit: req.body.usageLimit !== undefined && req.body.usageLimit !== "" ? Number(req.body.usageLimit) : req.body.usageLimit === "" ? null : existing.usageLimit,
      perUserLimit: req.body.perUserLimit !== undefined && req.body.perUserLimit !== "" ? Number(req.body.perUserLimit) : req.body.perUserLimit === "" ? null : existing.perUserLimit,
      expiresAt: req.body.expiresAt !== undefined ? (req.body.expiresAt ? new Date(req.body.expiresAt) : null) : existing.expiresAt,
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : existing.isActive,
      isSpecial: req.body.isSpecial !== undefined ? Boolean(req.body.isSpecial) : existing.isSpecial,
    }).where(eq(couponsTable.id, couponId)).returning();
    res.json(coupon);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update coupon" });
  }
});

// DELETE /api/admin/coupons/:couponId
router.delete("/coupons/:couponId", async (req: AuthRequest, res) => {
  try {
    const couponId = Number(req.params.couponId);
    await db.transaction(async (tx) => {
      await tx.delete(couponUsesTable).where(eq(couponUsesTable.couponId, couponId));
      await tx.delete(couponsTable).where(eq(couponsTable.id, couponId));
    });
    res.json({ message: "Coupon deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: "Could not delete coupon" });
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

// GET /api/admin/service-zones
router.get("/service-zones", async (req: AuthRequest, res) => {
  try {
    const zones = await db.select().from(serviceZonesTable).orderBy(desc(serviceZonesTable.createdAt));
    const [stores, products, orders] = await Promise.all([
      db.select().from(storesTable),
      db.select().from(productsTable),
      db.select().from(ordersTable),
    ]);
    res.json(zones.map((zone) => ({
      ...zone,
      zoneCode: zone.code,
      zoneName: zone.name,
      status: zone.isActive ? "active" : "paused",
      defaultDeliveryTime: zone.deliveryMinutes,
      shops: stores.filter((store) => Number(store.zoneId) === zone.id).length,
      products: products.filter((product) => Number(product.zoneId) === zone.id).length,
      orders: orders.filter((order) => Number(order.zoneId) === zone.id).length,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/service-zones
router.post("/service-zones", async (req: AuthRequest, res) => {
  try {
    const payload = zonePayload(req.body, req.user!.userId);
    const [zone] = await db.insert(serviceZonesTable).values({ ...payload, createdByAdminId: req.user!.userId }).returning();
    await auditZone(req, "zone.created", { zoneId: zone.id, newValue: payload });
    res.status(201).json({ ...zone, zoneCode: zone.code, zoneName: zone.name, status: zone.isActive ? "active" : "paused", defaultDeliveryTime: zone.deliveryMinutes });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not create service zone" });
  }
});

// PATCH /api/admin/service-zones/:zoneId
router.patch("/service-zones/:zoneId", async (req: AuthRequest, res) => {
  try {
    const zoneId = Number(req.params.zoneId);
    const [oldZone] = await db.select().from(serviceZonesTable).where(eq(serviceZonesTable.id, zoneId)).limit(1);
    if (!oldZone) { res.status(404).json({ error: "Service zone not found" }); return; }
    const payload = zonePayload({ ...oldZone, ...req.body, code: req.body.code ?? req.body.zoneCode ?? oldZone.code, name: req.body.name ?? req.body.zoneName ?? oldZone.name, centreLatitude: req.body.centreLatitude ?? oldZone.centreLatitude, centreLongitude: req.body.centreLongitude ?? oldZone.centreLongitude }, req.user!.userId);
    const [zone] = await db.update(serviceZonesTable).set({ ...payload, updatedAt: new Date() }).where(eq(serviceZonesTable.id, zoneId)).returning();
    await auditZone(req, "zone.updated", { zoneId, oldValue: oldZone as any, newValue: payload });
    res.json({ ...zone, zoneCode: zone.code, zoneName: zone.name, status: zone.isActive ? "active" : "paused", defaultDeliveryTime: zone.deliveryMinutes });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update service zone" });
  }
});

// DELETE /api/admin/service-zones/:zoneId
router.delete("/service-zones/:zoneId", async (req: AuthRequest, res) => {
  try {
    const zoneId = Number(req.params.zoneId);
    const hasStores = await db.select({ id: storesTable.id }).from(storesTable).where(eq(storesTable.zoneId, zoneId)).limit(1);
    if (hasStores.length) {
      await db.update(serviceZonesTable).set({ archivedAt: new Date(), isActive: false, acceptingOrders: false, deliveryEnabled: false, updatedByAdminId: req.user!.userId }).where(eq(serviceZonesTable.id, zoneId));
      await auditZone(req, "zone.archived", { zoneId });
      res.json({ message: "Service zone archived because stores are assigned to it." });
      return;
    }
    await db.delete(serviceZonesTable).where(eq(serviceZonesTable.id, zoneId));
    await auditZone(req, "zone.deleted", { zoneId });
    res.json({ message: "Service zone deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/service-zones/:zoneId/assign-seller
router.post("/service-zones/:zoneId/assign-seller", async (req: AuthRequest, res) => {
  try {
    const zoneId = Number(req.params.zoneId);
    const sellerId = Number(req.body.sellerId);
    const shopId = req.body.shopId ? Number(req.body.shopId) : undefined;
    if (!sellerId) { res.status(400).json({ error: "Seller is required" }); return; }
    if (shopId) await db.update(storesTable).set({ zoneId, updatedAt: new Date() }).where(eq(storesTable.id, shopId));
    await db.insert(sellerZoneAssignmentsTable).values({ sellerId, shopId: shopId ?? null, zoneId, status: "approved", assignedByAdminId: req.user!.userId });
    await auditZone(req, "seller.assigned", { zoneId, targetUserId: sellerId, newValue: { shopId } });
    res.json({ message: "Seller assigned to zone" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/service-zones/:zoneId/assign-rider
router.post("/service-zones/:zoneId/assign-rider", async (req: AuthRequest, res) => {
  try {
    const zoneId = Number(req.params.zoneId);
    const riderId = Number(req.body.riderId);
    if (!riderId) { res.status(400).json({ error: "Delivery partner is required" }); return; }
    await db.update(deliveryPartnersTable).set({ currentZoneId: zoneId }).where(eq(deliveryPartnersTable.userId, riderId));
    await db.insert(riderZoneAssignmentsTable).values({ riderId, zoneId, isPrimary: req.body.isPrimary !== false, status: "approved", assignedByAdminId: req.user!.userId });
    await auditZone(req, "rider.assigned", { zoneId, targetUserId: riderId });
    res.json({ message: "Delivery partner assigned to zone" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/zone-change-requests
router.get("/zone-change-requests", async (_req: AuthRequest, res) => {
  try {
    res.json(await db.select().from(zoneChangeRequestsTable).orderBy(desc(zoneChangeRequestsTable.requestedAt)));
  } catch (err) {
    _req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
