"use strict";

function isProductImagesPrimaryKeyViolation(error) {
  return (
    error &&
    error.code === "23505" &&
    error.constraint === "product_images_pkey"
  );
}

async function realignProductImagesIdSequence(pool) {
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('product_images', 'id'),
      COALESCE((SELECT MAX(id) FROM product_images), 0)
    )
  `);
}

async function reserveSortOrder(client, productId, requestedSortOrder) {
  if (requestedSortOrder === null || requestedSortOrder === undefined) {
    const nextSortOrderResult = await client.query(
      `
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
        FROM product_images
        WHERE product_id = $1
      `,
      [productId]
    );

    return Number(nextSortOrderResult.rows[0].next_sort_order);
  }

  await client.query(
    `
      UPDATE product_images
      SET sort_order = sort_order + 1
      WHERE product_id = $1
        AND sort_order >= $2
    `,
    [productId, requestedSortOrder]
  );

  return requestedSortOrder;
}

async function createProductImage(pool, payload) {
  return createProductImageWithRetry(pool, payload, 0);
}

async function createProductImageWithRetry(pool, payload, retryCount) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      payload.productId
    ]);

    const existingResult = await client.query(
      `
        SELECT id, product_id, path, alt, sort_order
        FROM product_images
        WHERE product_id = $1
          AND path = $2
        LIMIT 1
      `,
      [payload.productId, payload.path]
    );

    if (existingResult.rowCount > 0) {
      await client.query("COMMIT");
      return {
        inserted: false,
        row: existingResult.rows[0]
      };
    }

    const sortOrder = await reserveSortOrder(
      client,
      payload.productId,
      payload.sortOrder
    );

    const insertResult = await client.query(
      `
        INSERT INTO product_images (product_id, path, alt, sort_order)
        VALUES ($1, $2, $3, $4)
        RETURNING id, product_id, path, alt, sort_order
      `,
      [payload.productId, payload.path, payload.alt, sortOrder]
    );

    await client.query("COMMIT");

    return {
      inserted: true,
      row: insertResult.rows[0]
    };
  } catch (error) {
    await client.query("ROLLBACK");

    if (isProductImagesPrimaryKeyViolation(error) && retryCount < 1) {
      await realignProductImagesIdSequence(pool);
      return createProductImageWithRetry(pool, payload, retryCount + 1);
    }

    throw error;
  } finally {
    client.release();
  }
}

async function deleteProductImageById(pool, id) {
  await pool.query("DELETE FROM product_images WHERE id = $1", [id]);
}

module.exports = {
  createProductImage,
  deleteProductImageById
};
