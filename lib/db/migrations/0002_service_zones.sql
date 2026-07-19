CREATE TABLE IF NOT EXISTS service_zones (
  id SERIAL PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  city_id INTEGER,
  state_id INTEGER,
  city VARCHAR(120),
  state VARCHAR(120),
  centre_latitude REAL NOT NULL,
  centre_longitude REAL NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 5000,
  boundary_geometry JSONB,
  delivery_minutes INTEGER NOT NULL DEFAULT 40,
  minimum_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 99,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  accepting_orders BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  seller_registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rider_registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_admin_id INTEGER REFERENCES users(id),
  updated_by_admin_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  archived_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seller_zone_assignments (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INTEGER,
  zone_id INTEGER NOT NULL REFERENCES service_zones(id),
  assignment_type VARCHAR(30) NOT NULL DEFAULT 'primary',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  assigned_by_admin_id INTEGER REFERENCES users(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT now(),
  removed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rider_zone_assignments (
  id SERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES service_zones(id),
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  assigned_by_admin_id INTEGER REFERENCES users(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT now(),
  removed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zone_change_requests (
  id SERIAL PRIMARY KEY,
  user_type VARCHAR(30) NOT NULL,
  seller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  rider_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  current_zone_id INTEGER REFERENCES service_zones(id),
  requested_zone_id INTEGER NOT NULL REFERENCES service_zones(id),
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT now(),
  reviewed_by_admin_id INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS zone_admin_assignments (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zone_audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id),
  actor_role VARCHAR(40),
  action VARCHAR(80) NOT NULL,
  zone_id INTEGER REFERENCES service_zones(id),
  target_user_id INTEGER REFERENCES users(id),
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(80),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE stores ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES service_zones(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES service_zones(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES service_zones(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_zone_id INTEGER REFERENCES service_zones(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shop_zone_id INTEGER REFERENCES service_zones(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_zone_id INTEGER REFERENCES service_zones(id);
ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS current_zone_id INTEGER REFERENCES service_zones(id);

CREATE INDEX IF NOT EXISTS service_zones_active_idx ON service_zones(is_active, archived_at);
CREATE INDEX IF NOT EXISTS service_zones_registration_idx ON service_zones(registration_enabled, seller_registration_enabled, rider_registration_enabled);
CREATE INDEX IF NOT EXISTS stores_zone_idx ON stores(zone_id);
CREATE INDEX IF NOT EXISTS products_zone_idx ON products(zone_id);
CREATE INDEX IF NOT EXISTS orders_zone_idx ON orders(zone_id);
CREATE INDEX IF NOT EXISTS seller_zone_assignments_scope_idx ON seller_zone_assignments(seller_id, zone_id, status);
CREATE INDEX IF NOT EXISTS rider_zone_assignments_scope_idx ON rider_zone_assignments(rider_id, zone_id, status);

INSERT INTO service_zones (
  code, name, city, state, centre_latitude, centre_longitude, radius_meters,
  delivery_minutes, minimum_order_amount, is_active, accepting_orders,
  delivery_enabled, registration_enabled, seller_registration_enabled, rider_registration_enabled
) VALUES (
  'KOL-NT-5K', 'Kolkata New Town 5 km', 'Kolkata', 'West Bengal', 22.6076, 88.4695, 5000,
  40, 99, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
) ON CONFLICT (code) DO NOTHING;
