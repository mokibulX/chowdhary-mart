import { Router } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";
import { ensureCategorySurfaceSchema, normalizeCategorySurface } from "../lib/category-surface";

const router = Router();

// GET /api/categories
router.get("/", async (req, res) => {
  try {
    await ensureCategorySurfaceSchema();
    const surface = normalizeCategorySurface(req.query.surface);
    const categories = await db.select().from(categoriesTable)
      .where(and(eq(categoriesTable.isActive, true), eq(categoriesTable.surface, surface)))
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
    res.json(categories);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
