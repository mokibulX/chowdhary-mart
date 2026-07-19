import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { createAndPushNotification, registerPushToken } from "../lib/push-service";

const router = Router();

router.use(requireAuth);

router.post("/push-token", async (req: AuthRequest, res) => {
  try {
    const token = String(req.body?.token ?? "").trim();
    const platform = String(req.body?.platform ?? "web").trim();
    const deviceId = req.body?.deviceId ? String(req.body.deviceId) : undefined;
    const item = await registerPushToken({ userId: req.user!.userId, token, platform, deviceId });
    res.status(201).json({ message: "Push token registered", item });
  } catch (err) {
    req.log.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Push token registration failed" });
  }
});

router.post("/test-push", async (req: AuthRequest, res) => {
  try {
    const result = await createAndPushNotification({
      userId: req.user!.userId,
      type: "system",
      title: "ChowdharyMart notification enabled",
      body: "Push notification setup is working on this device.",
      data: { source: "test-push" },
    });
    res.json({ message: "Test notification created", ...result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Push notification test failed" });
  }
});

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
