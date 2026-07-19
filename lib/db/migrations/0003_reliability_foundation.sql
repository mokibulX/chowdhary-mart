DO $$ BEGIN
  CREATE TYPE outbox_status AS ENUM ('pending', 'published', 'failed', 'dead');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_ledger_type AS ENUM ('RESERVED', 'RELEASED', 'SOLD', 'RETURNED', 'MANUAL_ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS idempotency_records (
  id serial PRIMARY KEY,
  key varchar(180) NOT NULL,
  user_id integer REFERENCES users(id),
  endpoint varchar(180) NOT NULL,
  request_hash varchar(96) NOT NULL,
  response_status integer,
  response_body json,
  resource_id varchar(120),
  locked_until timestamp,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_records_key_endpoint_idx
  ON idempotency_records(key, endpoint);

CREATE INDEX IF NOT EXISTS idempotency_records_user_expires_idx
  ON idempotency_records(user_id, expires_at);

CREATE TABLE IF NOT EXISTS outbox_events (
  id serial PRIMARY KEY,
  aggregate_type varchar(80) NOT NULL,
  aggregate_id varchar(120) NOT NULL,
  event_type varchar(120) NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  payload json NOT NULL,
  idempotency_key varchar(180),
  status outbox_status NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  available_at timestamp NOT NULL DEFAULT now(),
  published_at timestamp,
  last_error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_idempotency_idx
  ON outbox_events(idempotency_key, event_type)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbox_events_status_available_idx
  ON outbox_events(status, available_at, id);

CREATE INDEX IF NOT EXISTS outbox_events_aggregate_idx
  ON outbox_events(aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id),
  order_id integer REFERENCES orders(id),
  type inventory_ledger_type NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  idempotency_key varchar(180),
  note text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_ledger_idempotency_idx
  ON inventory_ledger(idempotency_key, product_id, type)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_ledger_product_created_idx
  ON inventory_ledger(product_id, created_at);

CREATE TABLE IF NOT EXISTS system_errors (
  id serial PRIMARY KEY,
  reference_id varchar(40) NOT NULL UNIQUE,
  request_id varchar(40),
  user_id integer REFERENCES users(id),
  role varchar(40),
  route varchar(240),
  method varchar(12),
  safe_message text NOT NULL,
  internal_message text,
  stack text,
  metadata json DEFAULT '{}',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_errors_created_idx
  ON system_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS orders_user_created_idx
  ON orders(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_store_status_created_idx
  ON orders(store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_zone_status_created_idx
  ON orders(zone_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS products_store_available_stock_idx
  ON products(store_id, is_available, stock);
