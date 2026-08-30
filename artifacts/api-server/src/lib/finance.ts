import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  bannersTable,
  deliveryPartnersTable,
  orderTrackingTable,
  ordersTable,
  platformSettingsTable,
  riderEarningTransactionsTable,
  sellerSettlementsTable,
  storesTable,
  usersTable,
  walletLedgerEntriesTable,
  walletsTable,
} from "@workspace/db";

export const DEFAULT_FINANCE_SETTINGS = {
  commissionPercentage: "10.00",
  deliveryRatePerKm: "8.00",
  deliveryMinCharge: "0.00",
  maxDeliveryDistanceKm: "5.00",
  freeDeliveryThreshold: "0.00",
  deliveryChargeEnabled: true,
  additionalItemDeliveryPercentage: "50.00",
  firstItemDeliveryPercentage: "100.00",
  secondItemDeliveryPercentage: "50.00",
  thirdItemDeliveryPercentage: "50.00",
  freeDeliveryFromItem: 4,
  settlementMode: "delay",
  settlementDelayHours: 24,
  weeklyPayoutDay: 1,
  minimumWithdrawal: "100.00",
  payoutEnabled: false,
  selfieRequired: true,
};

let financeTablesReady: Promise<void> | null = null;

export async function ensureFinanceTables() {
  if (!financeTablesReady) {
    financeTablesReady = db.execute(sql`
      create table if not exists platform_settings (
        id serial primary key,
        singleton_key varchar(30) not null default 'default',
        commission_percentage numeric(5,2) not null default 10,
        delivery_rate_per_km numeric(10,2) not null default 8,
        delivery_min_charge numeric(10,2) not null default 0,
        max_delivery_distance_km numeric(10,2) not null default 5,
        free_delivery_threshold numeric(12,2) not null default 0,
        delivery_charge_enabled boolean not null default true,
        additional_item_delivery_percentage numeric(5,2) not null default 50,
        first_item_delivery_percentage numeric(5,2) not null default 100,
        second_item_delivery_percentage numeric(5,2) not null default 50,
        third_item_delivery_percentage numeric(5,2) not null default 50,
        free_delivery_from_item integer not null default 4,
        settlement_mode varchar(20) not null default 'delay',
        settlement_delay_hours integer not null default 24,
        weekly_payout_day integer not null default 1,
        minimum_withdrawal numeric(10,2) not null default 100,
        payout_enabled boolean not null default false,
        selfie_required boolean not null default true,
        updated_by integer references users(id),
        updated_at timestamp not null default now(),
        constraint platform_settings_singleton_key_unique unique(singleton_key)
      );
      create unique index if not exists seller_settlements_order_unique on seller_settlements(order_id);
      create unique index if not exists rider_earning_order_user_unique on rider_earning_transactions(order_id, rider_user_id);
      create index if not exists wallet_ledger_wallet_created_idx on wallet_ledger_entries(wallet_id, created_at desc);
      create table if not exists partner_incentive_rules (
        id serial primary key,
        partner_user_id integer references users(id) on delete cascade,
        name varchar(160) not null default 'Partner incentive',
        orders_required integer not null default 0,
        bonus_amount numeric(12,2) not null default 0,
        online_start_time varchar(5),
        online_end_time varchar(5),
        is_active boolean not null default true,
        created_at timestamp not null default now(),
        updated_at timestamp not null default now()
      );
      create index if not exists partner_incentive_rules_partner_idx on partner_incentive_rules (partner_user_id, is_active);
    `).then(() => undefined).catch((error) => {
      financeTablesReady = null;
      throw error;
    });
  }
  await financeTablesReady;
}

export async function getFinanceSettings() {
  await ensureFinanceTables();
  const [settings] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.singletonKey, "default")).limit(1);
  if (settings) return settings;
  const [created] = await db.insert(platformSettingsTable).values({ singletonKey: "default", ...DEFAULT_FINANCE_SETTINGS }).onConflictDoNothing().returning();
  if (created) return created;
  const [existing] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.singletonKey, "default")).limit(1);
  return existing ?? ({ id: 0, singletonKey: "default", ...DEFAULT_FINANCE_SETTINGS, updatedBy: null, updatedAt: new Date() } as any);
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

function moneyText(value: number) {
  return value.toFixed(2);
}

function indiaTimeMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function isWithinTimeWindow(now: number, start?: string | null, end?: string | null) {
  if (!start || !end) return true;
  const toMinutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
  const from = toMinutes(start);
  const until = toMinutes(end);
  if (!Number.isFinite(from) || !Number.isFinite(until)) return false;
  return from <= until ? now >= from && now <= until : now >= from || now <= until;
}

function settlementAvailableAt(settings: typeof DEFAULT_FINANCE_SETTINGS, createdAt = new Date()) {
  if (settings.settlementMode === "weekly") {
    const result = new Date(createdAt);
    const daysUntil = (settings.weeklyPayoutDay - result.getDay() + 7) % 7 || 7;
    result.setDate(result.getDate() + daysUntil);
    result.setHours(0, 0, 0, 0);
    return result;
  }
  if (settings.settlementMode === "daily") {
    const result = new Date(createdAt);
    result.setDate(result.getDate() + 1);
    result.setHours(0, 0, 0, 0);
    return result;
  }
  return new Date(createdAt.getTime() + Math.max(0, settings.settlementDelayHours) * 60 * 60 * 1000);
}

export async function ensureWallet(tx: any, userId: number, role: string) {
  const [existing] = await tx.select().from(walletsTable)
    .where(and(eq(walletsTable.ownerUserId, userId), eq(walletsTable.walletType, "earnings"))).limit(1);
  if (existing) return existing;
  const [user] = await tx.select({ walletBalance: usersTable.walletBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const [created] = await tx.insert(walletsTable).values({ ownerUserId: userId, ownerRole: role, walletType: "earnings", availableBalance: String(user?.walletBalance ?? "0") }).returning();
  return created;
}

async function pendingEntry(tx: any, wallet: any, type: string, amount: number, referenceType: string, referenceId: string, idempotencyKey: string, availableAt: Date) {
  const [existing] = await tx.select().from(walletLedgerEntriesTable).where(eq(walletLedgerEntriesTable.idempotencyKey, idempotencyKey)).limit(1);
  if (existing) return existing;
  await tx.update(walletsTable).set({ pendingBalance: sql`${walletsTable.pendingBalance} + ${moneyText(amount)}`, updatedAt: new Date() }).where(eq(walletsTable.id, wallet.id));
  const [entry] = await tx.insert(walletLedgerEntriesTable).values({
    walletId: wallet.id,
    transactionType: type,
    direction: "credit",
    amount: moneyText(amount),
    openingBalance: String(wallet.availableBalance ?? "0"),
    closingBalance: String(wallet.availableBalance ?? "0"),
    referenceType,
    referenceId,
    idempotencyKey,
    status: `pending:${availableAt.toISOString()}`,
  }).returning();
  return entry;
}

export async function releaseMaturedWallets() {
  await ensureFinanceTables();
  const now = new Date();
  await db.transaction(async (tx) => {
    const pending = await tx.select().from(walletLedgerEntriesTable).where(sql`${walletLedgerEntriesTable.status} like 'pending:%'`);
    for (const entry of pending) {
      const availableAt = new Date(String(entry.status).slice("pending:".length));
      if (Number.isNaN(availableAt.getTime()) || availableAt > now) continue;
      const [wallet] = await tx.select().from(walletsTable).where(eq(walletsTable.id, entry.walletId)).limit(1);
      if (!wallet) continue;
      const amount = money(entry.amount);
      await tx.update(walletsTable).set({
        availableBalance: sql`${walletsTable.availableBalance} + ${moneyText(amount)}`,
        pendingBalance: sql`greatest(0, ${walletsTable.pendingBalance} - ${moneyText(amount)})`,
        updatedAt: now,
      }).where(eq(walletsTable.id, wallet.id));
      await tx.update(walletLedgerEntriesTable).set({ status: "posted", openingBalance: wallet.availableBalance, closingBalance: moneyText(money(wallet.availableBalance) + amount) }).where(eq(walletLedgerEntriesTable.id, entry.id));
      await tx.update(usersTable).set({ walletBalance: sql`${usersTable.walletBalance} + ${moneyText(amount)}`, updatedAt: now }).where(eq(usersTable.id, wallet.ownerUserId));
    }
  });
}

export async function settleCompletedOrder(orderId: number) {
  await ensureFinanceTables();
  const settings = await getFinanceSettings();
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order || order.status !== "delivered") return { settled: false, reason: "Order is not delivered" };
    const [existing] = await tx.select().from(sellerSettlementsTable).where(eq(sellerSettlementsTable.orderId, order.id)).limit(1);
    if (existing) return { settled: false, duplicate: true, sellerSettlement: existing };
    const [store] = await tx.select().from(storesTable).where(eq(storesTable.id, order.storeId)).limit(1);
    if (!store) throw new Error("Store not found for settlement");
    const gross = money(order.total);
    const sellerItemAmount = money(order.subtotal) - money(order.couponDiscount);
    // New pricing orders charge the platform fee to the customer, so the seller
    // receives the seller/base amount. Keep the legacy fallback for old orders.
    const savedCommission = money((order as any).commissionAmount);
    const commission = savedCommission > 0
      ? savedCommission
      : Math.min(sellerItemAmount, sellerItemAmount * money(settings.commissionPercentage) / 100);
    const sellerEarning = Math.max(0, sellerItemAmount);
    const availableAt = settlementAvailableAt({ ...DEFAULT_FINANCE_SETTINGS, ...settings } as any, new Date());
    const [sellerSettlement] = await tx.insert(sellerSettlementsTable).values({
      orderId: order.id,
      sellerUserId: store.userId,
      grossOrderAmount: moneyText(gross),
      sellerItemAmount: moneyText(sellerItemAmount),
      platformCommission: moneyText(commission),
      netSellerEarning: moneyText(sellerEarning),
      status: "pending",
      availableAt,
    }).returning();
    const seller = await ensureWallet(tx, store.userId, "vendor");
    await pendingEntry(tx, seller, "SELLER_EARNING", sellerEarning, "order", String(order.id), `seller-earning:${order.id}`, availableAt);

    const [assigned] = await tx.select({ deliveryPartnerId: orderTrackingTable.deliveryPartnerId })
      .from(orderTrackingTable).where(and(eq(orderTrackingTable.orderId, order.id), sql`${orderTrackingTable.deliveryPartnerId} is not null`))
      .orderBy(desc(orderTrackingTable.updatedAt)).limit(1);
    let riderEarning = 0;
    if (assigned?.deliveryPartnerId) {
      const [partner] = await tx.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.id, assigned.deliveryPartnerId)).limit(1);
      if (partner) {
        const distanceKm = Math.max(0, money(order.pickupDistanceKm));
        riderEarning = distanceKm * money(settings.deliveryRatePerKm);
        const activeOffers = await tx.select({ partnerBonus: bannersTable.partnerBonus }).from(bannersTable)
          .where(and(eq(bannersTable.isActive, true), inArray(bannersTable.audience, ["delivery_partner", "all"])))
          .limit(20);
        const bannerIncentive = activeOffers.reduce((total, offer) => total + Math.max(0, money(offer.partnerBonus)), 0);
        const completedBefore = await tx.execute(sql`select count(*)::int as count from rider_earning_transactions where rider_user_id = ${partner.userId}`);
        const completedCount = Number((completedBefore as any).rows?.[0]?.count ?? 0);
        const rules = await tx.execute(sql`select partner_user_id as "partnerUserId", orders_required as "ordersRequired", bonus_amount as "bonusAmount", online_start_time as "onlineStartTime", online_end_time as "onlineEndTime" from partner_incentive_rules where is_active = true and (partner_user_id is null or partner_user_id = ${partner.userId})`);
        const ruleIncentive = ((rules as any).rows ?? []).reduce((total: number, rule: any) => {
          const required = Number(rule.ordersRequired ?? 0);
          const qualifiesByOrders = required <= 0 || (completedCount + 1) % required === 0;
          return qualifiesByOrders && isWithinTimeWindow(indiaTimeMinutes(), rule.onlineStartTime, rule.onlineEndTime) ? total + money(rule.bonusAmount) : total;
        }, 0);
        const incentive = bannerIncentive + ruleIncentive;
        const finalEarning = riderEarning + incentive;
        await tx.insert(riderEarningTransactionsTable).values({ orderId: order.id, riderUserId: partner.userId, distanceEarning: moneyText(riderEarning), incentive: moneyText(incentive), finalEarning: moneyText(finalEarning), status: "pending", availableAt });
        const rider = await ensureWallet(tx, partner.userId, "delivery_partner");
        await pendingEntry(tx, rider, "DELIVERY_EARNING", finalEarning, "order", String(order.id), `rider-earning:${order.id}:${partner.userId}`, availableAt);
      }
    }
    await tx.update(sellerSettlementsTable).set({ status: "pending" }).where(eq(sellerSettlementsTable.id, sellerSettlement.id));
    return { settled: true, gross, commission, sellerEarning, riderEarning, availableAt };
  });
}

export async function getWalletSnapshot(userId: number) {
  await releaseMaturedWallets();
  const [wallet] = await db.select().from(walletsTable).where(and(eq(walletsTable.ownerUserId, userId), eq(walletsTable.walletType, "earnings"))).limit(1);
  const [user] = await db.select({ walletBalance: usersTable.walletBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return { availableBalance: wallet?.availableBalance ?? user?.walletBalance ?? "0.00", pendingBalance: wallet?.pendingBalance ?? "0.00", heldBalance: wallet?.heldBalance ?? "0.00" };
}
