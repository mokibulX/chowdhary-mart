import { Router } from "express";
import { eq, ilike, and, desc, asc, sql } from "drizzle-orm";
import { db, productsTable, categoriesTable, storesTable, reviewsTable } from "@workspace/db";

const router = Router();

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

function parseIdList(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function asTags(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).toLowerCase()) : [];
}

// GET /api/products
router.get("/", async (req, res) => {
  try {
    const {
      q, categoryId, storeId, featured,
      limit: limitQ = "40", offset: offsetQ = "0",
      sort = "newest"
    } = req.query as Record<string, string>;

    const limit = Math.min(Number(limitQ) || 40, 100);
    const offset = Number(offsetQ) || 0;

    const conditions = [eq(productsTable.isAvailable, true)];
    if (categoryId) conditions.push(eq(productsTable.categoryId, Number(categoryId)));
    if (storeId) conditions.push(eq(productsTable.storeId, Number(storeId)));
    if (featured === "true") conditions.push(eq(productsTable.isFeatured, true));
    if (q) conditions.push(ilike(productsTable.name, `%${q}%`));

    let orderBy;
    switch (sort) {
      case "price_asc": orderBy = asc(productsTable.price); break;
      case "price_desc": orderBy = desc(productsTable.price); break;
      case "rating": orderBy = desc(productsTable.rating); break;
      default: orderBy = desc(productsTable.createdAt);
    }

    const [items, countResult] = await Promise.all([
      db.select().from(productsTable)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(productsTable).where(and(...conditions))
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    res.json({ items, total, hasMore: offset + limit < total });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/products/:productId/related
router.get("/:productId/related", async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 16, 1), 30);
    const cursor = Math.max(Number(req.query.cursor) || 0, 0);
    const excludedIds = new Set([productId, ...parseIdList(req.query.excludeIds)]);
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasCustomerLocation = Number.isFinite(lat) && Number.isFinite(lng);
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    const shopId = Number(req.query.shopId);

    const [current] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!current) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const candidates = await db
      .select({ product: productsTable, store: storesTable, category: categoriesTable })
      .from(productsTable)
      .innerJoin(storesTable, eq(productsTable.storeId, storesTable.id))
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(and(
        eq(productsTable.isAvailable, true),
        eq(storesTable.isActive, true),
        eq(storesTable.isOpen, true),
        eq(storesTable.isVerified, true),
        sql`${productsTable.id} <> ${productId}`,
        sql`${productsTable.stock} > 0`,
      ))
      .orderBy(desc(productsTable.rating), asc(productsTable.price))
      .limit(250);

    const currentPrice = Number(current.price);
    const currentTags = asTags(current.tags);

    const ranked = candidates
      .filter(({ product, store }) => {
        if (excludedIds.has(product.id)) return false;
        if (shopId && product.storeId !== shopId) return false;
        const price = Number(product.price);
        if (Number.isFinite(minPrice) && price < minPrice) return false;
        if (Number.isFinite(maxPrice) && price > maxPrice) return false;
        if (hasCustomerLocation) {
          const distance = distanceKm(lat, lng, Number(store.lat), Number(store.lng));
          const radius = Number(store.radiusKm || 5);
          if (Number.isFinite(distance) && distance > Math.max(radius, 5)) return false;
        }
        return true;
      })
      .map(({ product, store, category }) => {
        const price = Number(product.price);
        const tags = asTags(product.tags);
        const tagMatches = tags.filter((tag) => currentTags.includes(tag)).length;
        const similarPrice = currentPrice > 0 ? Math.max(0, 1 - Math.abs(price - currentPrice) / currentPrice) : 0;
        const distance = hasCustomerLocation ? distanceKm(lat, lng, Number(store.lat), Number(store.lng)) : 0;
        const score =
          (product.categoryId && product.categoryId === current.categoryId ? 60 : 0) +
          (product.brandId && product.brandId === current.brandId ? 25 : 0) +
          (tagMatches * 12) +
          (similarPrice * 20) +
          (Number(product.rating ?? 0) * 4) +
          (Number(product.stock ?? 0) > 10 ? 6 : 0) +
          (Number(store.estimatedDeliveryMins ?? 40) <= 40 ? 8 : 0) -
          (hasCustomerLocation ? Math.min(distance, 20) : 0);
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
          shopName: store.name,
          shopRating: store.rating,
          deliveryEtaMins: store.estimatedDeliveryMins ?? 40,
          distanceKm: hasCustomerLocation ? Number(distance.toFixed(2)) : undefined,
          _score: score,
        };
      })
      .sort((a, b) => Number(b._score) - Number(a._score) || Number(b.rating ?? 0) - Number(a.rating ?? 0) || Number(a.price) - Number(b.price));

    const unique = Array.from(new Map(ranked.map((item) => [item.id, item])).values());
    const items = unique.slice(cursor, cursor + limit).map(({ _score, ...item }) => item);
    const nextCursor = cursor + limit < unique.length ? String(cursor + limit) : null;

    res.json({ items, nextCursor, hasMore: Boolean(nextCursor) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/products/:productId
router.get("/:productId", async (req, res) => {
  try {
    const id = Number(req.params.productId);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const [category, store] = await Promise.all([
      product.categoryId
        ? db.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId)).limit(1).then(r => r[0])
        : Promise.resolve(null),
      db.select().from(storesTable).where(eq(storesTable.id, product.storeId)).limit(1).then(r => r[0]),
    ]);

    res.json({ ...product, category, store });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/products/:productId/reviews
router.get("/:productId/reviews", async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const reviews = await db.query.reviewsTable.findMany({
      where: eq(reviewsTable.productId, productId),
      orderBy: desc(reviewsTable.createdAt),
      with: { userId: false },
    });
    // Manual join for user info
    const { usersTable } = await import("@workspace/db");
    const enriched = await Promise.all(reviews.map(async (r) => {
      const [user] = await db.select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
        .from(usersTable).where(eq(usersTable.id, r.userId)).limit(1);
      return { ...r, user };
    }));
    res.json(enriched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
