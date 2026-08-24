import { Router } from "express";
import { eq, desc, ilike, and, sql, inArray, isNull } from "drizzle-orm";
import {
  db, usersTable, ordersTable, storesTable, couponsTable, couponUsesTable, bannersTable,
  deliveryPartnersTable, productsTable, categoriesTable,
  homepageSectionsTable, homepageSectionProductsTable, walletTransactionsTable,
  serviceZonesTable, sellerZoneAssignmentsTable, riderZoneAssignmentsTable, zoneChangeRequestsTable,
  mediaLibraryTable, withdrawalRequestsTable,
  platformSettingsTable, walletsTable, walletLedgerEntriesTable,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";
import { generateReferralCode, hashPassword } from "../lib/auth";
import { HOMEPAGE_PERMISSIONS, getHomepageSections, slugify } from "../lib/homepage";
import { assertTestModeFeature, testMode } from "../lib/test-mode";
import { auditZone, isInsideZone, validCoordinate } from "../lib/zones";
import { ensureFinanceTables, ensureWallet, getFinanceSettings, settleCompletedOrder } from "../lib/finance";
import { ensurePricingSchema } from "../lib/pricing";
import { DEFAULT_LOCATION } from "../lib/default-location";

const router = Router();

router.use(requireAuth, requireRole("admin"));

const homepageAuditLog: Array<Record<string, unknown>> = [];
let mediaLibraryReady: Promise<void> | null = null;
let adminUsersReady: Promise<void> | null = null;
let deliveryReviewColumnsReady: Promise<void> | null = null;
const payoutSettings = {
  adminCommissionPercent: 8,
  sellerPayoutCycle: "weekly",
  deliveryPayoutCycle: "weekly",
};

function ensureAdminUsersColumns() {
  adminUsersReady ??= (async () => {
    await db.execute(sql`alter table users add column if not exists deleted_at timestamp`);
    await db.execute(sql`alter table users add column if not exists warning text`);
  })();
  return adminUsersReady;
}

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

function ensureDeliveryReviewColumns() {
  deliveryReviewColumnsReady ??= (async () => {
    await db.execute(sql`alter table delivery_partners add column if not exists delivery_status varchar(30) not null default 'pending'`);
    await db.execute(sql`alter table delivery_partners add column if not exists account_holder_name text`);
    await db.execute(sql`alter table delivery_partners add column if not exists bank_name text`);
    await db.execute(sql`alter table delivery_partners add column if not exists bank_account_number text`);
    await db.execute(sql`alter table delivery_partners add column if not exists ifsc varchar(11)`);
    await db.execute(sql`alter table delivery_partners add column if not exists branch_name text`);
    await db.execute(sql`alter table delivery_partners add column if not exists upi_id text`);
    await db.execute(sql`alter table delivery_partners add column if not exists bank_verification_status varchar(40) not null default 'pending_review'`);
    await db.execute(sql`alter table delivery_partners add column if not exists identity_status varchar(40) not null default 'pending_review'`);
    await db.execute(sql`alter table delivery_partners add column if not exists document_status varchar(40) not null default 'pending_review'`);
    await db.execute(sql`alter table delivery_partners add column if not exists selfie_verification_status varchar(40) not null default 'manual_review_required'`);
    await db.execute(sql`alter table delivery_partners add column if not exists face_match_status varchar(40) not null default 'manual_review_required'`);
    await db.execute(sql`alter table delivery_partners add column if not exists profile_selfie text`);
    await db.execute(sql`alter table delivery_partners add column if not exists live_selfie text`);
    await db.execute(sql`alter table delivery_partners add column if not exists aadhaar_last4 varchar(4)`);
    await db.execute(sql`alter table delivery_partners add column if not exists pan_number varchar(10)`);
    await db.execute(sql`alter table delivery_partners add column if not exists emergency_phone varchar(20)`);
    await db.execute(sql`alter table delivery_partners add column if not exists full_address text`);
    await db.execute(sql`alter table delivery_partners add column if not exists city varchar(120)`);
    await db.execute(sql`alter table delivery_partners add column if not exists pincode varchar(12)`);
    await db.execute(sql`alter table delivery_partners add column if not exists address_proof_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists vehicle_front_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists number_plate_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists license_front_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists license_back_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists identity_front_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists identity_back_image text`);
    await db.execute(sql`alter table delivery_partners add column if not exists bank_proof_image text`);
  })();
  return deliveryReviewColumnsReady;
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

function categoryPayload(body: Record<string, unknown>, existing?: typeof categoriesTable.$inferSelect) {
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (name.length < 2) throw new Error("Category name is required");
  return {
    name,
    slug: String(body.slug ?? existing?.slug ?? slugify(name)).trim() || slugify(name),
    imageUrl: String(body.imageUrl ?? existing?.imageUrl ?? "").trim() || null,
    iconEmoji: String(body.iconEmoji ?? existing?.iconEmoji ?? name.charAt(0).toUpperCase()).trim().slice(0, 10) || null,
    colorClass: String(body.colorClass ?? existing?.colorClass ?? "bg-blue-50").trim() || null,
    parentId: body.parentId !== undefined && body.parentId !== "" ? Number(body.parentId) : existing?.parentId ?? null,
    sortOrder: Number(body.sortOrder ?? existing?.sortOrder ?? 0),
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing?.isActive ?? true,
  };
}

function productPayload(body: Record<string, unknown>, existing?: typeof productsTable.$inferSelect) {
  const name = String(body.name ?? existing?.name ?? "").trim();
  const storeId = Number(body.storeId ?? existing?.storeId);
  const categoryId = Number(body.categoryId ?? existing?.categoryId);
  const price = Number(body.price ?? existing?.price ?? 0);
  const mrp = Number(body.mrp ?? existing?.mrp ?? price);
  if (name.length < 2) throw new Error("Product name is required");
  if (!Number.isInteger(storeId) || storeId <= 0) throw new Error("Store is required");
  if (!Number.isInteger(categoryId) || categoryId <= 0) throw new Error("Category is required");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Valid product price is required");
  if (!Number.isFinite(mrp) || mrp <= 0) throw new Error("Valid product MRP is required");
  const images = Array.isArray(body.images)
    ? body.images.map((item) => String(item).trim()).filter(Boolean)
    : String(body.imageUrl ?? "").trim()
      ? [String(body.imageUrl).trim()]
      : existing?.images ?? [];
  const discountPercent = Math.max(0, Math.round(((mrp - price) / Math.max(mrp, 1)) * 100));
  return {
    name,
    storeId,
    categoryId,
    description: String(body.description ?? existing?.description ?? "").trim() || null,
    price: price.toFixed(2),
    mrp: mrp.toFixed(2),
    discountPercent: String(discountPercent),
    images,
    weight: String(body.weight ?? existing?.weight ?? "").trim() || null,
    unit: String(body.unit ?? existing?.unit ?? "pc").trim() || "pc",
    stock: Math.max(0, Number(body.stock ?? existing?.stock ?? 0)),
    isAvailable: body.isAvailable !== undefined ? Boolean(body.isAvailable) : existing?.isAvailable ?? true,
    isFeatured: body.isFeatured !== undefined ? Boolean(body.isFeatured) : existing?.isFeatured ?? false,
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

function hasPolygonBoundary(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  const ring = Array.isArray(geometry.coordinates) && Array.isArray(geometry.coordinates[0]) ? geometry.coordinates[0] : [];
  return geometry.type === "Polygon" && ring.length >= 4;
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
    await ensureAdminUsersColumns();
    await ensureDeliveryReviewColumns();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [counts, allOrders] = await Promise.all([
      db.execute(sql`
        select
          (select count(*) from users where deleted_at is null)::int as "totalUsers",
          (select count(*)
             from stores s
             inner join users u on u.id = s.user_id
            where s.is_active = true
              and s.is_verified = true
              and u.is_active = true
              and u.deleted_at is null)::int as "totalStores",
          (select count(*)
             from stores s
             inner join users u on u.id = s.user_id
            where s.is_active = true
              and s.is_verified = false
              and u.is_active = true
              and u.deleted_at is null)::int as "pendingStores",
          (select count(*)
             from delivery_partners dp
             inner join users u on u.id = dp.user_id
            where dp.is_online = true
              and dp.is_verified = true
              and coalesce(dp.delivery_status, 'pending') = 'approved'
              and u.is_active = true
              and u.deleted_at is null)::int as "activeDeliveryPartners"
      `),
      db.select().from(ordersTable),
    ]);
    const summary = (counts as any)[0] ?? {};

    const todayOrders = allOrders.filter(o => new Date(o.createdAt) >= today);
    const completed = allOrders.filter(o => o.status === "delivered");
    const totalRevenue = completed.reduce((s, o) => s + Number(o.total), 0);
    const todayRevenue = todayOrders.filter(o => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0);

    const recentOrders = await db.select().from(ordersTable)
      .orderBy(desc(ordersTable.createdAt)).limit(10);

    const [firstStore] = await db.select().from(storesTable).limit(1);

    res.json({
      totalUsers: Number(summary.totalUsers ?? 0),
      totalOrders: allOrders.length,
      totalRevenue: totalRevenue.toFixed(2),
      totalStores: Number(summary.totalStores ?? 0),
      pendingStores: Number(summary.pendingStores ?? 0),
      todayOrders: todayOrders.length,
      todayRevenue: todayRevenue.toFixed(2),
      activeDeliveryPartners: Number(summary.activeDeliveryPartners ?? 0),
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
          lat: DEFAULT_LOCATION.lat,
          lng: DEFAULT_LOCATION.lng,
          address: "Demo shop address - replace with live GPS in seller panel",
          city: DEFAULT_LOCATION.city,
          pincode: DEFAULT_LOCATION.pincode,
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
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid section id" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.delete(homepageSectionProductsTable).where(eq(homepageSectionProductsTable.sectionId, id));
      await tx.delete(homepageSectionsTable).where(eq(homepageSectionsTable.id, id));
    });
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
    if (!Number.isInteger(sectionId) || sectionId <= 0 || !Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: "Invalid section or product id" });
      return;
    }
    const removed = await db.delete(homepageSectionProductsTable)
      .where(and(
        eq(homepageSectionProductsTable.sectionId, sectionId),
        sql`(${homepageSectionProductsTable.productId} = ${productId} or ${homepageSectionProductsTable.id} = ${productId})`,
      ))
      .returning({ id: homepageSectionProductsTable.id });
    if (!removed.length) {
      res.status(404).json({ error: "Product is not in this homepage section" });
      return;
    }
    auditHomepage(req, "Product removed", { sectionId, productId });
    res.json({ message: "Product removed", removed: removed.length });
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

// GET /api/admin/wallets
router.get("/wallets", async (req: AuthRequest, res) => {
  try {
    await ensureAdminUsersColumns();
    const users = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      phone: usersTable.phone,
      name: usersTable.name,
      role: usersTable.role,
      walletBalance: usersTable.walletBalance,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    }).from(usersTable)
      .where(sql`deleted_at is null`)
      .orderBy(desc(usersTable.createdAt));

    const ids = users.map((user) => user.id);
    await ensureFinanceTables();
    const earningsWallets = ids.length ? await db.select().from(walletsTable).where(and(inArray(walletsTable.ownerUserId, ids), eq(walletsTable.walletType, "earnings"))) : [];
    const walletMap = new Map(earningsWallets.map((wallet) => [wallet.ownerUserId, wallet]));
    const txns = ids.length
      ? await db.select().from(walletTransactionsTable).where(inArray(walletTransactionsTable.userId, ids)).orderBy(desc(walletTransactionsTable.createdAt)).limit(300)
      : [];
    res.json(users.map((user) => {
      const transactions = txns.filter((txn) => txn.userId === user.id);
      const wallet = walletMap.get(user.id);
      return { ...user, availableBalance: wallet?.availableBalance ?? user.walletBalance, pendingBalance: wallet?.pendingBalance ?? "0.00", heldBalance: wallet?.heldBalance ?? "0.00", transactions: transactions.slice(0, 5), transactionCount: transactions.length };
    }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load wallets" });
  }
});

// POST /api/admin/wallet-adjustments
router.post("/wallet-adjustments", async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.body.userId);
    const amount = Number(req.body.amount);
    const direction = String(req.body.direction ?? "credit") === "debit" ? "debit" : "credit";
    const reason = String(req.body.reason ?? "").trim();
    if (!Number.isInteger(userId) || userId <= 0) { res.status(400).json({ error: "Valid user is required" }); return; }
    if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "Valid amount is required" }); return; }
    if (reason.length < 3) { res.status(400).json({ error: "Adjustment reason is required" }); return; }

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!target) { res.status(404).json({ error: "Wallet user not found" }); return; }
    const current = Number(target.walletBalance ?? 0);
    const next = direction === "credit" ? current + amount : current - amount;
    if (next < 0) { res.status(400).json({ error: "Wallet balance cannot go below zero" }); return; }

    const referenceId = `ADMIN-ADJ-${req.user!.userId}-${Date.now()}`;
    const [txn] = await db.transaction(async (tx) => {
      const wallet = await ensureWallet(tx, userId, String(target.role));
      await tx.update(usersTable).set({ walletBalance: next.toFixed(2), updatedAt: new Date() }).where(eq(usersTable.id, userId));
      await tx.update(walletsTable).set({
        availableBalance: next.toFixed(2),
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, wallet.id));
      await tx.insert(walletLedgerEntriesTable).values({
        walletId: wallet.id,
        transactionType: "MANUAL_ADJUSTMENT",
        direction,
        amount: amount.toFixed(2),
        openingBalance: current.toFixed(2),
        closingBalance: next.toFixed(2),
        referenceType: "admin_adjustment",
        referenceId,
        idempotencyKey: referenceId,
      });
      return tx.insert(walletTransactionsTable).values({
        userId,
        type: direction,
        amount: amount.toFixed(2),
        balance: next.toFixed(2),
        description: `Admin ${direction === "credit" ? "added" : "deducted"} Rs.${amount.toFixed(0)}: ${reason}`,
        referenceId,
        referenceType: "admin_adjustment",
      }).returning();
    });

    res.status(201).json({ balance: next.toFixed(2), transaction: txn });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not adjust wallet" });
  }
});

// GET/PATCH /api/admin/payout-settings
router.get("/payout-settings", async (_req, res) => {
  try {
    await ensurePricingSchema();
    const settings = await getFinanceSettings();
    res.json({ ...settings, adminCommissionPercent: settings.commissionPercentage, deliveryRatePerKm: settings.deliveryRatePerKm });
  } catch (err) {
    res.status(500).json({ error: "Could not load finance settings" });
  }
});

router.patch("/payout-settings", async (req: AuthRequest, res) => {
  try {
    await ensurePricingSchema();
    const current = await getFinanceSettings();
    const commissionPercentage = Math.max(0, Math.min(40, Number(req.body.commissionPercentage ?? req.body.adminCommissionPercent ?? current.commissionPercentage)));
    const deliveryRatePerKm = Math.max(0, Math.min(1000, Number(req.body.deliveryRatePerKm ?? current.deliveryRatePerKm)));
    const settlementMode = ["delay", "daily", "weekly"].includes(String(req.body.settlementMode ?? current.settlementMode)) ? String(req.body.settlementMode ?? current.settlementMode) : current.settlementMode;
    const settlementDelayHours = Math.max(0, Math.min(720, Number(req.body.settlementDelayHours ?? current.settlementDelayHours)));
    const weeklyPayoutDay = Math.max(0, Math.min(6, Number(req.body.weeklyPayoutDay ?? current.weeklyPayoutDay)));
    const minimumWithdrawal = Math.max(1, Number(req.body.minimumWithdrawal ?? current.minimumWithdrawal));
    const [settings] = await db.insert(platformSettingsTable).values({
      singletonKey: "default",
      commissionPercentage: commissionPercentage.toFixed(2),
      deliveryRatePerKm: deliveryRatePerKm.toFixed(2),
      deliveryMinCharge: Math.max(0, Number(req.body.deliveryMinCharge ?? current.deliveryMinCharge ?? 0)).toFixed(2),
      maxDeliveryDistanceKm: Math.max(0, Number(req.body.maxDeliveryDistanceKm ?? current.maxDeliveryDistanceKm ?? 5)).toFixed(2),
      freeDeliveryThreshold: Math.max(0, Number(req.body.freeDeliveryThreshold ?? current.freeDeliveryThreshold ?? 0)).toFixed(2),
      deliveryChargeEnabled: req.body.deliveryChargeEnabled === undefined ? current.deliveryChargeEnabled : Boolean(req.body.deliveryChargeEnabled),
      additionalItemDeliveryPercentage: Math.max(0, Math.min(100, Number(req.body.additionalItemDeliveryPercentage ?? current.additionalItemDeliveryPercentage ?? 50))).toFixed(2),
      firstItemDeliveryPercentage: Math.max(0, Math.min(100, Number(req.body.firstItemDeliveryPercentage ?? current.firstItemDeliveryPercentage ?? 100))).toFixed(2),
      secondItemDeliveryPercentage: Math.max(0, Math.min(100, Number(req.body.secondItemDeliveryPercentage ?? current.secondItemDeliveryPercentage ?? 50))).toFixed(2),
      thirdItemDeliveryPercentage: Math.max(0, Math.min(100, Number(req.body.thirdItemDeliveryPercentage ?? current.thirdItemDeliveryPercentage ?? 50))).toFixed(2),
      freeDeliveryFromItem: Math.max(4, Math.min(100, Math.floor(Number(req.body.freeDeliveryFromItem ?? current.freeDeliveryFromItem ?? 4)))),
      settlementMode,
      settlementDelayHours,
      weeklyPayoutDay,
      minimumWithdrawal: minimumWithdrawal.toFixed(2),
      payoutEnabled: req.body.payoutEnabled === undefined ? current.payoutEnabled : Boolean(req.body.payoutEnabled),
      selfieRequired: req.body.selfieRequired === undefined ? current.selfieRequired : Boolean(req.body.selfieRequired),
      updatedBy: req.user!.userId,
      updatedAt: new Date(),
    }).onConflictDoUpdate({ target: platformSettingsTable.singletonKey, set: {
      commissionPercentage: commissionPercentage.toFixed(2),
      deliveryRatePerKm: deliveryRatePerKm.toFixed(2),
      deliveryMinCharge: Math.max(0, Number(req.body.deliveryMinCharge ?? current.deliveryMinCharge ?? 0)).toFixed(2),
      maxDeliveryDistanceKm: Math.max(0, Number(req.body.maxDeliveryDistanceKm ?? current.maxDeliveryDistanceKm ?? 5)).toFixed(2),
      freeDeliveryThreshold: Math.max(0, Number(req.body.freeDeliveryThreshold ?? current.freeDeliveryThreshold ?? 0)).toFixed(2),
      deliveryChargeEnabled: req.body.deliveryChargeEnabled === undefined ? current.deliveryChargeEnabled : Boolean(req.body.deliveryChargeEnabled),
      additionalItemDeliveryPercentage: Math.max(0, Math.min(100, Number(req.body.additionalItemDeliveryPercentage ?? current.additionalItemDeliveryPercentage ?? 50))).toFixed(2),
      firstItemDeliveryPercentage: Math.max(0, Math.min(100, Number(req.body.firstItemDeliveryPercentage ?? current.firstItemDeliveryPercentage ?? 100))).toFixed(2),
      secondItemDeliveryPercentage: Math.max(0, Math.min(100, Number(req.body.secondItemDeliveryPercentage ?? current.secondItemDeliveryPercentage ?? 50))).toFixed(2),
      thirdItemDeliveryPercentage: Math.max(0, Math.min(100, Number(req.body.thirdItemDeliveryPercentage ?? current.thirdItemDeliveryPercentage ?? 50))).toFixed(2),
      freeDeliveryFromItem: Math.max(4, Math.min(100, Math.floor(Number(req.body.freeDeliveryFromItem ?? current.freeDeliveryFromItem ?? 4)))),
      settlementMode,
      settlementDelayHours,
      weeklyPayoutDay,
      minimumWithdrawal: minimumWithdrawal.toFixed(2),
      payoutEnabled: req.body.payoutEnabled === undefined ? current.payoutEnabled : Boolean(req.body.payoutEnabled),
      selfieRequired: req.body.selfieRequired === undefined ? current.selfieRequired : Boolean(req.body.selfieRequired),
      updatedBy: req.user!.userId,
      updatedAt: new Date(),
    }}).returning();
    res.json({ ...settings, adminCommissionPercent: settings.commissionPercentage, deliveryRatePerKm: settings.deliveryRatePerKm });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not save finance settings" });
  }
});

// GET /api/admin/wallet-withdrawals
router.get("/wallet-withdrawals", async (req: AuthRequest, res) => {
  try {
    const requests = await db.select().from(withdrawalRequestsTable).orderBy(desc(withdrawalRequestsTable.createdAt)).limit(100);
    const userIds = [...new Set(requests.map((item) => item.userId))];
    const users = userIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
    const userMap = new Map(users.map((user) => [user.id, user]));
    res.json(requests.map((item) => ({
      ...item,
      status: String(item.status).toLowerCase(),
      requestedAt: item.createdAt,
      user: userMap.get(item.userId) ?? null,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load transfer requests" });
  }
});

// POST /api/admin/wallet-withdrawals/:id/:action
router.post("/wallet-withdrawals/:id/:action", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const action = req.params.action === "reject" ? "reject" : "approve";
    const [request] = await db.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.id, id)).limit(1);
    if (!request) { res.status(404).json({ error: "Transfer request not found" }); return; }
    if (String(request.status).toLowerCase() !== "pending") { res.status(400).json({ error: "Transfer request already reviewed" }); return; }

    if (action === "reject") {
      const [updated] = await db.transaction(async (tx) => {
        const [wallet] = request.walletId ? await tx.select().from(walletsTable).where(eq(walletsTable.id, request.walletId)).limit(1) : [];
        if (wallet) {
          await tx.update(walletsTable).set({
            availableBalance: sql`${walletsTable.availableBalance} + ${request.amount}`,
            heldBalance: sql`greatest(0, ${walletsTable.heldBalance} - ${request.amount})`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, wallet.id));
        }
        return tx.update(withdrawalRequestsTable)
          .set({ status: "rejected", adminNote: String(req.body.reason ?? "Rejected by admin"), updatedAt: new Date() })
          .where(eq(withdrawalRequestsTable.id, id))
          .returning();
      });
      res.json({ ...updated, status: String(updated.status).toLowerCase(), requestedAt: updated.createdAt });
      return;
    }
    res.status(409).json({ error: "Payout provider is not configured. Approval cannot mark a real transfer as successful." });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not review transfer request" });
  }
});

router.get("/store-applications", async (req: AuthRequest, res) => {
  try {
    const rows = await db.select({ store: storesTable, owner: usersTable })
      .from(storesTable)
      .innerJoin(usersTable, eq(storesTable.userId, usersTable.id))
      .where(eq(usersTable.role, "vendor"))
      .orderBy(desc(storesTable.createdAt));
    res.json(rows.map(({ store, owner }) => ({
      id: store.id,
      userId: owner.id,
      ownerName: owner.name,
      ownerEmail: owner.email,
      ownerPhone: owner.phone,
      ownerPhoto: owner.avatarUrl,
      avatarUrl: owner.avatarUrl,
      shopName: store.name,
      businessType: store.description,
      category: "Local store",
      gstNumber: store.gstin,
      address: store.address,
      city: store.city,
      state: "",
      pincode: store.pincode,
      logoUrl: store.logoUrl,
      shopFrontPhoto: store.bannerUrl ?? store.logoUrl,
      bannerUrl: store.bannerUrl,
      status: store.isVerified ? "approved" : store.isActive ? "pending" : "rejected",
      createdAt: store.createdAt,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load shop applications" });
  }
});

router.post("/store-applications/:id/:action", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const action = String(req.params.action);
    if (!Number.isInteger(id) || !["approve", "reject"].includes(action)) {
      res.status(400).json({ error: "Invalid shop application action" });
      return;
    }
    const approved = action === "approve";
    const [store] = await db.update(storesTable).set({
      isVerified: approved,
      isActive: approved,
      isOpen: approved,
      updatedAt: new Date(),
    }).where(eq(storesTable.id, id)).returning();
    if (!store) { res.status(404).json({ error: "Shop application not found" }); return; }
    await db.update(usersTable)
      .set({ isVerified: approved, updatedAt: new Date() })
      .where(eq(usersTable.id, store.userId));
    await db.update(sellerZoneAssignmentsTable)
      .set({ status: approved ? "approved" : "rejected", assignedByAdminId: req.user!.userId, assignedAt: new Date() })
      .where(eq(sellerZoneAssignmentsTable.shopId, id));
    res.json({ id, status: approved ? "approved" : "rejected" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not review shop application" });
  }
});

router.get("/delivery-applications", async (req: AuthRequest, res) => {
  try {
    await ensureDeliveryReviewColumns();
    await ensureAdminUsersColumns();
    const rows = await db.execute(sql`
      select
        dp.id,
        dp.user_id as "userId",
        u.name,
        u.email,
        u.phone,
        dp.vehicle_type as "vehicleType",
        dp.vehicle_number as "vehicleNumber",
        dp.license_number as "licenseNumber",
        dp.current_lat as "currentLat",
        dp.current_lng as "currentLng",
        coalesce(dp.delivery_status, case when dp.is_verified then 'approved' else 'pending' end) as "deliveryStatus",
        dp.account_holder_name as "accountHolderName",
        dp.bank_name as "bankName",
        dp.bank_account_number as "bankAccountNumber",
        dp.ifsc,
        dp.branch_name as "branchName",
        dp.upi_id as "upiId",
        dp.bank_verification_status as "bankVerificationStatus",
        dp.identity_status as "identityStatus",
        dp.document_status as "documentStatus",
        dp.selfie_verification_status as "selfieVerificationStatus",
        dp.face_match_status as "faceMatchStatus",
        dp.profile_selfie as "profileSelfie",
        dp.live_selfie as "liveSelfie",
        dp.aadhaar_last4 as "aadhaarLast4",
        dp.pan_number as "panNumber",
        dp.aadhaar_document as "aadhaarDocument",
        dp.pan_document as "panDocument",
        dp.emergency_phone as "emergencyPhone",
        dp.full_address as "fullAddress",
        dp.city,
        dp.pincode,
        dp.address_proof_image as "addressProofImage",
        dp.vehicle_front_image as "vehicleFrontImage",
        dp.number_plate_image as "numberPlateImage",
        dp.license_front_image as "licenseFrontImage",
        dp.license_back_image as "licenseBackImage",
        dp.identity_front_image as "identityFrontImage",
        dp.identity_back_image as "identityBackImage",
        dp.bank_proof_image as "bankProofImage",
        dp.created_at as "createdAt"
      from delivery_partners dp
      join users u on u.id = dp.user_id
      where u.deleted_at is null
      order by
        case coalesce(dp.delivery_status, case when dp.is_verified then 'approved' else 'pending' end)
          when 'pending' then 0
          when 'rejected' then 2
          else 1
        end,
        dp.created_at desc
    `);
    res.json((rows as any).rows ?? rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load delivery applications" });
  }
});

router.post("/delivery-partners/:id/:action", async (req: AuthRequest, res) => {
  try {
    await ensureDeliveryReviewColumns();
    await ensureAdminUsersColumns();
    const id = Number(req.params.id);
    const action = String(req.params.action);
    if (!Number.isInteger(id) || id <= 0 || !["approve", "reject"].includes(action)) {
      res.status(400).json({ error: "Invalid delivery partner action" });
      return;
    }
    const nextStatus = action === "approve" ? "approved" : "rejected";
    await db.execute(sql`
      update delivery_partners
      set
        delivery_status = ${nextStatus},
        is_verified = ${action === "approve"},
        is_online = false,
        bank_verification_status = case when ${action === "approve"} then 'approved' else bank_verification_status end,
        identity_status = case when ${action === "approve"} then 'approved' else identity_status end,
        document_status = case when ${action === "approve"} then 'approved' else document_status end,
        selfie_verification_status = case when ${action === "approve"} then 'approved' else selfie_verification_status end,
        face_match_status = case when ${action === "approve"} then 'approved' else face_match_status end
      where id = ${id}
    `);
    const rows = await db.execute(sql`
      select dp.id, dp.user_id as "userId", u.name, coalesce(dp.delivery_status, 'pending') as "deliveryStatus"
      from delivery_partners dp
      join users u on u.id = dp.user_id
      where dp.id = ${id}
      limit 1
    `);
    const updated = ((rows as any).rows ?? rows)?.[0];
    if (!updated) {
      res.status(404).json({ error: "Delivery partner not found" });
      return;
    }
    await db.update(usersTable)
      .set({ isVerified: action === "approve", updatedAt: new Date() })
      .where(eq(usersTable.id, updated.userId));
    await db.update(riderZoneAssignmentsTable)
      .set({ status: action === "approve" ? "approved" : "rejected", assignedByAdminId: req.user!.userId, assignedAt: new Date() })
      .where(eq(riderZoneAssignmentsTable.riderId, updated.userId));
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not update delivery partner approval" });
  }
});

// GET /api/admin/users
router.get("/users", async (req: AuthRequest, res) => {
  try {
    await ensureAdminUsersColumns();
    const { role, q } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const conditions = [sql`deleted_at is null`];
    if (role) conditions.push(eq(usersTable.role, role as "customer" | "vendor" | "delivery_partner" | "admin"));
    if (q) {
      const term = `%${String(q).trim()}%`;
      conditions.push(sql`(${usersTable.name} ilike ${term} or coalesce(${usersTable.email}, '') ilike ${term} or coalesce(${usersTable.phone}, '') ilike ${term})`);
    }

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
      warning: sql<string | null>`warning`,
      createdAt: usersTable.createdAt,
    }).from(usersTable)
      .where(and(...conditions))
      .orderBy(desc(usersTable.createdAt))
      .limit(limit).offset(offset);

    res.json(users);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/users/:userId
router.patch("/users/:userId", async (req: AuthRequest, res) => {
  try {
    await ensureAdminUsersColumns();
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (userId === req.user?.userId && req.body.isActive === false) {
      res.status(400).json({ error: "You cannot block your own admin account." });
      return;
    }

    const [existing] = await db.select().from(usersTable).where(and(eq(usersTable.id, userId), sql`deleted_at is null`)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const nextIsActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined;
    const nextWarning = req.body.warning !== undefined ? String(req.body.warning ?? "").trim() || null : undefined;

    if (nextIsActive === undefined && nextWarning === undefined) {
      res.status(400).json({ error: "No user changes provided" });
      return;
    }

    if (nextIsActive !== undefined && nextWarning !== undefined) {
      await db.execute(sql`update users set is_active = ${nextIsActive}, warning = ${nextWarning}, updated_at = now() where id = ${userId}`);
    } else if (nextIsActive !== undefined) {
      await db.execute(sql`update users set is_active = ${nextIsActive}, updated_at = now() where id = ${userId}`);
    } else {
      await db.execute(sql`update users set warning = ${nextWarning}, updated_at = now() where id = ${userId}`);
    }

    const [updated] = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      phone: usersTable.phone,
      name: usersTable.name,
      role: usersTable.role,
      isActive: usersTable.isActive,
      warning: sql<string | null>`warning`,
      updatedAt: usersTable.updatedAt,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not update user" });
  }
});

// DELETE /api/admin/users/:userId
router.delete("/users/:userId", async (req: AuthRequest, res) => {
  try {
    await ensureAdminUsersColumns();
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (userId === req.user?.userId) {
      res.status(400).json({ error: "You cannot delete your own admin account." });
      return;
    }

    const [existing] = await db.select().from(usersTable).where(and(eq(usersTable.id, userId), sql`deleted_at is null`)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await db.transaction(async (tx) => {
      if (existing.role === "vendor") {
      await tx.execute(sql`delete from delivery_earnings where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from rider_earning_transactions where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from seller_settlements where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from delivery_route where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from delivery_tracking_history where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from active_delivery_locations where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from order_tracking where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from reviews where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from "returns" where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from coupon_uses where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from refunds where parent_order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from payments where parent_order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from payment_attempts where payment_order_id in (select id from payment_orders where parent_order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId})))`);
      await tx.execute(sql`delete from payment_orders where parent_order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from order_items where order_id in (select id from orders where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from orders where store_id in (select id from stores where user_id = ${userId})`);
      await tx.execute(sql`delete from cart_items where product_id in (select id from products where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`update carts set store_id = null, updated_at = now() where store_id in (select id from stores where user_id = ${userId})`);
      await tx.execute(sql`delete from wishlist where product_id in (select id from products where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from homepage_section_products where product_id in (select id from products where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from inventory_ledger where product_id in (select id from products where store_id in (select id from stores where user_id = ${userId}))`);
      await tx.execute(sql`delete from seller_zone_assignments where seller_id = ${userId} or shop_id in (select id from stores where user_id = ${userId})`);
      await tx.execute(sql`delete from products where store_id in (select id from stores where user_id = ${userId})`);
      await tx.execute(sql`delete from stores where user_id = ${userId}`);
      }
      await tx.execute(sql`
        update users
        set is_active = false,
            warning = 'deleted',
            deleted_at = now(),
            updated_at = now()
        where id = ${userId}
      `);
    });

    res.json({ message: existing.role === "vendor" ? "Seller, store and products deleted" : "User deleted", id: userId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({
      error: "Could not delete user",
      details: process.env.NODE_ENV === "production" || !(err instanceof Error) ? undefined : err.message,
    });
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

// PATCH /api/admin/orders/:orderId
router.patch("/orders/:orderId", async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const status = String(req.body.status ?? "");
    const validStatuses = new Set(["pending", "confirmed", "preparing", "packed", "picked_up", "on_the_way", "arriving", "delivered", "cancelled", "returned"]);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    if (!validStatuses.has(status)) {
      res.status(400).json({ error: "Invalid order status" });
      return;
    }

    const [order] = await db.update(ordersTable)
      .set({
        status: status as typeof ordersTable.$inferInsert["status"],
        deliveredAt: status === "delivered" ? new Date() : null,
        cancelledAt: status === "cancelled" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, orderId))
      .returning();
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (status === "delivered") await settleCompletedOrder(orderId);
    res.json(order);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not update order" });
  }
});

// DELETE /api/admin/orders/:orderId
router.delete("/orders/:orderId", async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }

    const [existing] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.execute(sql`delete from delivery_earnings where order_id = ${orderId}`);
      await tx.execute(sql`delete from rider_earning_transactions where order_id = ${orderId}`);
      await tx.execute(sql`delete from seller_settlements where order_id = ${orderId}`);
      await tx.execute(sql`delete from delivery_route where order_id = ${orderId}`);
      await tx.execute(sql`delete from delivery_tracking_history where order_id = ${orderId}`);
      await tx.execute(sql`delete from active_delivery_locations where order_id = ${orderId}`);
      await tx.execute(sql`delete from order_tracking where order_id = ${orderId}`);
      await tx.execute(sql`delete from reviews where order_id = ${orderId}`);
      await tx.execute(sql`delete from "returns" where order_id = ${orderId}`);
      await tx.execute(sql`delete from coupon_uses where order_id = ${orderId}`);
      await tx.execute(sql`delete from refunds where parent_order_id = ${orderId}`);
      await tx.execute(sql`delete from payments where parent_order_id = ${orderId}`);
      await tx.execute(sql`delete from payment_attempts where payment_order_id in (select id from payment_orders where parent_order_id = ${orderId})`);
      await tx.execute(sql`delete from payment_orders where parent_order_id = ${orderId}`);
      await tx.execute(sql`delete from order_items where order_id = ${orderId}`);
      await tx.delete(ordersTable).where(eq(ordersTable.id, orderId));
    });

    res.json({ message: "Order permanently deleted", id: orderId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not delete order" });
  }
});

// GET /api/admin/products
router.get("/products", async (req: AuthRequest, res) => {
  try {
    const products = await db.select().from(productsTable).orderBy(desc(productsTable.createdAt));
    const [stores, categories] = await Promise.all([
      db.select().from(storesTable),
      db.select().from(categoriesTable),
    ]);
    const storeMap = new Map(stores.map((store) => [store.id, store]));
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    res.json(products.map((product) => ({
      ...product,
      store: storeMap.get(product.storeId) ?? null,
      category: product.categoryId ? categoryMap.get(product.categoryId) ?? null : null,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load products" });
  }
});

// POST /api/admin/products
router.post("/products", async (req: AuthRequest, res) => {
  try {
    const payload = productPayload(req.body);
    const [product] = await db.insert(productsTable).values(payload).returning();
    res.status(201).json(product);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not create product" });
  }
});

// PATCH /api/admin/products/:productId
router.patch("/products/:productId", async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }
    const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const payload = productPayload(req.body, existing);
    const [product] = await db.update(productsTable).set(payload).where(eq(productsTable.id, productId)).returning();
    res.json(product);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update product" });
  }
});

// DELETE /api/admin/products/:productId
router.delete("/products/:productId", async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }
    const [existing] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.delete(homepageSectionProductsTable).where(eq(homepageSectionProductsTable.productId, productId));
      await tx.execute(sql`delete from reviews where product_id = ${productId}`);
      await tx.execute(sql`delete from wishlist where product_id = ${productId}`);
      await tx.execute(sql`delete from cart_items where product_id = ${productId}`);
      await tx.execute(sql`update order_items set product_id = null where product_id = ${productId}`);
      await tx.execute(sql`delete from inventory_ledger where product_id = ${productId}`);
      await tx.delete(productsTable).where(eq(productsTable.id, productId));
    });
    res.json({ message: "Product permanently deleted", id: productId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not delete product" });
  }
});

// POST /api/admin/catalog/clear-products-sellers
router.post("/catalog/clear-products-sellers", async (req: AuthRequest, res) => {
  try {
    await ensureAdminUsersColumns();
    await db.transaction(async (tx) => {
      await tx.execute(sql`delete from delivery_earnings where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from rider_earning_transactions where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from seller_settlements where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from delivery_route where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from delivery_tracking_history where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from active_delivery_locations where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from order_tracking where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from reviews where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from "returns" where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from coupon_uses where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from refunds where parent_order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from payments where parent_order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from payment_attempts where payment_order_id in (select id from payment_orders where parent_order_id in (select id from orders where store_id in (select id from stores)))`);
      await tx.execute(sql`delete from payment_orders where parent_order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from order_items where order_id in (select id from orders where store_id in (select id from stores))`);
      await tx.execute(sql`delete from orders where store_id in (select id from stores)`);
      await tx.execute(sql`delete from cart_items where product_id in (select id from products)`);
      await tx.execute(sql`update carts set store_id = null where store_id in (select id from stores)`);
      await tx.execute(sql`delete from wishlist where product_id in (select id from products)`);
      await tx.execute(sql`delete from homepage_section_products where product_id in (select id from products)`);
      await tx.execute(sql`delete from inventory_ledger where product_id in (select id from products)`);
      await tx.delete(productsTable);
      await tx.execute(sql`delete from seller_zone_assignments where shop_id in (select id from stores) or seller_id in (select id from users where role = 'vendor')`);
      await tx.execute(sql`delete from store_hours where store_id in (select id from stores)`);
      await tx.delete(storesTable);
      await tx.execute(sql`
        update users
        set email = null,
            phone = null,
            password_hash = null,
            name = 'Deleted Seller #' || id,
            avatar_url = null,
            referral_code = null,
            is_active = false,
            deleted_at = now(),
            updated_at = now()
        where role = 'vendor'
      `);
    });
    res.json({ message: "Products, stores and sellers cleared", products: 0, stores: 0 });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not clear products and sellers" });
  }
});

// GET /api/admin/stores
router.get("/stores", async (req: AuthRequest, res) => {
  try {
    const stores = await db.select().from(storesTable).where(eq(storesTable.isActive, true)).orderBy(desc(storesTable.createdAt));
    res.json(stores);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/stores/:storeId
router.patch("/stores/:storeId", async (req: AuthRequest, res) => {
  try {
    const storeId = Number(req.params.storeId);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      res.status(400).json({ error: "Invalid store id" });
      return;
    }
    const [existing] = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    const patch: Partial<typeof storesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (req.body.deliveryFee !== undefined) patch.deliveryFee = String(Number(req.body.deliveryFee || 0).toFixed(2));
    if (req.body.freeDeliveryAbove !== undefined) patch.freeDeliveryAbove = String(Number(req.body.freeDeliveryAbove || 0).toFixed(2));
    if (req.body.minOrderValue !== undefined) patch.minOrderValue = String(Number(req.body.minOrderValue || 0).toFixed(2));
    if (req.body.isOpen !== undefined) patch.isOpen = Boolean(req.body.isOpen);
    if (req.body.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);
    if (req.body.zoneId !== undefined) {
      const zoneId = req.body.zoneId === null || req.body.zoneId === "" ? null : Number(req.body.zoneId);
      if (zoneId !== null) {
        const [zone] = await db.select().from(serviceZonesTable).where(and(eq(serviceZonesTable.id, zoneId), isNull(serviceZonesTable.archivedAt))).limit(1);
        if (!zone || !hasPolygonBoundary(zone.boundaryGeometry) || !isInsideZone(zone, Number(existing.lat), Number(existing.lng))) {
          res.status(400).json({ error: "The store location must be inside the selected polygon service area." });
          return;
        }
      }
      patch.zoneId = zoneId;
    }
    const [store] = await db.update(storesTable).set(patch).where(eq(storesTable.id, storeId)).returning();
    if (req.body.isActive !== undefined) {
      await db.update(usersTable)
        .set({ isActive: Boolean(req.body.isActive), updatedAt: new Date() })
        .where(and(eq(usersTable.id, existing.userId), eq(usersTable.role, "vendor")));
    }
    res.json(store);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: "Could not update store" });
  }
});

// DELETE /api/admin/stores/:storeId
router.delete("/stores/:storeId", async (req: AuthRequest, res) => {
  try {
    const storeId = Number(req.params.storeId);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      res.status(400).json({ error: "Invalid store id" });
      return;
    }
    const [existing] = await db.select({ id: storesTable.id, userId: storesTable.userId }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Store not found" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.execute(sql`delete from delivery_earnings where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from rider_earning_transactions where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from seller_settlements where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from delivery_route where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from delivery_tracking_history where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from active_delivery_locations where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from order_tracking where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from reviews where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from "returns" where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from coupon_uses where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from refunds where parent_order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from payments where parent_order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from payment_attempts where payment_order_id in (select id from payment_orders where parent_order_id in (select id from orders where store_id = ${storeId}))`);
      await tx.execute(sql`delete from payment_orders where parent_order_id in (select id from orders where store_id = ${storeId})`);
      await tx.execute(sql`delete from order_items where order_id in (select id from orders where store_id = ${storeId})`);
      await tx.delete(ordersTable).where(eq(ordersTable.storeId, storeId));
      await tx.execute(sql`delete from cart_items where product_id in (select id from products where store_id = ${storeId})`);
      await tx.execute(sql`update carts set store_id = null, updated_at = now() where store_id = ${storeId}`);
      await tx.execute(sql`delete from wishlist where product_id in (select id from products where store_id = ${storeId})`);
      await tx.delete(homepageSectionProductsTable).where(sql`product_id in (select id from products where store_id = ${storeId})`);
      await tx.execute(sql`delete from inventory_ledger where product_id in (select id from products where store_id = ${storeId})`);
      await tx.execute(sql`delete from seller_zone_assignments where shop_id = ${storeId}`);
      await tx.delete(productsTable).where(eq(productsTable.storeId, storeId));
      await tx.delete(storesTable).where(eq(storesTable.id, storeId));
      await tx.execute(sql`
        update users
        set is_active = false,
            warning = 'deleted',
            deleted_at = now(),
            updated_at = now()
        where id = ${existing.userId}
          and role = 'vendor'
          and not exists (select 1 from stores where user_id = ${existing.userId})
      `);
    });

    res.json({ message: "Store permanently deleted", id: storeId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not delete store" });
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

// GET /api/admin/categories
router.get("/categories", async (req: AuthRequest, res) => {
  try {
    const categories = await db.select().from(categoriesTable).orderBy(categoriesTable.sortOrder, categoriesTable.name);
    res.json(categories);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load categories" });
  }
});

// POST /api/admin/categories
router.post("/categories", async (req: AuthRequest, res) => {
  try {
    const payload = categoryPayload(req.body);
    const [category] = await db.insert(categoriesTable).values(payload).returning();
    res.status(201).json(category);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not create category" });
  }
});

// PATCH /api/admin/categories/:categoryId
router.patch("/categories/:categoryId", async (req: AuthRequest, res) => {
  try {
    const categoryId = Number(req.params.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    const [existing] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, categoryId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    const payload = categoryPayload(req.body, existing);
    const [category] = await db.update(categoriesTable).set(payload).where(eq(categoriesTable.id, categoryId)).returning();
    res.json(category);
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update category" });
  }
});

// DELETE /api/admin/categories/:categoryId
router.delete("/categories/:categoryId", async (req: AuthRequest, res) => {
  try {
    const categoryId = Number(req.params.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    const [existing] = await db.select({ id: categoriesTable.id }).from(categoriesTable).where(eq(categoriesTable.id, categoryId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    await ensureMediaLibraryTable();
    await db.transaction(async (tx) => {
      await tx.update(productsTable).set({ categoryId: null, updatedAt: new Date() }).where(eq(productsTable.categoryId, categoryId));
      await tx.update(mediaLibraryTable).set({ categoryId: null, updatedAt: new Date() }).where(eq(mediaLibraryTable.categoryId, categoryId));
      await tx.update(categoriesTable).set({ parentId: null }).where(eq(categoriesTable.parentId, categoryId));
      await tx.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
    });

    res.json({ message: "Category permanently deleted", id: categoryId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not delete category" });
  }
});

// GET /api/admin/service-zones
router.get("/service-zones", async (req: AuthRequest, res) => {
  try {
    // Keep archived zones for historical references, but never return them in the active admin list.
    const zones = await db.select().from(serviceZonesTable)
      .where(isNull(serviceZonesTable.archivedAt))
      .orderBy(desc(serviceZonesTable.createdAt));
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
    // New service areas are polygon-only. Radius circles are no longer a valid
    // source of seller, customer, or rider serviceability.
    if (!hasPolygonBoundary(req.body?.boundaryGeometry)) {
      res.status(400).json({ error: "Draw at least three boundary pins on the map before saving the service area." });
      return;
    }
    const payload = zonePayload(req.body, req.user!.userId);
    const requestedStoreId = req.body?.storeId === undefined || req.body?.storeId === "" || req.body?.storeId === null
      ? null
      : Number(req.body.storeId);
    let storeToAssign: typeof storesTable.$inferSelect | undefined;
    if (requestedStoreId !== null) {
      if (!Number.isInteger(requestedStoreId) || requestedStoreId <= 0) {
        res.status(400).json({ error: "Select a valid store for this service area." });
        return;
      }
      [storeToAssign] = await db.select().from(storesTable).where(and(eq(storesTable.id, requestedStoreId), eq(storesTable.isActive, true))).limit(1);
      if (!storeToAssign || !isInsideZone(payload, Number(storeToAssign.lat), Number(storeToAssign.lng))) {
        res.status(400).json({ error: "The store location must be inside the selected polygon service area." });
        return;
      }
    }
    const [zone] = await db.transaction(async (tx) => {
      const [createdZone] = await tx.insert(serviceZonesTable).values({ ...payload, createdByAdminId: req.user!.userId }).returning();
      if (storeToAssign) {
        await tx.update(storesTable).set({ zoneId: createdZone.id, updatedAt: new Date() }).where(eq(storesTable.id, storeToAssign.id));
      }
      return [createdZone];
    });
    await auditZone(req, "zone.created", { zoneId: zone.id, newValue: payload });
    res.status(201).json({ ...zone, zoneCode: zone.code, zoneName: zone.name, status: zone.isActive ? "active" : "paused", defaultDeliveryTime: zone.deliveryMinutes });
  } catch (err) {
    req.log.error(err);
    const databaseError = err as { code?: string };
    if (databaseError.code === "23505") {
      res.status(409).json({ error: "This zone code already exists. Please use a different zone code." });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not create service zone" });
  }
});

// PATCH /api/admin/service-zones/:zoneId
router.patch("/service-zones/:zoneId", async (req: AuthRequest, res) => {
  try {
    const zoneId = Number(req.params.zoneId);
    const [oldZone] = await db.select().from(serviceZonesTable).where(eq(serviceZonesTable.id, zoneId)).limit(1);
    if (!oldZone) { res.status(404).json({ error: "Service zone not found" }); return; }
    const requestedBoundary = req.body?.boundaryGeometry ?? oldZone.boundaryGeometry;
    if (!hasPolygonBoundary(requestedBoundary)) {
      res.status(400).json({ error: "Draw a custom boundary before using this service area." });
      return;
    }
    const payload = zonePayload({ ...oldZone, ...req.body, code: req.body.code ?? req.body.zoneCode ?? oldZone.code, name: req.body.name ?? req.body.zoneName ?? oldZone.name, centreLatitude: req.body.centreLatitude ?? oldZone.centreLatitude, centreLongitude: req.body.centreLongitude ?? oldZone.centreLongitude }, req.user!.userId);
    const [zone] = await db.update(serviceZonesTable).set({ ...payload, updatedAt: new Date() }).where(eq(serviceZonesTable.id, zoneId)).returning();
    await auditZone(req, "zone.updated", { zoneId, oldValue: oldZone as any, newValue: payload });
    res.json({ ...zone, zoneCode: zone.code, zoneName: zone.name, status: zone.isActive ? "active" : "paused", defaultDeliveryTime: zone.deliveryMinutes });
  } catch (err) {
    req.log.error(err);
    const databaseError = err as { code?: string };
    if (databaseError.code === "23505") {
      res.status(409).json({ error: "This zone code already exists. Please use a different zone code." });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update service zone" });
  }
});

// DELETE /api/admin/service-zones/:zoneId
router.delete("/service-zones/:zoneId", async (req: AuthRequest, res) => {
  let zoneId: number | undefined;
  try {
    zoneId = Number(req.params.zoneId);
    if (!Number.isInteger(zoneId) || zoneId <= 0) {
      res.status(400).json({ error: "Invalid service zone ID" });
      return;
    }
    const [zone] = await db.select({ id: serviceZonesTable.id, archivedAt: serviceZonesTable.archivedAt })
      .from(serviceZonesTable)
      .where(eq(serviceZonesTable.id, zoneId))
      .limit(1);
    if (!zone) {
      res.status(404).json({ error: "Service zone not found" });
      return;
    }
    if (zone.archivedAt) {
      res.json({ message: "Service zone deleted successfully.", deleted: true, alreadyDeleted: true });
      return;
    }

    // Archive instead of hard-deleting because stores, assignments and historical orders can reference this zone.
    const [archived] = await db.update(serviceZonesTable).set({
      archivedAt: new Date(),
      isActive: false,
      acceptingOrders: false,
      deliveryEnabled: false,
      registrationEnabled: false,
      sellerRegistrationEnabled: false,
      riderRegistrationEnabled: false,
      updatedByAdminId: req.user!.userId,
      updatedAt: new Date(),
    }).where(and(eq(serviceZonesTable.id, zoneId), isNull(serviceZonesTable.archivedAt))).returning({ id: serviceZonesTable.id });
    if (!archived) {
      res.status(409).json({ error: "This service zone was already removed. Refresh and try again." });
      return;
    }
    await auditZone(req, "zone.archived", { zoneId });
    res.json({ message: "Service zone deleted successfully.", deleted: true, softDeleted: true });
  } catch (err) {
    const databaseError = err as { code?: string; constraint?: string; detail?: string; message?: string };
    req.log.error({
      err,
      zoneId,
      databaseCode: databaseError.code,
      constraint: databaseError.constraint,
      detail: databaseError.detail,
    }, "Service zone delete failed");
    if (databaseError.code === "23503") {
      res.status(409).json({ error: "This service zone is still linked to active records." });
      return;
    }
    if (databaseError.code === "22P02") {
      res.status(400).json({ error: "Invalid service zone ID." });
      return;
    }
    res.status(500).json({ error: "Unable to delete the service zone. Please try again." });
  }
});

// POST /api/admin/service-zones/:zoneId/assign-seller
router.post("/service-zones/:zoneId/assign-seller", async (req: AuthRequest, res) => {
  try {
    const zoneId = Number(req.params.zoneId);
    const sellerId = Number(req.body.sellerId);
    const shopId = req.body.shopId ? Number(req.body.shopId) : undefined;
    if (!sellerId) { res.status(400).json({ error: "Seller is required" }); return; }
    const [zone] = await db.select().from(serviceZonesTable).where(eq(serviceZonesTable.id, zoneId)).limit(1);
    if (!zone || !hasPolygonBoundary(zone.boundaryGeometry)) { res.status(400).json({ error: "Only polygon service areas can receive sellers." }); return; }
    const [sellerStore] = await db.select().from(storesTable).where(shopId ? eq(storesTable.id, shopId) : eq(storesTable.userId, sellerId)).limit(1);
    if (!sellerStore || !isInsideZone(zone, Number(sellerStore.lat), Number(sellerStore.lng))) {
      res.status(400).json({ error: "The seller shop location must be inside the selected service area." });
      return;
    }
    const assignedShopId = sellerStore.id;
    await db.update(storesTable).set({ zoneId, updatedAt: new Date() }).where(eq(storesTable.id, assignedShopId));
    await db.insert(sellerZoneAssignmentsTable).values({ sellerId, shopId: assignedShopId, zoneId, status: "approved", assignedByAdminId: req.user!.userId });
    await auditZone(req, "seller.assigned", { zoneId, targetUserId: sellerId, newValue: { shopId: assignedShopId } });
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
    const [zone] = await db.select().from(serviceZonesTable).where(eq(serviceZonesTable.id, zoneId)).limit(1);
    if (!zone || !hasPolygonBoundary(zone.boundaryGeometry)) { res.status(400).json({ error: "Only polygon service areas can receive delivery partners." }); return; }
    const [rider] = await db.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.userId, riderId)).limit(1);
    if (!rider || !isInsideZone(zone, Number(rider.currentLat), Number(rider.currentLng))) {
      res.status(400).json({ error: "The delivery partner location must be inside the selected service area." });
      return;
    }
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
