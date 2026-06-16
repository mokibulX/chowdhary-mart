import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, wishlistTable, productsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

// GET /api/wishlist
router.get("/", async (req: AuthRequest, res) => {
  try {
    const items = await db.select().from(wishlistTable)
      .where(eq(wishlistTable.userId, req.user!.userId));

    const enriched = await Promise.all(items.map(async (item) => {
      const [product] = await db.select().from(productsTable)
        .where(eq(productsTable.id, item.productId)).limit(1);
      return { ...item, product };
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/wishlist
router.post("/", async (req: AuthRequest, res) => {
  try {
    const { productId } = req.body as { productId: number };
    const userId = req.user!.userId;

    const [existing] = await db.select().from(wishlistTable)
      .where(and(eq(wishlistTable.userId, userId), eq(wishlistTable.productId, productId)))
      .limit(1);

    if (!existing) {
      await db.insert(wishlistTable).values({ userId, productId });
    }

    res.status(201).json({ message: "Added to wishlist" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/wishlist/:productId
router.delete("/:productId", async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.params.productId);
    await db.delete(wishlistTable)
      .where(and(eq(wishlistTable.userId, req.user!.userId), eq(wishlistTable.productId, productId)));
    res.json({ message: "Removed from wishlist" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
