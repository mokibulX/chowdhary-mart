import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, bannersTable } from "@workspace/db";

const router = Router();

// GET /api/banners
router.get("/", async (req, res) => {
  try {
    const banners = await db.select().from(bannersTable)
      .where(eq(bannersTable.isActive, true))
      .orderBy(bannersTable.sortOrder);
    res.json(banners);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
