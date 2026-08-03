import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, walletTransactionsTable, usersTable, withdrawalRequestsTable } from "@workspace/db";
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

router.get("/withdrawals", async (req: AuthRequest, res) => {
  try {
    const items = await db.select().from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.userId, req.user!.userId))
      .orderBy(desc(withdrawalRequestsTable.createdAt))
      .limit(50);
    res.json(items.map((item) => ({
      ...item,
      requestedAt: item.createdAt,
      status: String(item.status).toLowerCase(),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load transfer requests" });
  }
});

router.post("/withdrawals", async (req: AuthRequest, res) => {
  try {
    const amount = Number(req.body?.amount ?? 0);
    if (!amount || amount < 1) {
      res.status(400).json({ error: "Enter a valid withdrawal amount" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const balance = Number(user?.walletBalance ?? 0);
    if (amount > balance) {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }

    const method = String(req.body?.method ?? "upi").toLowerCase() === "bank" ? "bank" : "upi";
    if (method === "upi" && !/^[\w.-]+@[\w.-]+$/.test(String(req.body?.upiId ?? "").trim())) {
      res.status(400).json({ error: "Enter a valid UPI ID" });
      return;
    }
    if (method === "bank" && (!String(req.body?.accountNumber ?? "").trim() || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(req.body?.ifsc ?? "").trim().toUpperCase()))) {
      res.status(400).json({ error: "Valid bank account and IFSC are required" });
      return;
    }

    const isAdmin = req.user!.role === "admin";
    const [request] = await db.transaction(async (tx) => {
      let status = "pending";
      if (isAdmin) {
        const closing = balance - amount;
        await tx.update(usersTable).set({ walletBalance: closing.toFixed(2) }).where(eq(usersTable.id, req.user!.userId));
        await tx.insert(walletTransactionsTable).values({
          userId: req.user!.userId,
          type: "debit",
          amount: amount.toFixed(2),
          balance: closing.toFixed(2),
          description: `Admin transfer to ${method === "bank" ? "bank account" : "UPI"}`,
          referenceId: `ADM-WD-${Date.now()}`,
          referenceType: "wallet_withdrawal",
        });
        status = "transferred";
      }
      return tx.insert(withdrawalRequestsTable).values({
        userId: req.user!.userId,
        amount: amount.toFixed(2),
        method,
        upiId: method === "upi" ? String(req.body?.upiId ?? "").trim() : null,
        bankAccountMasked: method === "bank" ? `****${String(req.body?.accountNumber ?? "").slice(-4)}` : null,
        ifsc: method === "bank" ? String(req.body?.ifsc ?? "").trim().toUpperCase() : null,
        payoutMode: isAdmin ? "SELF" : "ADMIN_APPROVAL",
        status,
        idempotencyKey: `withdrawal-${req.user!.userId}-${Date.now()}`,
        adminNote: isAdmin ? "Admin self-transfer completed" : null,
      }).returning();
    });
    res.status(201).json({ ...request, requestedAt: request.createdAt, status: String(request.status).toLowerCase() });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    req.log.error(err);
    res.status(status).json({ error: err instanceof Error ? err.message : "Withdrawal failed" });
  }
});

// POST /api/wallet/topup
router.post("/topup", async (req: AuthRequest, res) => {
  try {
    if (!["customer", "admin"].includes(req.user!.role)) {
      res.status(403).json({ error: "Seller and delivery wallet balance is controlled by admin settlements." });
      return;
    }
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
