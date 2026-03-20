"use strict";

function buildProductSelectClause() {
  return `
    SELECT
      p.id,
      p.title,
      p.description,
      p.sell_price_cents,
      p.days_to_create,
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
  `;
}

async function listProducts(pool, options) {
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

async function upsertProduct(pool, product) {
  const query = `
    WITH saved_product AS (
      INSERT INTO products (
        id,
        title,
        description,
        sell_price_cents,
        days_to_create,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
      SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        sell_price_cents = EXCLUDED.sell_price_cents,
        days_to_create = EXCLUDED.days_to_create,
        updated_at = NOW()
      RETURNING
        id,
        title,
        description,
        sell_price_cents,
        days_to_create,
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
  `;

  const values = [
    product.id,
    product.title,
    product.description,
    product.sellPriceCents,
    product.daysToCreate
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
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
