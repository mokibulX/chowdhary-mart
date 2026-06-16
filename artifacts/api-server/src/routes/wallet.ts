import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, walletTransactionsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

// GET /api/wallet
router.get("/", async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select({
      walletBalance: usersTable.walletBalance,
      loyaltyPoints: usersTable.loyaltyPoints,
    }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    res.json({
      balance: user?.walletBalance ?? "0.00",
      loyaltyPoints: user?.loyaltyPoints ?? 0,
      pendingCashback: "0.00",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/wallet/transactions
router.get("/transactions", async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const txns = await db.select().from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.userId, req.user!.userId))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(txns);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
