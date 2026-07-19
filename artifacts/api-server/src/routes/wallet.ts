import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, walletTransactionsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { assertTestModeFeature, testMode } from "../lib/test-mode";

const router = Router();
const demoWithdrawals: Array<Record<string, unknown>> = [];

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

router.get("/withdrawals", async (req: AuthRequest, res) => {
  res.json(demoWithdrawals.filter((item) => item.userId === req.user!.userId));
});

router.post("/withdrawals", async (req: AuthRequest, res) => {
  try {
    assertTestModeFeature(testMode.allowDemoPayout, "Demo payout");
    const amount = Number(req.body?.amount ?? 0);
    if (!amount || amount < 1) {
      res.status(400).json({ error: "Enter a valid withdrawal amount" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const balance = Number(user?.walletBalance ?? 0);
    if (amount > balance) {
      res.status(400).json({ error: "Insufficient demo wallet balance" });
      return;
    }
    const closing = balance - amount;
    await db.update(usersTable).set({ walletBalance: closing.toFixed(2) }).where(eq(usersTable.id, req.user!.userId));
    const request = {
      id: Date.now(),
      userId: req.user!.userId,
      amount: amount.toFixed(2),
      method: String(req.body?.method ?? "upi"),
      upiId: req.body?.upiId ?? null,
      status: "PROCESSED_TEST",
      payoutMode: "DEMO",
      realMoney: false,
      createdInTestMode: true,
      createdAt: new Date().toISOString(),
    };
    demoWithdrawals.unshift(request);
    await db.insert(walletTransactionsTable).values({
      userId: req.user!.userId,
      type: "debit",
      amount: amount.toFixed(2),
      balance: closing.toFixed(2),
      description: "Test withdrawal - no real money transferred",
      referenceId: `DEMO-WD-${request.id}`,
      referenceType: "demo_withdrawal",
    });
    res.status(201).json(request);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    req.log.error(err);
    res.status(status).json({ error: err instanceof Error ? err.message : "Withdrawal failed" });
  }
});

// POST /api/wallet/topup
router.post("/topup", async (req: AuthRequest, res) => {
  try {
    const amount = Number(req.body?.amount ?? 0);
    const upiId = String(req.body?.upiId ?? "").trim();

    if (!amount || amount < 1 || amount > 50000) {
      res.status(400).json({ error: "Enter an amount between Rs.1 and Rs.50,000" });
      return;
    }
    if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) {
      res.status(400).json({ error: "Enter a valid UPI ID" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const newBalance = Number(user?.walletBalance ?? 0) + amount;
    await db.update(usersTable)
      .set({ walletBalance: newBalance.toFixed(2) })
      .where(eq(usersTable.id, req.user!.userId));

    const [txn] = await db.insert(walletTransactionsTable).values({
      userId: req.user!.userId,
      type: "credit",
      amount: amount.toFixed(2),
      balance: newBalance.toFixed(2),
      description: `Added money via UPI (${upiId})`,
      referenceId: `UPI-${Date.now()}`,
      referenceType: "wallet_topup",
    }).returning();

    res.status(201).json({ balance: newBalance.toFixed(2), transaction: txn });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
