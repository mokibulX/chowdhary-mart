import { Router } from "express";
import { eq, ilike, and, or, desc, asc, sql } from "drizzle-orm";
import { db, productsTable, categoriesTable, storesTable, reviewsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth";

const router = Router();

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
