import { Router } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { categoriesTable, db, productsTable, storesTable } from "@workspace/db";

const router = Router();

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function filenameStem(value: unknown) {
  return normalize(value)
    .split(/[?#]/)[0]
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function tokenise(value: unknown) {
  return filenameStem(value)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !["img", "image", "photo", "camera", "upload", "uploaded", "new", "file", "jpg", "jpeg", "png", "webp"].includes(item));
}

const visualAliases: Array<[RegExp, string[]]> = [
  [/(tomato|tamatar|red)/i, ["tomato", "vegetable", "fresh"]],
  [/(potato|aloo|alu|brown)/i, ["potato", "vegetable", "grocery"]],
  [/(onion|peyaj|piyaz)/i, ["onion", "vegetable", "grocery"]],
  [/(banana|yellow)/i, ["banana", "fruit", "fresh"]],
  [/(milk|amul|dudh)/i, ["milk", "grocery", "daily"]],
  [/(rice|chal|masoori)/i, ["rice", "grocery"]],
  [/(chappal|chapal|sandal|slipper|footwear|shoe)/i, ["chappal", "footwear", "sandal"]],
  [/(shirt|tshirt|t-shirt|kapor|kapda|fashion)/i, ["shirt", "fashion", "clothing"]],
  [/(jacket|denim|jeans|blue)/i, ["jacket", "denim", "fashion"]],
  [/(mobile|phone|iphone|android)/i, ["mobile", "electronics"]],
  [/(earbud|earphone|headphone|buds|black)/i, ["headphones", "earbuds", "electronics"]],
];

function visualTerms(payload: Record<string, unknown>) {
  const terms = new Set<string>();
  const haystack = [
    payload.fileName,
    payload.keywordHint,
    payload.colorHint,
    payload.mimeType,
  ].map(normalize).join(" ");
  for (const token of tokenise(payload.keywordHint)) terms.add(token);
  for (const token of tokenise(payload.colorHint)) terms.add(token);
  for (const [pattern, aliases] of visualAliases) {
    if (pattern.test(haystack)) aliases.forEach((term) => terms.add(term));
  }
  for (const token of tokenise(payload.fileName)) terms.add(token);
  return [...terms].slice(0, 10);
}

function validLocation(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function nearbyStoreCondition(lat: number, lng: number, radiusKm: number) {
  return sql`
    (
      2 * 6371 * asin(
        sqrt(
          power(sin((radians(${storesTable.lat}) - radians(${lat})) / 2), 2) +
          cos(radians(${lat})) * cos(radians(${storesTable.lat})) *
          power(sin((radians(${storesTable.lng}) - radians(${lng})) / 2), 2)
        )
      )
    ) <= coalesce(${storesTable.radiusKm}, ${radiusKm})
  `;
}

router.get("/suggestions", async (req, res) => {
  try {
    const q = normalize(req.query.q);
    const limit = Math.min(Number(req.query.limit) || 8, 12);
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : undefined;
    if (q.length < 1) {
      res.json({ items: [] });
      return;
    }

    const rows = await db
      .select({ product: productsTable, store: storesTable, category: categoriesTable })
      .from(productsTable)
      .innerJoin(storesTable, eq(productsTable.storeId, storesTable.id))
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(
        eq(productsTable.isAvailable, true),
        sql`${productsTable.stock} > 0`,
        eq(storesTable.isActive, true),
        eq(storesTable.isOpen, true),
        zoneId ? sql`(${storesTable.id} = ${storesTable.id})` : undefined,
        or(
          ilike(productsTable.name, `${q}%`),
          ilike(productsTable.name, `%${q}%`),
          ilike(productsTable.sku, `%${q}%`),
          ilike(categoriesTable.name, `%${q}%`),
          ilike(storesTable.name, `%${q}%`),
        ),
      ))
      .orderBy(desc(productsTable.rating), desc(productsTable.createdAt))
      .limit(40);

    const ranked = rows
      .map(({ product, store, category }) => {
        const name = normalize(product.name);
        const categoryName = normalize(category?.name);
        const storeName = normalize(store.name);
        const score =
          name === q ? 100 :
          name.startsWith(q) ? 90 :
          categoryName.startsWith(q) ? 75 :
          storeName.startsWith(q) ? 65 :
          name.includes(q) ? 55 :
          20 + Number(product.rating ?? 0);
        return {
          id: product.id,
          productId: product.id,
          name: product.name,
          imageUrl: Array.isArray(product.images) ? product.images[0] : null,
          brand: product.specifications?.Brand ?? product.specifications?.brand ?? "",
          unit: product.unit ?? product.weight ?? "",
          price: product.price,
          mrp: product.mrp,
          discountPercent: product.discountPercent,
          shopName: store.name,
          etaMins: store.estimatedDeliveryMins ?? 40,
          inStock: Number(product.stock ?? 0) > 0,
          category: category?.name ?? "",
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    res.json({ items: ranked });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/image", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const terms = visualTerms(body);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const radiusKm = Math.max(0.5, Math.min(25, Number(body.radiusKm ?? 5) || 5));
    const hasLocation = validLocation(lat, lng);
    const uploadedStem = filenameStem(body.fileName);

    const rows = await db
      .select({ product: productsTable, store: storesTable, category: categoriesTable })
      .from(productsTable)
      .innerJoin(storesTable, eq(productsTable.storeId, storesTable.id))
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(
        eq(productsTable.isAvailable, true),
        sql`${productsTable.stock} > 0`,
        eq(storesTable.isActive, true),
        eq(storesTable.isOpen, true),
        hasLocation ? nearbyStoreCondition(lat, lng, radiusKm) : undefined,
      ))
      .orderBy(desc(productsTable.rating), desc(productsTable.createdAt))
      .limit(250);

    const scored = rows
      .map(({ product, store, category }) => {
        const images = Array.isArray(product.images) ? product.images : [];
        const imageStems = images.map(filenameStem);
        const productText = normalize([
          product.name,
          product.description,
          product.sku,
          category?.name,
          store.name,
          ...(Array.isArray(product.tags) ? product.tags : []),
          ...Object.values(product.specifications ?? {}),
        ].join(" "));
        const exactImage = Boolean(uploadedStem && imageStems.some((stem) => stem && (stem === uploadedStem || stem.includes(uploadedStem) || uploadedStem.includes(stem))));
        const score = terms.reduce((total, term) => {
          if (!term) return total;
          const termRe = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
          return total +
            (termRe.test(normalize(product.name)) ? 65 : 0) +
            (termRe.test(normalize(category?.name)) ? 35 : 0) +
            (termRe.test(productText) ? 18 : 0) +
            (imageStems.some((stem) => stem.includes(term)) ? 55 : 0);
        }, exactImage ? 220 : 0) + Number(product.rating ?? 0) * 2;
        return {
          ...product,
          category,
          store: {
            id: store.id,
            name: store.name,
            rating: store.rating,
            estimatedDeliveryMins: store.estimatedDeliveryMins,
            deliveryFee: store.deliveryFee,
          },
          imageUrl: images[0] ?? null,
          shopName: store.name,
          exactImage,
          _score: score,
        };
      })
      .filter((item) => item._score > 0)
      .sort((a, b) => b._score - a._score || Number(b.rating ?? 0) - Number(a.rating ?? 0));

    const exact = scored.find((item) => item.exactImage || item._score >= 180);
    const items = (scored.length ? scored : rows.map(({ product, store, category }) => ({
      ...product,
      category,
      store: {
        id: store.id,
        name: store.name,
        rating: store.rating,
        estimatedDeliveryMins: store.estimatedDeliveryMins,
        deliveryFee: store.deliveryFee,
      },
      imageUrl: Array.isArray(product.images) ? product.images[0] : null,
      shopName: store.name,
      exactImage: false,
      _score: Number(product.rating ?? 0),
    }))).slice(0, 16);

    const query = terms[0] ?? normalize(body.keywordHint) ?? "fresh";
    res.json({
      matchType: exact ? "same" : scored.length ? "similar" : "none",
      query,
      message: exact
        ? `Same product found: ${exact.name}`
        : scored.length
          ? "Same photo did not match exactly. Showing similar products."
          : "No image match found nearby. Showing popular nearby products.",
      exactProduct: exact ? { id: exact.id, name: exact.name } : null,
      items: items.slice(0, 16).map(({ _score, exactImage, ...item }) => item),
      terms,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Image search failed. Please try another product photo." });
  }
});

export default router;
