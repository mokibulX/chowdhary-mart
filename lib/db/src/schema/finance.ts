import { pgTable, serial, text, varchar, timestamp, integer, decimal, json, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id),
  ownerRole: varchar("owner_role", { length: 40 }).notNull(),
  walletType: varchar("wallet_type", { length: 50 }).notNull(),
  availableBalance: decimal("available_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  pendingBalance: decimal("pending_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  heldBalance: decimal("held_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: varchar("currency", { length: 10 }).notNull().default("INR"),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  ownerTypeIdx: uniqueIndex("wallets_owner_type_idx").on(table.ownerUserId, table.walletType),
}));

export const walletLedgerEntriesTable = pgTable("wallet_ledger_entries", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id),
  transactionType: varchar("transaction_type", { length: 50 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).notNull(),
  closingBalance: decimal("closing_balance", { precision: 12, scale: 2 }).notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: varchar("reference_id", { length: 100 }),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("posted"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  idempotencyIdx: uniqueIndex("wallet_ledger_idempotency_idx").on(table.idempotencyKey),
}));

export const walletHoldsTable = pgTable("wallet_holds", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: varchar("reference_id", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  releasedAt: timestamp("released_at"),
});

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").references(() => walletsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  method: varchar("method", { length: 20 }).notNull(),
  upiId: varchar("upi_id", { length: 120 }),
  bankAccountMasked: varchar("bank_account_masked", { length: 40 }),
  ifsc: varchar("ifsc", { length: 20 }),
  payoutMode: varchar("payout_mode", { length: 20 }).default("UPI"),
  status: varchar("status", { length: 30 }).notNull().default("REQUESTED"),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  withdrawalIdempotencyIdx: uniqueIndex("withdrawal_requests_idempotency_idx").on(table.idempotencyKey),
}));

export const payoutContactsTable = pgTable("payout_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  providerContactId: varchar("provider_contact_id", { length: 120 }),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 160 }),
  phone: varchar("phone", { length: 30 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payoutFundAccountsTable = pgTable("payout_fund_accounts", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => payoutContactsTable.id),
  providerFundAccountId: varchar("provider_fund_account_id", { length: 120 }),
  accountType: varchar("account_type", { length: 30 }).notNull(),
  upiId: varchar("upi_id", { length: 120 }),
  bankAccountMasked: varchar("bank_account_masked", { length: 40 }),
  ifsc: varchar("ifsc", { length: 20 }),
  verificationStatus: varchar("verification_status", { length: 30 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  withdrawalRequestId: integer("withdrawal_request_id").references(() => withdrawalRequestsTable.id),
  providerPayoutId: varchar("provider_payout_id", { length: 120 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("INR"),
  status: varchar("status", { length: 30 }).notNull().default("QUEUED"),
  purpose: varchar("purpose", { length: 60 }).notNull().default("payout"),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  payoutIdempotencyIdx: uniqueIndex("payouts_idempotency_idx").on(table.idempotencyKey),
}));

export const payoutWebhookEventsTable = pgTable("payout_webhook_events", {
  id: serial("id").primaryKey(),
  eventId: varchar("event_id", { length: 140 }).notNull(),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  verified: varchar("verified", { length: 10 }).notNull().default("false"),
  payload: json("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  payoutEventIdx: uniqueIndex("payout_webhook_events_event_id_idx").on(table.eventId),
}));

export const sellerSettlementsTable = pgTable("seller_settlements", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  sellerUserId: integer("seller_user_id").notNull().references(() => usersTable.id),
  grossOrderAmount: decimal("gross_order_amount", { precision: 12, scale: 2 }).notNull(),
  sellerItemAmount: decimal("seller_item_amount", { precision: 12, scale: 2 }).notNull(),
  platformCommission: decimal("platform_commission", { precision: 12, scale: 2 }).notNull().default("0"),
  taxDeduction: decimal("tax_deduction", { precision: 12, scale: 2 }).notNull().default("0"),
  refundAdjustment: decimal("refund_adjustment", { precision: 12, scale: 2 }).notNull().default("0"),
  penaltyAdjustment: decimal("penalty_adjustment", { precision: 12, scale: 2 }).notNull().default("0"),
  netSellerEarning: decimal("net_seller_earning", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  availableAt: timestamp("available_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const riderEarningTransactionsTable = pgTable("rider_earning_transactions", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  riderUserId: integer("rider_user_id").notNull().references(() => usersTable.id),
  baseEarning: decimal("base_earning", { precision: 10, scale: 2 }).notNull().default("0"),
  distanceEarning: decimal("distance_earning", { precision: 10, scale: 2 }).notNull().default("0"),
  waitingCharge: decimal("waiting_charge", { precision: 10, scale: 2 }).notNull().default("0"),
  incentive: decimal("incentive", { precision: 10, scale: 2 }).notNull().default("0"),
  tip: decimal("tip", { precision: 10, scale: 2 }).notNull().default("0"),
  penalty: decimal("penalty", { precision: 10, scale: 2 }).notNull().default("0"),
  finalEarning: decimal("final_earning", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  availableAt: timestamp("available_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reconciliationRecordsTable = pgTable("reconciliation_records", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 30 }).notNull(),
  referenceType: varchar("reference_type", { length: 50 }).notNull(),
  referenceId: varchar("reference_id", { length: 120 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  differenceAmount: decimal("difference_amount", { precision: 12, scale: 2 }).default("0"),
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const financialAuditLogsTable = pgTable("financial_audit_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => usersTable.id),
  action: varchar("action", { length: 100 }).notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: varchar("reference_id", { length: 120 }),
  reason: text("reason"),
  oldValue: json("old_value").$type<Record<string, unknown>>(),
  newValue: json("new_value").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const platformSettingsTable = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  singletonKey: varchar("singleton_key", { length: 30 }).notNull().default("default"),
  commissionPercentage: decimal("commission_percentage", { precision: 5, scale: 2 }).notNull().default("10"),
  deliveryRatePerKm: decimal("delivery_rate_per_km", { precision: 10, scale: 2 }).notNull().default("8"),
  deliveryMinCharge: decimal("delivery_min_charge", { precision: 10, scale: 2 }).notNull().default("0"),
  maxDeliveryDistanceKm: decimal("max_delivery_distance_km", { precision: 10, scale: 2 }).notNull().default("5"),
  freeDeliveryThreshold: decimal("free_delivery_threshold", { precision: 12, scale: 2 }).notNull().default("0"),
  deliveryChargeEnabled: boolean("delivery_charge_enabled").notNull().default(true),
  additionalItemDeliveryPercentage: decimal("additional_item_delivery_percentage", { precision: 5, scale: 2 }).notNull().default("50"),
  firstItemDeliveryPercentage: decimal("first_item_delivery_percentage", { precision: 5, scale: 2 }).notNull().default("100"),
  secondItemDeliveryPercentage: decimal("second_item_delivery_percentage", { precision: 5, scale: 2 }).notNull().default("50"),
  thirdItemDeliveryPercentage: decimal("third_item_delivery_percentage", { precision: 5, scale: 2 }).notNull().default("50"),
  freeDeliveryFromItem: integer("free_delivery_from_item").notNull().default(4),
  settlementMode: varchar("settlement_mode", { length: 20 }).notNull().default("delay"),
  settlementDelayHours: integer("settlement_delay_hours").notNull().default(24),
  weeklyPayoutDay: integer("weekly_payout_day").notNull().default(1),
  minimumWithdrawal: decimal("minimum_withdrawal", { precision: 10, scale: 2 }).notNull().default("100"),
  payoutEnabled: boolean("payout_enabled").notNull().default(false),
  selfieRequired: boolean("selfie_required").notNull().default(true),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  singletonIdx: uniqueIndex("platform_settings_singleton_idx").on(table.singletonKey),
}));
