CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sell_price_cents INTEGER NOT NULL CHECK (sell_price_cents >= 0),
  days_to_create NUMERIC(8,2) NOT NULL CHECK (days_to_create >= 0),
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
