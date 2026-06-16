import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

// GET /api/notifications
router.get("/", async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [items, [countRow]] = await Promise.all([
      db.select().from(notificationsTable)
        .where(eq(notificationsTable.userId, userId))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(50),
      db.select({ count: sql<number>`count(*)` }).from(notificationsTable)
        .where(eq(notificationsTable.userId, userId))
    ]);

    const unreadCount = items.filter(n => !n.isRead).length;

    res.json({ items, unreadCount });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/notifications/:notificationId/read
router.patch("/:notificationId/read", async (req: AuthRequest, res) => {
  try {
    await db.update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.id, Number(req.params.notificationId)));
    res.json({ message: "Marked as read" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/notifications/read-all
router.patch("/read-all", async (req: AuthRequest, res) => {
  try {
    await db.update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.userId, req.user!.userId));
    res.json({ message: "All marked as read" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
