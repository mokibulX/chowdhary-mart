import { Router } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, walletTransactionsTable, walletLedgerEntriesTable, usersTable, withdrawalRequestsTable, walletsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { ensureFinanceTables, ensureWallet, getFinanceSettings, getWalletSnapshot, releaseMaturedWallets } from "../lib/finance";
import { testMode } from "../lib/test-mode";

const router = Router();

router.use(requireAuth);

// GET /api/wallet
router.get("/", async (req: AuthRequest, res) => {
  try {
    const snapshot = await getWalletSnapshot(req.user!.userId);
    const [user] = await db.select({
      loyaltyPoints: usersTable.loyaltyPoints,
    }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    res.json({
      balance: snapshot.availableBalance,
      availableBalance: snapshot.availableBalance,
      pendingBalance: snapshot.pendingBalance,
      heldBalance: snapshot.heldBalance,
      loyaltyPoints: user?.loyaltyPoints ?? 0,
      pendingCashback: snapshot.pendingBalance,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/wallet/transactions
router.get("/transactions", async (req: AuthRequest, res) => {
  try {
    await releaseMaturedWallets();
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const [wallet] = await db.select().from(walletsTable).where(and(eq(walletsTable.ownerUserId, req.user!.userId), eq(walletsTable.walletType, "earnings"))).limit(1);
    const ledger = wallet ? await db.select().from(walletLedgerEntriesTable).where(eq(walletLedgerEntriesTable.walletId, wallet.id)).orderBy(desc(walletLedgerEntriesTable.createdAt)).limit(limit).offset(offset) : [];
    const txns = ledger.length ? ledger.map((entry) => ({
      id: entry.id,
      type: entry.direction === "credit" ? "credit" : "debit",
      amount: entry.amount,
      balance: entry.closingBalance,
      description: entry.transactionType,
      referenceId: entry.referenceId,
      referenceType: entry.referenceType,
      status: entry.status,
      createdAt: entry.createdAt,
    })) : await db.select().from(walletTransactionsTable)
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
    await ensureFinanceTables();
    const settings = await getFinanceSettings();
    const amount = Number(req.body?.amount ?? 0);
    if (!amount || amount < Number(settings.minimumWithdrawal)) {
      res.status(400).json({ error: `Minimum withdrawal is Rs.${Number(settings.minimumWithdrawal).toFixed(0)}` });
      return;
    }
    if (req.user!.role !== "admin" && !settings.payoutEnabled) {
      res.status(409).json({ error: "Payouts are temporarily disabled by admin." });
      return;
    }
    await releaseMaturedWallets();

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
    const idempotencyKey = String(req.headers["idempotency-key"] ?? "").trim();
    if (!idempotencyKey) {
      res.status(400).json({ error: "Idempotency-Key header is required for payout requests." });
      return;
    }
    const [duplicate] = await db.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.idempotencyKey, idempotencyKey)).limit(1);
    if (duplicate) {
      res.status(200).json({ ...duplicate, requestedAt: duplicate.createdAt, status: String(duplicate.status).toLowerCase(), duplicate: true });
      return;
    }
    const [request] = await db.transaction(async (tx) => {
      const role = req.user!.role;
      const wallet = await ensureWallet(tx, req.user!.userId, role);
      const [reserved] = await tx.update(walletsTable).set({
        availableBalance: sql`${walletsTable.availableBalance} - ${amount.toFixed(2)}`,
        heldBalance: sql`${walletsTable.heldBalance} + ${amount.toFixed(2)}`,
        updatedAt: new Date(),
      }).where(and(eq(walletsTable.id, wallet.id), sql`${walletsTable.availableBalance} >= ${amount.toFixed(2)}`)).returning();
      if (!reserved) throw new Error("Insufficient available wallet balance");
      return tx.insert(withdrawalRequestsTable).values({
        walletId: wallet.id,
        userId: req.user!.userId,
        amount: amount.toFixed(2),
        method,
        upiId: method === "upi" ? String(req.body?.upiId ?? "").trim() : null,
        bankAccountMasked: method === "bank" ? `****${String(req.body?.accountNumber ?? "").slice(-4)}` : null,
        ifsc: method === "bank" ? String(req.body?.ifsc ?? "").trim().toUpperCase() : null,
        payoutMode: isAdmin ? "SELF" : "ADMIN_APPROVAL",
        status: isAdmin ? "REQUESTED" : "REQUESTED",
        idempotencyKey,
        adminNote: null,
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
    if (!testMode.enabled || !testMode.allowDemoPayment || !["customer", "admin"].includes(req.user!.role)) {
      res.status(409).json({ error: "Wallet top-up requires a verified Razorpay payment. Demo top-up is disabled." });
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
