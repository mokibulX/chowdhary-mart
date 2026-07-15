import { Router } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { categoriesTable, db, productsTable, storesTable } from "@workspace/db";

const router = Router();

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
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

export default router;
