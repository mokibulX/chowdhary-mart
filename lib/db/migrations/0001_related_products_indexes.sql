CREATE INDEX IF NOT EXISTS idx_products_category_available ON products (category_id, is_available);
CREATE INDEX IF NOT EXISTS idx_products_brand_available ON products (brand_id, is_available);
CREATE INDEX IF NOT EXISTS idx_products_store_stock ON products (store_id, stock);
CREATE INDEX IF NOT EXISTS idx_products_price_available ON products (price, is_available);
CREATE INDEX IF NOT EXISTS idx_products_rating_available ON products (rating, is_available);
CREATE INDEX IF NOT EXISTS idx_stores_live_service ON stores (is_active, is_open, is_verified);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews (product_id);
