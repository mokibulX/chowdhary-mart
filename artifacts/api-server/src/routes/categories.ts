import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";

const router = Router();

// GET /api/categories
router.get("/", async (req, res) => {
  try {
    const categories = await db.select().from(categoriesTable)
      .where(eq(categoriesTable.isActive, true))
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
    res.json(categories);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
