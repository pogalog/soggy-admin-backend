CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sell_price_cents INTEGER NOT NULL CHECK (sell_price_cents >= 0),
  days_to_create NUMERIC(8,2) NOT NULL CHECK (days_to_create >= 0),
  shipping_weight_lbs NUMERIC(8,2) CHECK (shipping_weight_lbs > 0),
  shipping_length_in NUMERIC(8,2) CHECK (shipping_length_in > 0),
  shipping_width_in NUMERIC(8,2) CHECK (shipping_width_in > 0),
  shipping_height_in NUMERIC(8,2) CHECK (shipping_height_in > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_images (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  alt TEXT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
  ON product_images (product_id, sort_order);

CREATE TABLE IF NOT EXISTS safety (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL,
  display_type TEXT NOT NULL CHECK (display_type IN ('embedded', 'cart_add')),
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS safety_id BIGINT REFERENCES safety(id) ON DELETE SET NULL;
