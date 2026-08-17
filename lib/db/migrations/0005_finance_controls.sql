CREATE TABLE IF NOT EXISTS platform_settings (
  id serial PRIMARY KEY,
  singleton_key varchar(30) NOT NULL DEFAULT 'default',
  commission_percentage numeric(5,2) NOT NULL DEFAULT 10,
  delivery_rate_per_km numeric(10,2) NOT NULL DEFAULT 8,
  settlement_mode varchar(20) NOT NULL DEFAULT 'delay',
  settlement_delay_hours integer NOT NULL DEFAULT 24,
  weekly_payout_day integer NOT NULL DEFAULT 1,
  minimum_withdrawal numeric(10,2) NOT NULL DEFAULT 100,
  payout_enabled boolean NOT NULL DEFAULT false,
  selfie_required boolean NOT NULL DEFAULT true,
  updated_by integer REFERENCES users(id),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton_key_unique UNIQUE(singleton_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_settlements_order_unique
  ON seller_settlements(order_id);

CREATE UNIQUE INDEX IF NOT EXISTS rider_earning_order_user_unique
  ON rider_earning_transactions(order_id, rider_user_id);

CREATE INDEX IF NOT EXISTS wallet_ledger_wallet_created_idx
  ON wallet_ledger_entries(wallet_id, created_at DESC);
