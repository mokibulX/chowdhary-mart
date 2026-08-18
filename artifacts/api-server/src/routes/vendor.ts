import { Router } from "express";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import {
  db, storesTable, ordersTable, orderItemsTable, productsTable,
  orderTrackingTable, usersTable, mediaLibraryTable, categoriesTable
} from "@workspace/db";
import { requireApprovedVendor, requireAuth, requireRole, type AuthRequest } from "../middleware/auth";
import { sellerZoneIds } from "../lib/zones";
import { createAndPushNotification } from "../lib/push-service";
import { expireOrderIfNeeded, lifecycleMeta } from "../lib/order-lifecycle";
import { storePublicImage } from "./uploads";

const router = Router();

router.use(requireAuth, requireRole("vendor", "admin"), requireApprovedVendor);

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

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function categoryRequiresExpiry(value: string) {
  return /(food|grocery|beverage|drink|snack|chocolate|dairy|milk|cosmetic|beauty|medicine|supplement|pet food)/i.test(value);
}

async function prepareProductSpecifications(categoryId: unknown, input: unknown, isAvailable: unknown) {
  const source = input && typeof input === "object" ? { ...(input as Record<string, unknown>) } : {};
  const [category] = categoryId ? await db.select({ name: categoriesTable.name }).from(categoriesTable).where(eq(categoriesTable.id, Number(categoryId))).limit(1) : [];
  const required = categoryRequiresExpiry(String(category?.name ?? "")) || String(source.ExpiryRequired ?? "false").toLowerCase() === "true";
  const mfgDate = textValue(source.MFGDate);
  const expiryDate = textValue(source.ExpiryDate);
  if (required && (!mfgDate || !expiryDate)) throw new Error("This product requires a manufacturing date and expiry date.");
  if (required && expiryDate <= mfgDate) throw new Error("Expiry date must be after the manufacturing date.");
  if (required && isAvailable !== false && expiryDate < new Date().toISOString().slice(0, 10)) throw new Error("Expired products cannot be active inventory.");
  source.ExpiryRequired = String(required);
  if (!required) {
    delete source.MFGDate;
    delete source.ExpiryDate;
  }
  return source as Record<string, string>;
}

// GET /api/vendor/barcode/:barcode
router.get("/barcode/:barcode", async (req: AuthRequest, res) => {
  const barcode = String(req.params.barcode ?? "").replace(/\D/g, "");
  if (barcode.length < 8 || barcode.length > 14) {
    res.status(400).json({ error: "Please enter a valid barcode." });
    return;
  }
  try {
    const fields = [
      "code", "product_name", "product_name_en", "generic_name", "generic_name_en", "brands", "quantity",
      "categories", "categories_tags", "labels", "origins", "manufacturing_places", "countries", "stores",
      "brand_owner", "manufacturer_name", "manufacturer", "product_type", "generic_name", "model_number", "flavor",
      "price", "price_without_taxes", "mrp", "product_price",
      "packaging", "serving_size", "ingredients_text", "allergens", "nutriments", "nutrition_grades",
      "nova_group", "ecoscore_grade", "image_url", "image_front_url", "image_ingredients_url",
      "image_nutrition_url", "image_packaging_url", "expiration_date",
    ].join(",");
    const providers = ["world.openfoodfacts.org", "world.openbeautyfacts.org", "world.openproductsfacts.org"];
    let product: Record<string, unknown> | undefined;
    let source = "Open Facts";
    let providerUnavailable = false;
    let providerResponded = false;
    for (const provider of providers) {
      try {
        const response = await fetch(`https://${provider}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`, {
          headers: { "User-Agent": "ChowdharyMart/1.0 (barcode product import)" },
          signal: AbortSignal.timeout(7000),
        });
        providerResponded = true;
        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) providerUnavailable = true;
          continue;
        }
        const result = await response.json() as { status?: number; product?: Record<string, unknown> };
        if (result.status === 1 && result.product) {
          product = result.product;
          source = provider.includes("beauty") ? "Open Beauty Facts" : provider.includes("products") ? "Open Products Facts" : "Open Food Facts";
          break;
        }
      } catch (error) {
        providerUnavailable = true;
        req.log.warn({ err: error, provider }, "Barcode provider lookup failed");
      }
    }
    if (!product) {
      if (!providerResponded || providerUnavailable) {
        res.status(502).json({ error: "Product lookup is temporarily unavailable. Please try again." });
        return;
      }
      res.status(404).json({ error: "Product not found. Please add the product details manually." });
      return;
    }
    const name = textValue(product.product_name) || textValue(product.product_name_en) || textValue(product.generic_name) || textValue(product.generic_name_en);
    if (!name) {
      res.status(404).json({ error: "Product exists, but its name is not available" });
      return;
    }
    const remoteImageUrls = [product.image_url, product.image_front_url, product.image_ingredients_url, product.image_nutrition_url, product.image_packaging_url]
      .map(textValue)
      .filter((url, index, values) => /^https:\/\//i.test(url) && values.indexOf(url) === index);
    const imageUrls: string[] = [];
    for (const remoteUrl of remoteImageUrls.slice(0, 6)) {
      try {
        const imageResponse = await fetch(remoteUrl, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "ChowdharyMart/1.0 (barcode image import)" } });
        const mime = String(imageResponse.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
        const contentLength = Number(imageResponse.headers.get("content-length") ?? 0);
        if (!imageResponse.ok || !mime.startsWith("image/") || contentLength > 5 * 1024 * 1024) continue;
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        if (!buffer.length || buffer.length > 5 * 1024 * 1024) continue;
        const stored = await storePublicImage(req, buffer, mime, "barcode-products", req.user!.userId);
        imageUrls.push(stored.imageUrl);
      } catch (error) {
        req.log.warn({ err: error, remoteUrl }, "Could not copy barcode image into storage");
        imageUrls.push(remoteUrl);
      }
    }
    const nutriments = product.nutriments && typeof product.nutriments === "object" ? product.nutriments as Record<string, unknown> : {};
    const nutrition = Object.fromEntries(Object.entries(nutriments)
      .filter(([key, value]) => !key.endsWith("_unit") && !key.endsWith("_value") && ["string", "number"].includes(typeof value))
      .slice(0, 30));
    const specifications = Object.fromEntries(Object.entries({
      Brand: textValue(product.brands),
      Company: textValue(product.brand_owner) || textValue(product.manufacturer) || textValue(product.manufacturer_name),
      Category: textValue(product.categories),
      "Product type": textValue(product.product_type),
      Variant: textValue(product.model_number),
      Flavor: textValue(product.flavor),
      Quantity: textValue(product.quantity),
      Packaging: textValue(product.packaging),
      "Serving size": textValue(product.serving_size),
      Labels: textValue(product.labels),
      Origin: textValue(product.origins),
      Manufacturer: textValue(product.manufacturer_name) || textValue(product.manufacturer) || textValue(product.brand_owner),
      "Manufacturer address": textValue(product.manufacturing_places),
      "Country of origin": textValue(product.origins) || textValue(product.countries),
      Countries: textValue(product.countries),
      Stores: textValue(product.stores),
      Ingredients: textValue(product.ingredients_text),
      Allergens: textValue(product.allergens),
      "Nutrition grade": textValue(product.nutrition_grades),
      "NOVA group": product.nova_group == null ? "" : String(product.nova_group),
      "Eco score": textValue(product.ecoscore_grade),
      Nutrition: Object.keys(nutrition).length ? nutrition : undefined,
      Source: source,
      Barcode: barcode,
      ExpiryRequired: String(Boolean(textValue(product.expiration_date)) || categoryRequiresExpiry(`${textValue(product.categories)} ${textValue(product.product_name)}`)),
    }).filter(([, value]) => value !== "" && value !== undefined));
    const catalogMrp = textValue(product.mrp) || textValue(product.product_price) || textValue(product.price_without_taxes) || textValue(product.price);
    res.json({
      barcode,
      name,
      brand: textValue(product.brands),
      company: textValue(product.brand_owner) || textValue(product.manufacturer) || textValue(product.manufacturer_name),
      manufacturer: textValue(product.manufacturer_name) || textValue(product.manufacturer) || textValue(product.brand_owner),
      manufacturerAddress: textValue(product.manufacturing_places),
      countryOfOrigin: textValue(product.origins) || textValue(product.countries),
      description: textValue(product.generic_name) || textValue(product.generic_name_en) || textValue(product.ingredients_text),
      quantity: textValue(product.quantity),
      packSize: textValue(product.quantity),
      unit: textValue(product.quantity).match(/[a-zA-Z]+/)?.[0] || "",
      mrp: catalogMrp,
      productType: textValue(product.product_type),
      variant: textValue(product.model_number),
      flavor: textValue(product.flavor),
      category: textValue(product.categories),
      categoryTags: Array.isArray(product.categories_tags) ? product.categories_tags.map(textValue).filter(Boolean) : [],
      images: imageUrls,
      specifications,
      expiryRequired: Boolean(textValue(product.expiration_date)) || categoryRequiresExpiry(`${textValue(product.categories)} ${textValue(product.product_name)}`),
      source,
    });
  } catch (err) {
    req.log.error(err);
    res.status(502).json({ error: "Barcode service is temporarily unavailable" });
  }
});

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

    const nextShopFrontPhoto = bannerUrl !== undefined ? String(bannerUrl).trim() : String(store.bannerUrl ?? "").trim();
    if (!nextShopFrontPhoto) {
      res.status(400).json({ error: "A clear shop front photo is required for delivery pickup." });
      return;
    }

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

    const enriched = await Promise.all(orders.map(async (rawOrder) => {
      const order = await expireOrderIfNeeded(rawOrder);
      const lifecycle = await lifecycleMeta(order);
      return {
        ...order,
        store,
        items: await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id)),
        lifecycle,
        tracking: { pickupOtp: lifecycle.pickupOtp },
      };
    }));
    res.json(enriched);
  } catch (err) {
    req.log.error(err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const isValidationError = /requires|expiry date|expired products/i.test(message);
    res.status(isValidationError ? 400 : 500).json({ error: isValidationError ? message : "Internal server error" });
  }
});

// PATCH /api/vendor/orders/:orderId/status
router.patch("/orders/:orderId/status", async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { status, reason } = req.body as { status: string; reason?: string };

    const store = await getVendorStore(req.user!.userId);
    if (!store || !(await assertSellerZoneScope(req.user!.userId, store.zoneId))) { res.status(403).json({ error: "Order is outside your service zone." }); return; }
    const [targetOrder] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, store.id))).limit(1);
    if (!targetOrder || (store.zoneId && targetOrder.zoneId && targetOrder.zoneId !== store.zoneId)) { res.status(404).json({ error: "Order not found in your zone" }); return; }
    const isAccept = status === "confirmed" && targetOrder.status === "pending";
    const isReady = status === "packed" && ["confirmed", "preparing"].includes(targetOrder.status);
    const isReject = status === "cancelled" && ["pending", "confirmed", "preparing", "packed"].includes(targetOrder.status);
    if (!isAccept && !isReady && !isReject) {
      res.status(400).json({ error: "Seller can only accept, mark ready, or cancel an order before pickup." });
      return;
    }
    if (isReject && !String(reason ?? "").trim()) {
      res.status(400).json({ error: "A rejection or cancellation reason is required." });
      return;
    }

    const [order] = await db.update(ordersTable)
      .set({
        status: status as typeof ordersTable.$inferInsert["status"],
        cancellationReason: isReject ? String(reason).trim() : null,
        cancelledAt: isReject ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, orderId))
      .returning();

    await db.insert(orderTrackingTable).values({
      orderId,
      status,
      message: isAccept ? "Seller accepted and confirmed the order" : isReady ? "Seller marked the order ready for pickup" : `Seller rejected the order: ${String(reason).trim()}`,
    });

    try {
      await createAndPushNotification({
        userId: targetOrder.userId,
        type: isAccept ? "order_confirmed" : isReady ? "order_ready" : "order_rejected",
        title: isAccept ? "Order confirmed" : isReady ? "Order ready for pickup" : "Order rejected by seller",
        body: isAccept
          ? `The seller accepted order #${targetOrder.orderNumber}. Preparation and delivery matching will begin now.`
          : isReady ? `Order #${targetOrder.orderNumber} is packed and waiting for the delivery partner.`
          : `Order #${targetOrder.orderNumber} was rejected. Reason: ${String(reason).trim()}`,
        data: { orderId, orderNumber: targetOrder.orderNumber, status },
      });
    } catch (notificationError) {
      req.log.warn({ err: notificationError, orderId }, "Customer order notification failed");
    }

    res.json({ ...order, store });
  } catch (err) {
    req.log.error(err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const isValidationError = /requires|expiry date|expired products/i.test(message);
    res.status(isValidationError ? 400 : 500).json({ error: isValidationError ? message : "Internal server error" });
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
    if (!String(store.bannerUrl ?? "").trim()) {
      res.status(400).json({ error: "Add a shop front photo in Store Settings before adding products." });
      return;
    }

    const { name, description, categoryId, brandId, price, mrp, images, weight, unit, sku, specifications, stock, isAvailable, isFeatured } = req.body;
    const productImages = cleanProductImages(images);
    const preparedSpecifications = await prepareProductSpecifications(categoryId, specifications, isAvailable ?? true);
    const discountPercent = mrp && price ? (((Number(mrp) - Number(price)) / Number(mrp)) * 100).toFixed(2) : "0";
    const normalizedSku = textValue(sku);
    if (normalizedSku) {
      const [duplicate] = await db.select({ id: productsTable.id }).from(productsTable)
        .where(and(eq(productsTable.storeId, store.id), eq(productsTable.sku, normalizedSku))).limit(1);
      if (duplicate) {
        res.status(409).json({ error: "This barcode is already linked to a product in your store." });
        return;
      }
    }

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
      sku: normalizedSku || null,
      specifications: preparedSpecifications,
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
    const { name, description, categoryId, price, mrp, weight, unit, sku, specifications, stock, isAvailable, isFeatured, images } = req.body;

    let discountPercent;
    if (mrp && price) {
      discountPercent = (((Number(mrp) - Number(price)) / Number(mrp)) * 100).toFixed(2);
    }

    const store = await getVendorStore(req.user!.userId);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    const [existing] = await db.select().from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.storeId, store.id))).limit(1);
    if (!existing || (store.zoneId && existing.zoneId && existing.zoneId !== store.zoneId)) { res.status(404).json({ error: "Product not found in your zone" }); return; }
    const normalizedSku = textValue(sku);
    if (normalizedSku && normalizedSku !== textValue(existing.sku)) {
      const [duplicate] = await db.select({ id: productsTable.id }).from(productsTable)
        .where(and(eq(productsTable.storeId, store.id), eq(productsTable.sku, normalizedSku))).limit(1);
      if (duplicate) {
        res.status(409).json({ error: "This barcode is already linked to a product in your store." });
        return;
      }
    }
    const nextImages = images === undefined ? existing.images : cleanProductImages(images);
    const preparedSpecifications = await prepareProductSpecifications(categoryId, specifications, isAvailable);

    const [product] = await db.update(productsTable)
      .set({ name, description, categoryId, price, mrp, weight, unit, sku: normalizedSku || null, specifications: preparedSpecifications, stock, isAvailable, isFeatured, images: nextImages, discountPercent, updatedAt: new Date() })
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
      store,
      recentOrders,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
