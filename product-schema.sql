CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sell_price_cents INTEGER NOT NULL CHECK (sell_price_cents >= 0),
  inventory_qty INTEGER NOT NULL CHECK (inventory_qty >= 0),
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
