import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, storesTable, bannersTable } from "@workspace/db";

const router = Router();

// GET /api/stores
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const stores = await db.select().from(storesTable)
      .where(eq(storesTable.isActive, true))
      .orderBy(desc(storesTable.rating))
      .limit(limit);
    res.json(stores);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stores/:storeId
router.get("/:storeId", async (req, res) => {
  try {
    const id = Number(req.params.storeId);
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, id)).limit(1);
    if (!store) {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    res.json(store);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/banners (mounted via admin router — also export here for direct use)
export async function getBanners() {
  return db.select().from(bannersTable).where(eq(bannersTable.isActive, true));
}

export default router;
