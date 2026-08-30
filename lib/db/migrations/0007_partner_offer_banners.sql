ALTER TABLE banners ADD COLUMN IF NOT EXISTS audience varchar(30) NOT NULL DEFAULT 'customer';
ALTER TABLE banners ADD COLUMN IF NOT EXISTS partner_bonus numeric(10,2) NOT NULL DEFAULT 0;
