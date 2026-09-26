import { eq } from "drizzle-orm";
import { categoriesTable, db, pool, productsTable, serviceZonesTable, storesTable, usersTable } from "@workspace/db";

const LOCAL_ZONE = {
  code: "HSM-783135",
  name: "Hatsingimari Demo Zone",
  city: "Hatsingimari",
  state: "Assam",
  centreLatitude: 25.70986,
  centreLongitude: 89.90078,
};

const CATEGORIES = [
  { name: "Grocery", slug: "grocery", iconEmoji: "G", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=500&q=80", colorClass: "bg-emerald-100 text-emerald-700" },
  { name: "Fresh Produce", slug: "fresh-produce", iconEmoji: "F", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=500&q=80", colorClass: "bg-green-100 text-green-700" },
  { name: "Electronics", slug: "electronics", iconEmoji: "E", imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=500&q=80", colorClass: "bg-blue-100 text-blue-700" },
  { name: "Fashion", slug: "fashion", iconEmoji: "F", imageUrl: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=500&q=80", colorClass: "bg-pink-100 text-pink-700" },
];

const PRODUCTS = [
  { sku: "HSM-DEMO-ATTA", category: "grocery", name: "Aashirvaad Whole Wheat Atta", price: "325.00", mrp: "390.00", weight: "5 kg", unit: "bag", stock: 40, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80", tags: ["atta", "flour", "grocery", "daily"] },
  { sku: "HSM-DEMO-MILK", category: "grocery", name: "Amul Taaza Milk", price: "54.00", mrp: "58.00", weight: "500 ml", unit: "pack", stock: 60, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=900&q=80", tags: ["milk", "dairy", "grocery"] },
  { sku: "HSM-DEMO-RICE", category: "grocery", name: "Premium Basmati Rice", price: "429.00", mrp: "520.00", weight: "5 kg", unit: "bag", stock: 28, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80", tags: ["rice", "grocery", "kitchen"] },
  { sku: "HSM-DEMO-TOMATO", category: "fresh-produce", name: "Fresh Red Tomato", price: "38.00", mrp: "48.00", weight: "1 kg", unit: "kg", stock: 75, image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=900&q=80", tags: ["tomato", "vegetable", "fresh"] },
  { sku: "HSM-DEMO-BANANA", category: "fresh-produce", name: "Farm Fresh Banana", price: "49.00", mrp: "65.00", weight: "6 pcs", unit: "pack", stock: 48, image: "https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=900&q=80", tags: ["banana", "fruit", "fresh"] },
  { sku: "HSM-DEMO-ONION", category: "fresh-produce", name: "Daily Use Onion", price: "36.00", mrp: "46.00", weight: "1 kg", unit: "kg", stock: 70, image: "https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=900&q=80", tags: ["onion", "vegetable", "fresh"] },
  { sku: "HSM-DEMO-EARBUDS", category: "electronics", name: "Wave Bluetooth Earbuds", price: "999.00", mrp: "1599.00", weight: "1 unit", unit: "unit", stock: 18, image: "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=900&q=80", tags: ["earbuds", "bluetooth", "electronics"] },
  { sku: "HSM-DEMO-CHARGER", category: "electronics", name: "Fast Charge USB-C Adapter", price: "499.00", mrp: "799.00", weight: "1 unit", unit: "unit", stock: 32, image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=900&q=80", tags: ["charger", "mobile", "electronics"] },
  { sku: "HSM-DEMO-TSHIRT", category: "fashion", name: "Classic Cotton T-Shirt", price: "399.00", mrp: "699.00", weight: "1 unit", unit: "unit", stock: 35, image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80", tags: ["tshirt", "fashion", "cotton"] },
  { sku: "HSM-DEMO-BACKPACK", category: "fashion", name: "Everyday City Backpack", price: "899.00", mrp: "1299.00", weight: "1 unit", unit: "unit", stock: 20, image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80", tags: ["bag", "backpack", "fashion"] },
];

async function ensureCategory(item: typeof CATEGORIES[number]) {
  const [existing] = await db.select().from(categoriesTable).where(eq(categoriesTable.slug, item.slug)).limit(1);
  if (existing) {
    const [updated] = await db.update(categoriesTable).set({ ...item, isActive: true }).where(eq(categoriesTable.id, existing.id)).returning();
    return updated;
  }
  const [created] = await db.insert(categoriesTable).values({ ...item, isActive: true, sortOrder: 1 }).returning();
  return created;
}

async function main() {
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
  if (!admin) throw new Error("No admin account found. Start the API once before running the shopping demo seed.");

  const [existingZone] = await db.select().from(serviceZonesTable).where(eq(serviceZonesTable.code, LOCAL_ZONE.code)).limit(1);
  const zonePayload = { ...LOCAL_ZONE, radiusMeters: 12000, deliveryMinutes: 35, minimumOrderAmount: "99.00", isActive: true, acceptingOrders: true, deliveryEnabled: true, registrationEnabled: true, sellerRegistrationEnabled: true, riderRegistrationEnabled: true, updatedAt: new Date() };
  const zone = existingZone
    ? (await db.update(serviceZonesTable).set(zonePayload).where(eq(serviceZonesTable.id, existingZone.id)).returning())[0]
    : (await db.insert(serviceZonesTable).values(zonePayload).returning())[0];

  const categoryRows = new Map<string, Awaited<ReturnType<typeof ensureCategory>>>();
  for (const category of CATEGORIES) categoryRows.set(category.slug, await ensureCategory(category));

  const storeName = "Chowdhary Mart Demo Store";
  const [existingStore] = await db.select().from(storesTable).where(eq(storesTable.name, storeName)).limit(1);
  const storePayload = {
    userId: admin.id,
    zoneId: zone.id,
    name: storeName,
    description: "Demo grocery, electronics and fashion products for local shopping.",
    logoUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80",
    bannerUrl: "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=1200&q=80",
    lat: LOCAL_ZONE.centreLatitude,
    lng: LOCAL_ZONE.centreLongitude,
    address: "Hatsingimari Market Road, South Salmara-Mankachar, Assam 783135",
    city: LOCAL_ZONE.city,
    pincode: "783135",
    phone: "9876500001",
    radiusKm: 12,
    minOrderValue: "99.00",
    deliveryFee: "30.00",
    freeDeliveryAbove: "299.00",
    estimatedDeliveryMins: 35,
    rating: "4.60",
    ratingCount: 86,
    isOpen: true,
    isVerified: true,
    isActive: true,
    holidayMode: false,
    commissionPercent: "0.00",
    updatedAt: new Date(),
  };
  const store = existingStore
    ? (await db.update(storesTable).set(storePayload).where(eq(storesTable.id, existingStore.id)).returning())[0]
    : (await db.insert(storesTable).values(storePayload).returning())[0];

  for (const item of PRODUCTS) {
    const category = categoryRows.get(item.category);
    if (!category) throw new Error(`Category missing for ${item.name}`);
    const discountPercent = (((Number(item.mrp) - Number(item.price)) / Number(item.mrp)) * 100).toFixed(2);
    const payload = {
      storeId: store.id,
      zoneId: zone.id,
      categoryId: category.id,
      name: item.name,
      description: `${item.name} available for fast local delivery.`,
      price: item.price,
      mrp: item.mrp,
      discountPercent,
      images: [item.image],
      weight: item.weight,
      unit: item.unit,
      sku: item.sku,
      stock: item.stock,
      lowStockThreshold: 5,
      rating: "4.50",
      reviewCount: 24,
      specifications: { Pack: item.weight, Delivery: "Local delivery" },
      tags: item.tags,
      isAvailable: true,
      isFeatured: true,
      updatedAt: new Date(),
    };
    const [existingProduct] = await db.select().from(productsTable).where(eq(productsTable.sku, item.sku)).limit(1);
    if (existingProduct) await db.update(productsTable).set(payload).where(eq(productsTable.id, existingProduct.id));
    else await db.insert(productsTable).values(payload);
  }

  console.log(JSON.stringify({ zone: zone.name, store: store.name, categories: CATEGORIES.length, products: PRODUCTS.length }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
