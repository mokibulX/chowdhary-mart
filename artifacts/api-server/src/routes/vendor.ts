import { Router } from "express";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import {
  db, storesTable, ordersTable, orderItemsTable, productsTable, serviceZonesTable, addressesTable,
  orderTrackingTable, usersTable, mediaLibraryTable, categoriesTable
} from "@workspace/db";
import { readEnv } from "@workspace/db";
import { requireApprovedVendor, requireAuth, requireRole, type AuthRequest } from "../middleware/auth";
import { sellerZoneIds } from "../lib/zones";
import { createAndPushNotification } from "../lib/push-service";
import { expireOrderIfNeeded, lifecycleMeta } from "../lib/order-lifecycle";
import { storePublicImage } from "./uploads";
import { advanceDeliveryOffer } from "../lib/delivery-offers";

const router = Router();

router.use(requireAuth, requireRole("vendor", "admin"), requireApprovedVendor);

let mediaLibraryReady: Promise<void> | null = null;
let barcodeMasterReady: Promise<void> | null = null;

function ensureBarcodeMasterTable() {
  barcodeMasterReady ??= db.execute(sql`
    create table if not exists barcode_product_master (
      barcode varchar(14) primary key,
      name varchar(255) not null,
      brand varchar(255),
      category varchar(255),
      description text,
      quantity varchar(100),
      unit varchar(40),
      images jsonb not null default '[]'::jsonb,
      specifications jsonb not null default '{}'::jsonb,
      source varchar(80) not null default 'manual',
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    )
  `).then(() => undefined);
  return barcodeMasterReady;
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
  const valid = urls.filter((url) => /^https?:\/\//i.test(url) || /^\/(?:api\/)?uploads\//i.test(url));
  if (valid.length !== urls.length) throw new Error("Every product image must be a valid storage URL.");
  return Array.from(new Set(valid)).slice(0, 12);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function catalogText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(catalogText).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      record.name,
      record.title,
      record.role,
      record.rating,
      record.price,
      record.currency_symbol ?? record.currency,
      record.review,
      record.link,
      record.url,
    ].map(catalogText).filter(Boolean).join(" - ");
  }
  return "";
}

function imageValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(imageValues);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [record.url, record.image_url, record.image, record.src, ...Object.values(record)].flatMap(imageValues);
  }
  return [];
}

function barcodeUrl(template: string, barcode: string) {
  return template.replace(/\{barcode\}/gi, encodeURIComponent(barcode));
}

function hasValidGtinCheckDigit(value: string) {
  if (![8, 12, 13, 14].includes(value.length)) return true;
  const body = value.slice(0, -1);
  const expected = (10 - [...body].reverse().reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 3 : 1), 0) % 10) % 10;
  return expected === Number(value.at(-1));
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
  if (!hasValidGtinCheckDigit(barcode)) {
    res.status(400).json({ error: "This EAN/UPC check digit is invalid. Please scan the complete product code and try again." });
    return;
  }
  try {
    await ensureBarcodeMasterTable();
    const fields = [
      "code", "product_name", "product_name_en", "generic_name", "generic_name_en", "brands", "quantity",
      "categories", "categories_tags", "labels", "origins", "manufacturing_places", "countries", "stores",
      "brand_owner", "manufacturer_name", "manufacturer", "product_type", "generic_name", "model_number", "flavor",
      "price", "price_without_taxes", "mrp", "product_price",
      "packaging", "serving_size", "ingredients_text", "allergens", "nutriments", "nutrition_grades",
      "nova_group", "ecoscore_grade", "image_url", "image_front_url", "image_front_small_url", "image_front_thumb_url",
      "image_small_url", "image_ingredients_url", "image_ingredients_small_url", "image_nutrition_url", "image_nutrition_small_url",
      "image_packaging_url", "image_packaging_small_url", "selected_images", "expiration_date",
    ].join(",");
    // These are free, no-key Open Facts catalogues. A product is only
    // auto-filled when one of them has a matching EAN; otherwise the seller
    // can continue with the manual form below.
    const providers = [
      { name: "Open Food Facts", template: readEnv("OPENFOODFACTS_PRODUCT_V2_URL") || "https://world.openfoodfacts.org/api/v2/product/{barcode}.json" },
      { name: "Open Beauty Facts", template: readEnv("OPENBEAUTYFACTS_PRODUCT_URL") || "https://world.openbeautyfacts.org/api/v2/product/{barcode}.json" },
      { name: "Open Products Facts", template: readEnv("OPENPRODUCTSFACTS_PRODUCT_URL") || "https://world.openproductsfacts.org/api/v2/product/{barcode}.json" },
      { name: "Open Pet Food Facts", template: readEnv("OPENPETFOODFACTS_PRODUCT_URL") || "https://world.openpetfoodfacts.org/api/v2/product/{barcode}.json" },
    ];
    let product: Record<string, unknown> | undefined;
    let fallbackProduct: Record<string, unknown> | undefined;
    let source = "Open Facts";
    let providerUnavailable = false;
    let providerResponded = false;

    // Use cMart's own product catalog first. This path needs no external API key
    // and preserves the exact images/details already approved in the marketplace.
    const [localProduct] = await db.select().from(productsTable)
      .where(eq(productsTable.sku, barcode))
      .orderBy(desc(productsTable.createdAt))
      .limit(1);
    if (localProduct) {
      const localSpecs = localProduct.specifications ?? {};
      const localCandidate = {
        barcode_number: localProduct.sku,
        title: localProduct.name,
        description: localProduct.description,
        images: localProduct.images ?? [],
        quantity: localProduct.weight,
        brand: localSpecs.Brand,
        category: localSpecs.Category,
        manufacturer: localSpecs.Manufacturer,
        model: localSpecs.Model,
        mrp: localProduct.mrp,
        price: localProduct.price,
        specifications: localSpecs,
      };
      const localImages = imageValues(localProduct.images)
        .map((url) => url.startsWith("//") ? `https:${url}` : url.replace(/^http:\/\//i, "https://"))
        .filter((url) => /^https:\/\//i.test(url) || /^\/(?:api\/)?uploads\//i.test(url));
      if (localImages.length) {
        product = localCandidate;
        source = "cMart Catalog";
        providerResponded = true;
      } else {
        // Keep image-less local records as a fallback, but still ask the
        // barcode providers for a product image before returning them.
        fallbackProduct = localCandidate;
      }
    }
    if (!product) {
      const cached = await db.execute(sql`
        select barcode, name, brand, category, description, quantity, unit, images, specifications
        from barcode_product_master where barcode = ${barcode} limit 1
      `);
      const row = (cached as any).rows?.[0];
      if (row) {
        const cachedProduct = {
          barcode_number: row.barcode,
          title: row.name,
          brand: row.brand,
          categories: row.category,
          description: row.description,
          quantity: row.quantity,
          images: row.images ?? [],
          specifications: row.specifications ?? {},
        };
        const cachedImages = imageValues(row.images)
          .map((url) => url.startsWith("//") ? `https:${url}` : url.replace(/^http:\/\//i, "https://"))
          .filter((url) => /^https:\/\//i.test(url) || /^\/(?:api\/)?uploads\//i.test(url));
        if (cachedImages.length) {
          product = cachedProduct;
          source = "cMart Barcode Master";
          providerResponded = true;
        } else {
          // Older lookups may have cached details before image support was
          // added. Refresh those entries instead of returning an empty image.
          fallbackProduct ??= cachedProduct;
        }
      }
    }
    // UPCitemdb's free Explorer endpoint needs no signup or API key and
    // covers many non-food products that community food catalogues miss.
    // It is rate-limited to 100 lookups per day, so cMart's own catalogues
    // remain the first source and the Open Facts sources remain fallbacks.
    if (!product) {
      try {
        const upcTemplate = readEnv("UPCITEMDB_TRIAL_LOOKUP_URL") || "https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}";
        const response = await fetch(barcodeUrl(upcTemplate, barcode), {
          headers: { Accept: "application/json", "User-Agent": "ChowdharyMart/1.0 (free EAN product lookup)" },
          signal: AbortSignal.timeout(7000),
        });
        providerResponded = true;
        if (response.ok) {
          const result = await response.json() as { code?: string; items?: Record<string, unknown>[] };
          if (result.code === "OK" && Array.isArray(result.items) && result.items[0]) {
            product = result.items[0];
            source = "UPCitemdb Explorer";
          }
        } else if (response.status === 429) {
          providerUnavailable = true;
          req.log.warn("UPCitemdb free lookup limit reached");
        }
      } catch (error) {
        providerUnavailable = true;
        req.log.warn({ err: error }, "UPCitemdb lookup failed");
      }
    }
    const barcodeLookupKey = readEnv("BARCODE_LOOKUP_API_KEY");
    if (!product && barcodeLookupKey) {
      try {
        const response = await fetch(`https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(barcode)}&formatted=y&key=${encodeURIComponent(barcodeLookupKey)}`, {
          headers: { "User-Agent": "ChowdharyMart/1.0 (barcode product import)", accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        providerResponded = true;
        if (response.ok) {
          const result = await response.json() as { products?: Record<string, unknown>[] };
          if (Array.isArray(result.products) && result.products[0]) {
            product = result.products[0];
            source = "Barcode Lookup";
          }
        } else if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
          providerUnavailable = true;
          req.log.warn({ status: response.status }, "Barcode Lookup API request failed");
        }
      } catch (error) {
        providerUnavailable = true;
        req.log.warn({ err: error }, "Barcode Lookup API request failed");
      }
    }
    // The current Open Facts API can search across food, beauty, pet-food
    // and general products with one request. Keep the older catalogue calls
    // below as fallbacks for compatibility and broader coverage.
    if (!product) {
      try {
        const openFactsTemplate = readEnv("OPENFOODFACTS_PRODUCT_URL") || "https://world.openfoodfacts.org/api/v3/product/{barcode}";
        const openFactsUrl = barcodeUrl(openFactsTemplate, barcode);
        const response = await fetch(`${openFactsUrl}${openFactsUrl.includes("?") ? "&" : "?"}product_type=all&fields=${fields}`, {
          headers: { "User-Agent": "ChowdharyMart/1.0 (free EAN product lookup)" },
          signal: AbortSignal.timeout(7000),
        });
        providerResponded = true;
        if (response.ok) {
          const result = await response.json() as { status?: number; product?: Record<string, unknown> };
          if (result.status === 1 && result.product) {
            product = result.product;
            source = "Open Facts (all product types)";
          }
        }
      } catch (error) {
        providerUnavailable = true;
        req.log.warn({ err: error }, "Unified Open Facts lookup failed");
      }
    }
    const productHasImage = product && [
      product.image_front_url, product.image_url, product.image_front_small_url,
      product.image_small_url, product.selected_images, product.images,
    ].some((value) => imageValues(value).some((url) => /^https?:\/\//i.test(url)));
    for (const provider of product && productHasImage ? [] : providers) {
      try {
        const providerUrl = barcodeUrl(provider.template, barcode);
        const response = await fetch(`${providerUrl}${providerUrl.includes("?") ? "&" : "?"}fields=${fields}`, {
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
          product = product ? { ...result.product, ...product } : result.product;
          source = productHasImage ? source : provider.name;
          break;
        }
      } catch (error) {
        providerUnavailable = true;
        req.log.warn({ err: error, provider: provider.name }, "Barcode provider lookup failed");
      }
    }
    if (!product && fallbackProduct) {
      product = fallbackProduct;
      source = "cMart Catalog";
      providerResponded = true;
    }
    if (!product) {
      res.status(404).json({
        error: providerUnavailable || !providerResponded
          ? "EAN service is temporarily unavailable. Please try again or add the product details manually."
          : "This EAN is valid, but no product record was found in the connected catalogues. You can add the product details manually.",
        ean: barcode,
        canAddManually: true,
      });
      return;
    }
    const name = textValue(product.title) || textValue(product.product_name) || textValue(product.product_name_en) || textValue(product.generic_name) || textValue(product.generic_name_en);
    if (!name) {
      res.status(404).json({ error: "Product exists, but its name is not available" });
      return;
    }
    const selectedImages = imageValues(product.images).concat(imageValues(product.selected_images));
    const remoteImageUrls = [
      product.image_front_url, product.image_url, product.image_front_small_url, product.image_small_url, product.image_front_thumb_url,
      product.image_ingredients_url, product.image_ingredients_small_url, product.image_nutrition_url,
      product.image_nutrition_small_url, product.image_packaging_url, product.image_packaging_small_url,
      ...selectedImages,
    ]
      .flatMap(imageValues)
      .map((url) => url.startsWith("//") ? `https:${url}` : url)
      .map((url) => url.replace(/^http:\/\//i, "https://"))
      .filter((url, index, values) => /^https:\/\//i.test(url) && values.indexOf(url) === index);
    const imageUrls: string[] = [];
    for (const remoteUrl of remoteImageUrls.slice(0, 6)) {
      let stored = false;
      try {
        const imageResponse = await fetch(remoteUrl, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "ChowdharyMart/1.0 (barcode image import)" } });
        const responseMime = String(imageResponse.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
        const mime = responseMime === "image/jpg" ? "image/jpeg" : responseMime;
        const contentLength = Number(imageResponse.headers.get("content-length") ?? 0);
        if (imageResponse.ok && mime.startsWith("image/") && contentLength <= 5 * 1024 * 1024) {
          const buffer = Buffer.from(await imageResponse.arrayBuffer());
          if (buffer.length && buffer.length <= 5 * 1024 * 1024) {
            const saved = await storePublicImage(req, buffer, mime, "barcode-products", req.user!.userId);
            imageUrls.push(saved.imageUrl);
            stored = true;
          }
        }
      } catch (error) {
        req.log.warn({ err: error, remoteUrl }, "Could not copy barcode image into storage");
      }
      // Keep a valid provider URL as a last-resort fallback. This prevents a
      // storage/content-type issue from turning an available product photo
      // into an empty image panel.
      if (!stored && !imageUrls.includes(remoteUrl)) imageUrls.push(remoteUrl);
    }
    const nutriments = product.nutriments && typeof product.nutriments === "object" ? product.nutriments as Record<string, unknown> : {};
    const nutrition = Object.fromEntries(Object.entries(nutriments)
      .filter(([key, value]) => !key.endsWith("_unit") && !key.endsWith("_value") && ["string", "number"].includes(typeof value))
      .slice(0, 30));
    const barcodeNumber = catalogText(product.barcode_number) || textValue(product.barcode) || barcode;
    const categoryText = textValue(product.category) || textValue(product.categories);
    const quantityText = textValue(product.quantity) || textValue(product.pack_size) || textValue(product.size) || textValue(product.weight);
    const expiryRequired = categoryRequiresExpiry(`${categoryText} ${textValue(product.product_name)} ${textValue(product.title)}`);
    const specifications = Object.fromEntries(Object.entries({
      Brand: textValue(product.brand) || textValue(product.brands),
      Company: textValue(product.company) || textValue(product.brand_owner) || textValue(product.manufacturer) || textValue(product.manufacturer_name),
      Category: categoryText,
      "Product type": textValue(product.product_type),
      Variant: textValue(product.model_number) || catalogText(product.model),
      Flavor: textValue(product.flavor),
      Quantity: quantityText,
      Packaging: textValue(product.packaging),
      "Serving size": textValue(product.serving_size),
      Labels: textValue(product.labels),
      Origin: textValue(product.origins),
      Manufacturer: textValue(product.manufacturer) || textValue(product.manufacturer_name) || textValue(product.brand_owner),
      "Manufacturer address": textValue(product.manufacturing_places),
      "Country of origin": textValue(product.origins) || textValue(product.countries),
      Countries: textValue(product.countries),
      Stores: textValue(product.stores),
      "Store pricing": catalogText(product.stores),
      Features: catalogText(product.features),
      Specifications: catalogText(product.specifications),
      Ingredients: catalogText(product.ingredients) || textValue(product.ingredients_text),
      Allergens: textValue(product.allergens),
      "Nutrition facts": catalogText(product.nutrition_facts),
      "Nutrition grade": textValue(product.nutrition_grades),
      "NOVA group": product.nova_group == null ? "" : String(product.nova_group),
      "Eco score": textValue(product.ecoscore_grade),
      "Barcode formats": catalogText(product.barcode_formats),
      MPN: catalogText(product.mpn),
      Model: catalogText(product.model),
      ASIN: catalogText(product.asin),
      Contributors: catalogText(product.contributors),
      "Age group": catalogText(product.age_group),
      Color: catalogText(product.color),
      Gender: catalogText(product.gender),
      Material: catalogText(product.material),
      Pattern: catalogText(product.pattern),
      "Energy efficiency": catalogText(product.energy_efficiency_rating),
      Multipack: catalogText(product.multipack),
      Size: catalogText(product.size),
      Length: catalogText(product.length),
      Width: catalogText(product.width),
      Height: catalogText(product.height),
      Weight: catalogText(product.weight),
      "Release date": catalogText(product.release_date),
      Reviews: catalogText(product.reviews),
      Nutrition: Object.keys(nutrition).length ? nutrition : undefined,
      Source: source,
      Barcode: barcodeNumber,
      ExpiryRequired: String(expiryRequired),
    }).filter(([, value]) => value !== "" && value !== undefined));
    const catalogMrp = textValue(product.mrp) || textValue(product.product_price) || textValue(product.price_without_taxes);
    await db.execute(sql`
      insert into barcode_product_master
        (barcode, name, brand, category, description, quantity, unit, images, specifications, source, updated_at)
      values
        (${barcodeNumber}, ${name}, ${textValue(product.brand) || textValue(product.brands) || null},
         ${categoryText || null}, ${textValue(product.description) || null}, ${quantityText || null},
         ${quantityText.match(/[a-zA-Z]+/)?.[0] || null}, ${JSON.stringify(imageUrls)}::jsonb,
         ${JSON.stringify(specifications)}::jsonb, ${source}, now())
      on conflict (barcode) do update set
        name = excluded.name, brand = excluded.brand, category = excluded.category,
        description = excluded.description, quantity = excluded.quantity, unit = excluded.unit,
        images = excluded.images, specifications = excluded.specifications,
        source = excluded.source, updated_at = now()
    `);
    res.json({
      barcode: barcodeNumber,
      barcodeNumber,
      barcodeFormats: catalogText(product.barcode_formats),
      name,
      brand: textValue(product.brand) || textValue(product.brands),
      company: textValue(product.company) || textValue(product.brand_owner) || textValue(product.manufacturer) || textValue(product.manufacturer_name),
      manufacturer: textValue(product.manufacturer) || textValue(product.manufacturer_name) || textValue(product.brand_owner),
      manufacturerAddress: textValue(product.manufacturing_places) || textValue(product.manufacturer_address),
      countryOfOrigin: textValue(product.origins) || textValue(product.country_of_origin) || textValue(product.countries),
      description: textValue(product.description) || textValue(product.generic_name) || textValue(product.generic_name_en) || textValue(product.ingredients_text),
      quantity: quantityText,
      packSize: textValue(product.pack_size) || quantityText,
      unit: quantityText.match(/[a-zA-Z]+/)?.[0] || "",
      mrp: catalogMrp,
      productType: textValue(product.product_type),
      variant: textValue(product.model_number) || catalogText(product.model),
      flavor: textValue(product.flavor),
      category: categoryText,
      categoryTags: Array.isArray(product.categories_tags) ? product.categories_tags.map(catalogText).filter(Boolean) : textValue(product.category).split(/\s*[>/|]\s*/).filter(Boolean),
      mpn: catalogText(product.mpn),
      model: catalogText(product.model),
      asin: catalogText(product.asin),
      contributors: catalogText(product.contributors),
      ageGroup: catalogText(product.age_group),
      ingredients: catalogText(product.ingredients) || textValue(product.ingredients_text),
      nutritionFacts: catalogText(product.nutrition_facts),
      color: catalogText(product.color),
      gender: catalogText(product.gender),
      material: catalogText(product.material),
      pattern: catalogText(product.pattern),
      energyEfficiencyRating: catalogText(product.energy_efficiency_rating),
      multipack: catalogText(product.multipack),
      size: catalogText(product.size),
      length: catalogText(product.length),
      width: catalogText(product.width),
      height: catalogText(product.height),
      weight: catalogText(product.weight),
      releaseDate: catalogText(product.release_date),
      features: catalogText(product.features),
      stores: catalogText(product.stores),
      reviews: catalogText(product.reviews),
      images: imageUrls,
      imageUrl: imageUrls[0] || "",
      mainImage: imageUrls[0] || "",
      specifications,
      expiryRequired,
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
      const [customer, savedAddress] = await Promise.all([
        db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, email: usersTable.email })
          .from(usersTable).where(eq(usersTable.id, order.userId)).limit(1),
        order.addressId ? db.select().from(addressesTable).where(eq(addressesTable.id, order.addressId)).limit(1) : Promise.resolve([]),
      ]);
      const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      const productIds = items.map((item) => item.productId).filter((id): id is number => id !== null);
      const products = productIds.length ? await db.select().from(productsTable).where(sql`${productsTable.id} in (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})`) : [];
      const productMap = new Map(products.map((product) => [product.id, product]));
      return {
        ...order,
        store,
        customer: customer[0] ?? null,
        customerAddress: savedAddress[0] ?? order.addressSnapshot ?? null,
        items: items.map((item) => {
          const product = item.productId ? productMap.get(item.productId) : undefined;
          const specifications = product?.specifications && typeof product.specifications === "object" ? product.specifications : {};
          return {
            ...item,
            productName: item.name,
            productImage: item.imageUrl,
            productDetails: product ? {
              id: product.id,
              description: product.description,
              brand: specifications.Brand ?? null,
              category: specifications.Category ?? null,
              sku: product.sku,
              weight: product.weight,
              unit: product.unit,
              mrp: product.mrp,
              images: product.images,
              stockAtOrder: Number(product.stock) + Number(item.qty),
              specifications,
            } : null,
            brandName: specifications.Brand ?? "Chowdhary Mart",
            stockAvailableAtOrder: product ? Number(product.stock) + Number(item.qty) : null,
          };
        }),
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

    if (isAccept) {
      try {
        await advanceDeliveryOffer(orderId);
      } catch (offerError) {
        req.log.warn({ err: offerError, orderId }, "Delivery partner offer could not be started");
      }
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
    const productName = textValue(name);
    const normalizedCategoryId = Number(categoryId);
    const normalizedPrice = Number(price);
    const normalizedMrp = Number(mrp);
    const normalizedStock = Number(stock ?? 0);
    if (productName.length < 2) throw new Error("Product name is required.");
    if (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId < 1) throw new Error("A valid category is required.");
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0.01) throw new Error("A valid price is required.");
    if (!Number.isFinite(normalizedMrp) || normalizedMrp < 0.01) throw new Error("A valid MRP is required.");
    if (!Number.isInteger(normalizedStock) || normalizedStock < 0) throw new Error("A valid stock quantity is required.");
    const [category] = await db.select({ id: categoriesTable.id }).from(categoriesTable)
      .where(eq(categoriesTable.id, normalizedCategoryId)).limit(1);
    if (!category) throw new Error("The selected category no longer exists. Please choose another category.");
    // A deleted/archived zone can leave an old store reference behind. Products
    // must remain insertable; only attach a zone that still exists.
    const [storeZone] = store.zoneId
      ? await db.select({ id: serviceZonesTable.id }).from(serviceZonesTable)
        .where(eq(serviceZonesTable.id, store.zoneId)).limit(1)
      : [];
    const productImages = cleanProductImages(images);
    const preparedSpecifications = await prepareProductSpecifications(normalizedCategoryId, specifications, isAvailable ?? true);
    const discountPercent = normalizedMrp > 0 ? (((normalizedMrp - normalizedPrice) / normalizedMrp) * 100).toFixed(2) : "0";
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
      name: productName,
      description: textValue(description),
      categoryId: normalizedCategoryId,
      brandId,
      price: normalizedPrice.toFixed(2),
      mrp: normalizedMrp.toFixed(2),
      discountPercent,
      images: productImages,
      weight: textValue(weight),
      unit: textValue(unit),
      sku: normalizedSku || null,
      specifications: preparedSpecifications,
      stock: normalizedStock,
      zoneId: storeZone?.id ?? null,
      isAvailable: isAvailable ?? true,
      isFeatured: isFeatured ?? false,
    }).returning();

    res.status(201).json(product);
  } catch (err) {
    req.log.error(err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const validationError = /required|invalid|expired|barcode|image|category|price|mrp|store/i.test(message);
    res.status(validationError ? 400 : 500).json({ error: validationError ? message : "Internal server error" });
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
    const message = err instanceof Error ? err.message : "Internal server error";
    const validationError = /required|invalid|expired|barcode|image|category|price|mrp|store/i.test(message);
    res.status(validationError ? 400 : 500).json({ error: validationError ? message : "Internal server error" });
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
