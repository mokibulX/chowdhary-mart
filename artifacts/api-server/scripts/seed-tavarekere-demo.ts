import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import {
  activeDeliveryLocationsTable,
  cartItemsTable,
  categoriesTable,
  db,
  deliveryPartnersTable,
  homepageSectionProductsTable,
  inventoryLedgerTable,
  liveLocationsTable,
  mediaLibraryTable,
  orderItemsTable,
  productsTable,
  serviceZonesTable,
  sellerZoneAssignmentsTable,
  riderZoneAssignmentsTable,
  storesTable,
  usersTable,
  walletTransactionsTable,
  walletsTable,
} from "@workspace/db";

const TAVAREKERE = {
  code: "TVK-560029",
  name: "Tavarekere 5 KM Zone",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560029",
  lat: 12.9264,
  lng: 77.60527,
};

const password = {
  seller1: "TavarekereSeller@123",
  seller2: "TavarekereSeller@123",
  rider: "TavarekereRider@123",
};

const sellerAccounts = [
  {
    name: "Tavarekere Fresh Basket Owner",
    email: "fresh.tavarekere@chowdharymart.test",
    phone: "9876501101",
    password: password.seller1,
    store: {
      name: "Tavarekere Fresh Basket",
      description: "Fresh vegetables, fruits, milk and daily grocery inside Tavarekere 5 KM local zone.",
      logoUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80",
      bannerUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80",
      lat: 12.92672,
      lng: 77.60562,
      address: "Near Tavarekere Main Road, Bengaluru, Karnataka 560029",
      phone: "9876501101",
      commissionPercent: "8.00",
    },
  },
  {
    name: "Tavarekere Style Hub Owner",
    email: "style.tavarekere@chowdharymart.test",
    phone: "9876501102",
    password: password.seller2,
    store: {
      name: "Tavarekere Style Hub",
      description: "Local fashion, chappal, clothing and quick essentials for Tavarekere customers.",
      logoUrl: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=300&q=80",
      bannerUrl: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1200&q=80",
      lat: 12.92264,
      lng: 77.61148,
      address: "Tavarekere 1st Main, Bengaluru, Karnataka 560029",
      phone: "9876501102",
      commissionPercent: "10.00",
    },
  },
];

const riderAccounts = [
  {
    name: "Rider Arjun Tavarekere",
    email: "rider.tavarekere1@chowdharymart.test",
    phone: "9876501201",
    partnerCode: "TVK-RIDER-001",
    vehicleNumber: "KA05TV1201",
    lat: 12.9272,
    lng: 77.6049,
  },
  {
    name: "Rider Imran Tavarekere",
    email: "rider.tavarekere2@chowdharymart.test",
    phone: "9876501202",
    partnerCode: "TVK-RIDER-002",
    vehicleNumber: "KA05TV1202",
    lat: 12.9242,
    lng: 77.6084,
  },
  {
    name: "Rider Mohan Tavarekere",
    email: "rider.tavarekere3@chowdharymart.test",
    phone: "9876501203",
    partnerCode: "TVK-RIDER-003",
    vehicleNumber: "KA05TV1203",
    lat: 12.9301,
    lng: 77.6019,
  },
];

const categories = [
  {
    name: "Grocery",
    slug: "grocery",
    imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=500&q=80",
    iconEmoji: "G",
    colorClass: "bg-green-100 text-green-700",
  },
  {
    name: "Vegetables",
    slug: "vegetables",
    imageUrl: "https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&w=500&q=80",
    iconEmoji: "V",
    colorClass: "bg-emerald-100 text-emerald-700",
  },
  {
    name: "Fashion",
    slug: "fashion",
    imageUrl: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=500&q=80",
    iconEmoji: "F",
    colorClass: "bg-pink-100 text-pink-700",
  },
  {
    name: "Footwear",
    slug: "footwear",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=500&q=80",
    iconEmoji: "S",
    colorClass: "bg-orange-100 text-orange-700",
  },
  {
    name: "Electronics",
    slug: "electronics",
    imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=500&q=80",
    iconEmoji: "E",
    colorClass: "bg-blue-100 text-blue-700",
  },
];

const productCatalog = [
  {
    sellerEmail: sellerAccounts[0].email,
    categorySlug: "vegetables",
    name: "Tavarekere Fresh Tomato",
    description: "Handpicked fresh red tomatoes for daily cooking.",
    price: "38.00",
    mrp: "48.00",
    weight: "1 kg",
    unit: "kg",
    stock: 80,
    images: [
      "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&q=80",
    ],
    tags: ["tomato", "vegetable", "fresh", "grocery", "tavarekere", "red"],
    specifications: { Quality: "Fresh local stock", Unit: "1 kg", Shelf: "Daily fresh" },
  },
  {
    sellerEmail: sellerAccounts[0].email,
    categorySlug: "vegetables",
    name: "Tavarekere Potato",
    description: "Clean medium-size potatoes for home cooking.",
    price: "32.00",
    mrp: "42.00",
    weight: "1 kg",
    unit: "kg",
    stock: 90,
    images: ["https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&q=80"],
    tags: ["potato", "aloo", "vegetable", "fresh", "grocery"],
    specifications: { Quality: "Washed", Unit: "1 kg", Storage: "Cool dry place" },
  },
  {
    sellerEmail: sellerAccounts[0].email,
    categorySlug: "vegetables",
    name: "Tavarekere Onion",
    description: "Fresh onions for kitchen essentials.",
    price: "36.00",
    mrp: "46.00",
    weight: "1 kg",
    unit: "kg",
    stock: 75,
    images: ["https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=900&q=80"],
    tags: ["onion", "peyaj", "vegetable", "fresh", "grocery"],
    specifications: { Quality: "Fresh", Unit: "1 kg", Origin: "Local market" },
  },
  {
    sellerEmail: sellerAccounts[0].email,
    categorySlug: "grocery",
    name: "Amul Taaza Milk",
    description: "Fresh toned milk pouch for daily use.",
    price: "54.00",
    mrp: "58.00",
    weight: "500 ml",
    unit: "ml",
    stock: 60,
    images: ["https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=900&q=80"],
    tags: ["milk", "amul", "dudh", "grocery", "daily"],
    specifications: { Brand: "Amul", Pack: "500 ml", Type: "Toned milk" },
  },
  {
    sellerEmail: sellerAccounts[0].email,
    categorySlug: "grocery",
    name: "Sona Masoori Rice",
    description: "Everyday rice pack for family meals.",
    price: "329.00",
    mrp: "399.00",
    weight: "5 kg",
    unit: "bag",
    stock: 35,
    images: ["https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80"],
    tags: ["rice", "chal", "grocery", "daily", "sona masoori"],
    specifications: { Variety: "Sona Masoori", Pack: "5 kg", Grain: "Medium" },
  },
  {
    sellerEmail: sellerAccounts[0].email,
    categorySlug: "grocery",
    name: "Fresh Banana",
    description: "Ripe bananas for breakfast and snacks.",
    price: "48.00",
    mrp: "60.00",
    weight: "6 pcs",
    unit: "pack",
    stock: 40,
    images: ["https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=900&q=80"],
    tags: ["banana", "fruit", "fresh", "grocery"],
    specifications: { Pack: "6 pieces", Ripeness: "Ready to eat" },
  },
  {
    sellerEmail: sellerAccounts[1].email,
    categorySlug: "footwear",
    name: "Men Comfort Chappal",
    description: "Soft daily-use chappal with anti-slip sole.",
    price: "249.00",
    mrp: "399.00",
    weight: "Size 6-10",
    unit: "pair",
    stock: 28,
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1560769629-975ec94e6a86?auto=format&fit=crop&w=900&q=80",
    ],
    tags: ["chappal", "slipper", "footwear", "sandal", "men"],
    specifications: { Sizes: "6, 7, 8, 9, 10", Colors: "Black, Brown", Material: "EVA sole" },
  },
  {
    sellerEmail: sellerAccounts[1].email,
    categorySlug: "footwear",
    name: "Women Everyday Sandal",
    description: "Lightweight sandal for daily wear.",
    price: "299.00",
    mrp: "499.00",
    weight: "Size 4-8",
    unit: "pair",
    stock: 22,
    images: ["https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=80"],
    tags: ["sandal", "chappal", "footwear", "women", "fashion"],
    specifications: { Sizes: "4, 5, 6, 7, 8", Colors: "Tan, Black", Material: "Synthetic" },
  },
  {
    sellerEmail: sellerAccounts[1].email,
    categorySlug: "fashion",
    name: "Roadster Denim Jacket",
    description: "Classic denim jacket with regular fit.",
    price: "1199.00",
    mrp: "2999.00",
    weight: "M size",
    unit: "unit",
    stock: 12,
    images: [
      "https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1516762689617-e1cffcef479d?auto=format&fit=crop&w=900&q=80",
    ],
    tags: ["denim", "jacket", "fashion", "clothing", "kapor"],
    specifications: { Sizes: "S, M, L, XL", Colors: "Blue, Black", Fabric: "Denim" },
  },
  {
    sellerEmail: sellerAccounts[1].email,
    categorySlug: "fashion",
    name: "Cotton Daily T-Shirt",
    description: "Comfort cotton t-shirt for everyday use.",
    price: "399.00",
    mrp: "699.00",
    weight: "M size",
    unit: "unit",
    stock: 35,
    images: ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80"],
    tags: ["tshirt", "shirt", "fashion", "cotton", "clothing"],
    specifications: { Sizes: "S, M, L, XL", Colors: "White, Navy, Black", Fabric: "Cotton" },
  },
  {
    sellerEmail: sellerAccounts[1].email,
    categorySlug: "electronics",
    name: "Bluetooth Earbuds",
    description: "Compact earbuds with quick charge case.",
    price: "899.00",
    mrp: "1499.00",
    weight: "ANC unit",
    unit: "unit",
    stock: 18,
    images: ["https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=900&q=80"],
    tags: ["earbuds", "headphones", "electronics", "bluetooth", "music"],
    specifications: { Battery: "24 hours with case", Color: "Black", Warranty: "6 months" },
  },
];

function referralCode(seed: string) {
  return `TVK${seed.replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

async function upsertUser(tx: any, account: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: "vendor" | "delivery_partner";
}) {
  const passwordHash = await bcrypt.hash(account.password, 10);
  const [existing] = await tx.select().from(usersTable).where(eq(usersTable.email, account.email)).limit(1);
  if (existing) {
    const [updated] = await tx
      .update(usersTable)
      .set({
        name: account.name,
        phone: account.phone,
        passwordHash,
        role: account.role,
        isVerified: true,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await tx
    .insert(usersTable)
    .values({
      name: account.name,
      email: account.email,
      phone: account.phone,
      passwordHash,
      role: account.role,
      referralCode: referralCode(account.name),
      isVerified: true,
      isActive: true,
      walletBalance: account.role === "vendor" ? "1000.00" : "500.00",
    })
    .returning();
  return created;
}

async function upsertCategory(tx: any, item: typeof categories[number]) {
  const [existing] = await tx.select().from(categoriesTable).where(eq(categoriesTable.slug, item.slug)).limit(1);
  if (existing) {
    const [updated] = await tx.update(categoriesTable).set({
      name: item.name,
      imageUrl: item.imageUrl,
      iconEmoji: item.iconEmoji,
      colorClass: item.colorClass,
      isActive: true,
    }).where(eq(categoriesTable.id, existing.id)).returning();
    return updated;
  }
  const [created] = await tx.insert(categoriesTable).values({
    ...item,
    sortOrder: 1,
    isActive: true,
  }).returning();
  return created;
}

async function ensureWallet(tx: any, userId: number, role: string, openingBalance: string) {
  const [existing] = await tx.select().from(walletsTable).where(and(eq(walletsTable.ownerUserId, userId), eq(walletsTable.walletType, "main"))).limit(1);
  if (existing) {
    await tx.update(walletsTable).set({
      ownerRole: role,
      availableBalance: openingBalance,
      pendingBalance: "0.00",
      heldBalance: "0.00",
      status: "active",
      updatedAt: new Date(),
    }).where(eq(walletsTable.id, existing.id));
    return;
  }
  await tx.insert(walletsTable).values({
    ownerUserId: userId,
    ownerRole: role,
    walletType: "main",
    availableBalance: openingBalance,
    pendingBalance: "0.00",
    heldBalance: "0.00",
    status: "active",
  });
}

async function ensureMediaLibraryTable() {
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
}

async function main() {
  await ensureMediaLibraryTable();
  const result = await db.transaction(async (tx) => {
    await tx.delete(activeDeliveryLocationsTable);
    await tx.delete(liveLocationsTable);
    await tx.delete(cartItemsTable);
    await tx.delete(inventoryLedgerTable);
    await tx.delete(homepageSectionProductsTable);
    await tx.update(orderItemsTable).set({ productId: null }).where(sql`${orderItemsTable.productId} is not null`);
    await tx.delete(productsTable);
    await tx.update(storesTable).set({ isOpen: false, isActive: false, updatedAt: new Date() });
    await tx.update(deliveryPartnersTable).set({ isOnline: false });

    const [zoneExisting] = await tx.select().from(serviceZonesTable).where(eq(serviceZonesTable.code, TAVAREKERE.code)).limit(1);
    const zone = zoneExisting
      ? (await tx.update(serviceZonesTable).set({
          name: TAVAREKERE.name,
          city: TAVAREKERE.city,
          state: TAVAREKERE.state,
          centreLatitude: TAVAREKERE.lat,
          centreLongitude: TAVAREKERE.lng,
          radiusMeters: 5000,
          deliveryMinutes: 40,
          minimumOrderAmount: "99.00",
          isActive: true,
          acceptingOrders: true,
          deliveryEnabled: true,
          registrationEnabled: true,
          sellerRegistrationEnabled: true,
          riderRegistrationEnabled: true,
          updatedAt: new Date(),
        }).where(eq(serviceZonesTable.id, zoneExisting.id)).returning())[0]
      : (await tx.insert(serviceZonesTable).values({
          code: TAVAREKERE.code,
          name: TAVAREKERE.name,
          city: TAVAREKERE.city,
          state: TAVAREKERE.state,
          centreLatitude: TAVAREKERE.lat,
          centreLongitude: TAVAREKERE.lng,
          radiusMeters: 5000,
          deliveryMinutes: 40,
          minimumOrderAmount: "99.00",
          isActive: true,
          acceptingOrders: true,
          deliveryEnabled: true,
          registrationEnabled: true,
          sellerRegistrationEnabled: true,
          riderRegistrationEnabled: true,
        }).returning())[0];

    const categoryRows = new Map<string, Awaited<ReturnType<typeof upsertCategory>>>();
    for (const category of categories) categoryRows.set(category.slug, await upsertCategory(tx, category));

    const sellerUsers = new Map<string, Awaited<ReturnType<typeof upsertUser>>>();
    const stores = new Map<string, typeof storesTable.$inferSelect>();
    for (const account of sellerAccounts) {
      const user = await upsertUser(tx, { ...account, role: "vendor" });
      sellerUsers.set(account.email, user);
      await ensureWallet(tx, user.id, "vendor", "1000.00");
      await tx.delete(sellerZoneAssignmentsTable).where(eq(sellerZoneAssignmentsTable.sellerId, user.id));

      const [existingStore] = await tx.select().from(storesTable).where(eq(storesTable.userId, user.id)).limit(1);
      const storePayload = {
        zoneId: zone.id,
        name: account.store.name,
        description: account.store.description,
        logoUrl: account.store.logoUrl,
        bannerUrl: account.store.bannerUrl,
        lat: account.store.lat,
        lng: account.store.lng,
        address: account.store.address,
        city: TAVAREKERE.city,
        pincode: TAVAREKERE.pincode,
        phone: account.store.phone,
        radiusKm: 5,
        minOrderValue: "99.00",
        deliveryFee: "40.00",
        freeDeliveryAbove: "299.00",
        estimatedDeliveryMins: 40,
        rating: "4.70",
        ratingCount: 128,
        isOpen: true,
        isVerified: true,
        isActive: true,
        holidayMode: false,
        gstin: null,
        commissionPercent: account.store.commissionPercent,
        updatedAt: new Date(),
      };
      const store = existingStore
        ? (await tx.update(storesTable).set(storePayload).where(eq(storesTable.id, existingStore.id)).returning())[0]
        : (await tx.insert(storesTable).values({ userId: user.id, ...storePayload }).returning())[0];
      stores.set(account.email, store);
      await tx.insert(sellerZoneAssignmentsTable).values({
        sellerId: user.id,
        shopId: store.id,
        zoneId: zone.id,
        assignmentType: "primary",
        status: "approved",
      });
    }

    const riderRows = [];
    for (const account of riderAccounts) {
      const user = await upsertUser(tx, { ...account, password: password.rider, role: "delivery_partner" });
      await ensureWallet(tx, user.id, "delivery_partner", "500.00");
      await tx.delete(riderZoneAssignmentsTable).where(eq(riderZoneAssignmentsTable.riderId, user.id));
      const [existingPartner] = await tx.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.userId, user.id)).limit(1);
      const partnerPayload = {
        currentZoneId: zone.id,
        vehicleType: "bike" as const,
        vehicleNumber: account.vehicleNumber,
        licenseNumber: account.partnerCode,
        isOnline: true,
        isVerified: true,
        currentLat: account.lat,
        currentLng: account.lng,
        rating: "4.80",
        totalDeliveries: 24,
        totalEarnings: "0.00",
      };
      const partner = existingPartner
        ? (await tx.update(deliveryPartnersTable).set(partnerPayload).where(eq(deliveryPartnersTable.id, existingPartner.id)).returning())[0]
        : (await tx.insert(deliveryPartnersTable).values({ userId: user.id, ...partnerPayload }).returning())[0];
      await tx.insert(riderZoneAssignmentsTable).values({
        riderId: user.id,
        zoneId: zone.id,
        isPrimary: true,
        status: "approved",
      });
      await tx.insert(liveLocationsTable).values({
        deliveryPartnerId: partner.id,
        lat: account.lat,
        lng: account.lng,
        speed: 0,
        heading: 90,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: liveLocationsTable.deliveryPartnerId,
        set: { lat: account.lat, lng: account.lng, speed: 0, heading: 90, updatedAt: new Date() },
      });
      riderRows.push({ ...account, userId: user.id, partnerId: partner.id });
    }

    const productRows = [];
    for (const item of productCatalog) {
      const store = stores.get(item.sellerEmail);
      const category = categoryRows.get(item.categorySlug);
      if (!store || !category) throw new Error(`Missing store/category for ${item.name}`);
      const discount = (((Number(item.mrp) - Number(item.price)) / Number(item.mrp)) * 100).toFixed(2);
      const [product] = await tx.insert(productsTable).values({
        storeId: store.id,
        zoneId: zone.id,
        categoryId: category.id,
        name: item.name,
        description: item.description,
        price: item.price,
        mrp: item.mrp,
        discountPercent: discount,
        images: item.images,
        weight: item.weight,
        unit: item.unit,
        sku: `TVK-${item.name.replace(/[^a-z0-9]+/gi, "-").toUpperCase().slice(0, 35)}`,
        stock: item.stock,
        lowStockThreshold: 5,
        rating: "4.60",
        reviewCount: 24,
        specifications: item.specifications,
        tags: item.tags,
        isAvailable: true,
        isFeatured: true,
      }).returning();
      productRows.push(product);

      const [existingMedia] = await tx.select().from(mediaLibraryTable).where(eq(mediaLibraryTable.imageUrl, item.images[0])).limit(1);
      if (existingMedia) {
        await tx.update(mediaLibraryTable).set({
          title: item.name,
          description: item.description,
          categoryId: category.id,
          sourceType: "seed_product",
          tags: item.tags,
          isApproved: true,
          updatedAt: new Date(),
        }).where(eq(mediaLibraryTable.id, existingMedia.id));
      } else {
        await tx.insert(mediaLibraryTable).values({
          title: item.name,
          description: item.description,
          imageUrl: item.images[0],
          storageProvider: "external_demo",
          categoryId: category.id,
          sourceType: "seed_product",
          tags: item.tags,
          isApproved: true,
        });
      }
    }

    for (const account of [...sellerAccounts, ...riderAccounts]) {
      const user = await tx.select().from(usersTable).where(eq(usersTable.email, account.email)).limit(1).then((rows) => rows[0]);
      if (user) {
        const amount = user.role === "vendor" ? "1000.00" : "500.00";
        await tx.delete(walletTransactionsTable).where(and(eq(walletTransactionsTable.userId, user.id), eq(walletTransactionsTable.referenceType, "tavarekere_seed")));
        await tx.insert(walletTransactionsTable).values({
          userId: user.id,
          type: "credit",
          amount,
          balance: amount,
          description: "Tavarekere demo wallet opening balance",
          referenceId: `TVK-SEED-${user.id}`,
          referenceType: "tavarekere_seed",
        });
      }
    }

    return {
      zone,
      sellers: sellerAccounts.map((account) => ({
        shop: account.store.name,
        email: account.email,
        phone: account.phone,
        password: account.password,
        storeId: stores.get(account.email)?.id,
      })),
      riders: riderRows.map((rider) => ({
        id: rider.partnerCode,
        email: rider.email,
        phone: rider.phone,
        password: password.rider,
        partnerId: rider.partnerId,
      })),
      products: productRows.length,
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import("@workspace/db");
    await pool.end().catch(() => undefined);
  });
