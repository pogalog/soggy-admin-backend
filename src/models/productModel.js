"use strict";

const { ensureSafetySchema } = require("./safetyModel");

const schemaStateByPool = new WeakMap();

async function ensureProductSchema(pool) {
  const existingPromise = schemaStateByPool.get(pool);
  if (existingPromise) {
    return existingPromise;
  }

  const readyPromise = (async () => {
    await ensureSafetySchema(pool);

    await pool.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS shipping_weight_lbs NUMERIC(8,2) CHECK (shipping_weight_lbs > 0),
        ADD COLUMN IF NOT EXISTS shipping_length_in NUMERIC(8,2) CHECK (shipping_length_in > 0),
        ADD COLUMN IF NOT EXISTS shipping_width_in NUMERIC(8,2) CHECK (shipping_width_in > 0),
        ADD COLUMN IF NOT EXISTS shipping_height_in NUMERIC(8,2) CHECK (shipping_height_in > 0)
    `);

    const result = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'products'
          AND column_name IN ('weight', 'length', 'width', 'height')
      `
    );

    const columnNames = new Set(result.rows.map((row) => row.column_name));
    const hasFlatColumns =
      columnNames.has("weight") &&
      columnNames.has("length") &&
      columnNames.has("width") &&
      columnNames.has("height");

    if (hasFlatColumns) {
      await pool.query(`
        UPDATE products
        SET
          shipping_weight_lbs = CASE
            WHEN shipping_weight_lbs > 0 THEN shipping_weight_lbs
            WHEN weight > 0 THEN weight
            ELSE NULL
          END,
          shipping_length_in = CASE
            WHEN shipping_length_in > 0 THEN shipping_length_in
            WHEN length > 0 THEN length
            ELSE NULL
          END,
          shipping_width_in = CASE
            WHEN shipping_width_in > 0 THEN shipping_width_in
            WHEN width > 0 THEN width
            ELSE NULL
          END,
          shipping_height_in = CASE
            WHEN shipping_height_in > 0 THEN shipping_height_in
            WHEN height > 0 THEN height
            ELSE NULL
          END,
          weight = CASE
            WHEN shipping_weight_lbs > 0 THEN shipping_weight_lbs
            WHEN weight > 0 THEN weight
            ELSE NULL
          END,
          length = CASE
            WHEN shipping_length_in > 0 THEN shipping_length_in
            WHEN length > 0 THEN length
            ELSE NULL
          END,
          width = CASE
            WHEN shipping_width_in > 0 THEN shipping_width_in
            WHEN width > 0 THEN width
            ELSE NULL
          END,
          height = CASE
            WHEN shipping_height_in > 0 THEN shipping_height_in
            WHEN height > 0 THEN height
            ELSE NULL
          END
        WHERE
          shipping_weight_lbs IS DISTINCT FROM CASE
            WHEN shipping_weight_lbs > 0 THEN shipping_weight_lbs
            WHEN weight > 0 THEN weight
            ELSE NULL
          END OR
          shipping_length_in IS DISTINCT FROM CASE
            WHEN shipping_length_in > 0 THEN shipping_length_in
            WHEN length > 0 THEN length
            ELSE NULL
          END OR
          shipping_width_in IS DISTINCT FROM CASE
            WHEN shipping_width_in > 0 THEN shipping_width_in
            WHEN width > 0 THEN width
            ELSE NULL
          END OR
          shipping_height_in IS DISTINCT FROM CASE
            WHEN shipping_height_in > 0 THEN shipping_height_in
            WHEN height > 0 THEN height
            ELSE NULL
          END OR
          weight IS DISTINCT FROM CASE
            WHEN shipping_weight_lbs > 0 THEN shipping_weight_lbs
            WHEN weight > 0 THEN weight
            ELSE NULL
          END OR
          length IS DISTINCT FROM CASE
            WHEN shipping_length_in > 0 THEN shipping_length_in
            WHEN length > 0 THEN length
            ELSE NULL
          END OR
          width IS DISTINCT FROM CASE
            WHEN shipping_width_in > 0 THEN shipping_width_in
            WHEN width > 0 THEN width
            ELSE NULL
          END OR
          height IS DISTINCT FROM CASE
            WHEN shipping_height_in > 0 THEN shipping_height_in
            WHEN height > 0 THEN height
            ELSE NULL
          END
      `);
    }

    return {
      hasFlatColumns
    };
  })();

  schemaStateByPool.set(pool, readyPromise);

  try {
    return await readyPromise;
  } catch (error) {
    schemaStateByPool.delete(pool);
    throw error;
  }
}

function buildProductSelectClause() {
  return `
    SELECT
      p.id,
      p.title,
      p.description,
      p.sell_price_cents,
      p.days_to_create,
      p.safety_id,
      s.name AS safety_name,
      p.shipping_weight_lbs AS weight,
      p.shipping_length_in AS length,
      p.shipping_width_in AS width,
      p.shipping_height_in AS height,
      p.created_at,
      p.updated_at,
      images.image_urls
    FROM products p
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        array_agg(pi.path ORDER BY pi.sort_order ASC, pi.id ASC),
        ARRAY[]::TEXT[]
      ) AS image_urls
      FROM product_images pi
      WHERE pi.product_id = p.id
    ) images ON TRUE
    LEFT JOIN safety s ON s.id = p.safety_id
  `;
}

async function listProducts(pool, options) {
  await ensureProductSchema(pool);
  const productId = options && options.productId ? String(options.productId) : "";
  const baseSelect = buildProductSelectClause();

  if (productId) {
    const filteredResult = await pool.query(
      `
        ${baseSelect}
        WHERE p.id = $1
        ORDER BY p.created_at DESC, p.id ASC
      `,
      [productId]
    );
    return filteredResult.rows;
  }

  const allResult = await pool.query(
    `
      ${baseSelect}
      ORDER BY p.created_at DESC, p.id ASC
    `
  );
  return allResult.rows;
}

async function syncFlatColumnsForProduct(pool, productId, product) {
  const schemaState = await ensureProductSchema(pool);
  if (!schemaState.hasFlatColumns) {
    return;
  }

  await pool.query(
    `
      UPDATE products
      SET
        weight = $2,
        length = $3,
        width = $4,
        height = $5
      WHERE id = $1
    `,
    [
      productId,
      product.weight,
      product.length,
      product.width,
      product.height
    ]
  );
}

async function upsertProduct(pool, product) {
  await ensureProductSchema(pool);
  const query = `
    WITH saved_product AS (
      INSERT INTO products (
        id,
        title,
        description,
        sell_price_cents,
        days_to_create,
        safety_id,
        shipping_weight_lbs,
        shipping_length_in,
        shipping_width_in,
        shipping_height_in,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
      SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        sell_price_cents = EXCLUDED.sell_price_cents,
        days_to_create = EXCLUDED.days_to_create,
        safety_id = EXCLUDED.safety_id,
        shipping_weight_lbs = EXCLUDED.shipping_weight_lbs,
        shipping_length_in = EXCLUDED.shipping_length_in,
        shipping_width_in = EXCLUDED.shipping_width_in,
        shipping_height_in = EXCLUDED.shipping_height_in,
        updated_at = NOW()
      RETURNING
        id,
        title,
        description,
        sell_price_cents,
        days_to_create,
        safety_id,
        shipping_weight_lbs AS weight,
        shipping_length_in AS length,
        shipping_width_in AS width,
        shipping_height_in AS height,
        created_at,
        updated_at,
        (xmax = 0) AS inserted
    )
    SELECT
      saved_product.id,
      saved_product.title,
      saved_product.description,
      saved_product.sell_price_cents,
      saved_product.days_to_create,
      saved_product.safety_id,
      s.name AS safety_name,
      saved_product.weight,
      saved_product.length,
      saved_product.width,
      saved_product.height,
      saved_product.created_at,
      saved_product.updated_at,
      saved_product.inserted,
      images.image_urls
    FROM saved_product
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        array_agg(pi.path ORDER BY pi.sort_order ASC, pi.id ASC),
        ARRAY[]::TEXT[]
      ) AS image_urls
      FROM product_images pi
      WHERE pi.product_id = saved_product.id
    ) images ON TRUE
    LEFT JOIN safety s ON s.id = saved_product.safety_id
  `;

  const values = [
    product.id,
    product.title,
    product.description,
    product.sellPriceCents,
    product.daysToCreate,
    product.safetyId,
    product.weight,
    product.length,
    product.width,
    product.height
  ];

  const result = await pool.query(query, values);
  const savedProduct = result.rows[0];
  await syncFlatColumnsForProduct(pool, savedProduct.id, savedProduct);
  return savedProduct;
}

async function deleteProductById(pool, productId) {
  const result = await pool.query(
    `
      DELETE FROM products
      WHERE id = $1
    `,
    [productId]
  );

  return result.rowCount > 0;
}

module.exports = {
  listProducts,
  upsertProduct,
  deleteProductById
};
