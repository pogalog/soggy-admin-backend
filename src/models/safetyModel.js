"use strict";

const schemaStateByPool = new WeakMap();

const SAFETY_DISPLAY_TYPES = ["embedded", "cart_add"];

async function ensureSafetySchema(pool) {
  const existingPromise = schemaStateByPool.get(pool);
  if (existingPromise) {
    return existingPromise;
  }

  const readyPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS safety (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        message TEXT NOT NULL,
        display_type TEXT NOT NULL CHECK (display_type IN ('embedded', 'cart_add')),
        updated_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const productsTableResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'products'
      ) AS has_products_table
    `);

    if (productsTableResult.rows[0] && productsTableResult.rows[0].has_products_table) {
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS safety_id BIGINT REFERENCES safety(id) ON DELETE SET NULL
      `);
    }
  })();

  schemaStateByPool.set(pool, readyPromise);

  try {
    return await readyPromise;
  } catch (error) {
    schemaStateByPool.delete(pool);
    throw error;
  }
}

async function listSafetyMessages(pool, options) {
  await ensureSafetySchema(pool);
  const safetyId = options && options.safetyId ? String(options.safetyId) : "";

  if (safetyId) {
    const result = await pool.query(
      `
        SELECT
          id,
          name,
          message,
          display_type,
          updated_by,
          created_at,
          updated_at
        FROM safety
        WHERE id = $1
        ORDER BY LOWER(name) ASC, id ASC
      `,
      [safetyId]
    );
    return result.rows;
  }

  const result = await pool.query(`
    SELECT
      id,
      name,
      message,
      display_type,
      updated_by,
      created_at,
      updated_at
    FROM safety
    ORDER BY LOWER(name) ASC, id ASC
  `);
  return result.rows;
}

async function upsertSafetyMessage(pool, safetyMessage) {
  await ensureSafetySchema(pool);

  if (safetyMessage.id) {
    const result = await pool.query(
      `
        UPDATE safety
        SET
          name = $2,
          message = $3,
          display_type = $4,
          updated_by = $5,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          name,
          message,
          display_type,
          updated_by,
          created_at,
          updated_at,
          FALSE AS inserted
      `,
      [
        safetyMessage.id,
        safetyMessage.name,
        safetyMessage.message,
        safetyMessage.displayType,
        safetyMessage.updatedBy
      ]
    );

    return result.rows[0] || null;
  }

  const result = await pool.query(
    `
      INSERT INTO safety (
        name,
        message,
        display_type,
        updated_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING
        id,
        name,
        message,
        display_type,
        updated_by,
        created_at,
        updated_at,
        TRUE AS inserted
    `,
    [
      safetyMessage.name,
      safetyMessage.message,
      safetyMessage.displayType,
      safetyMessage.updatedBy
    ]
  );

  return result.rows[0];
}

async function deleteSafetyMessageById(pool, safetyId) {
  await ensureSafetySchema(pool);
  const result = await pool.query(
    `
      DELETE FROM safety
      WHERE id = $1
    `,
    [safetyId]
  );

  return result.rowCount > 0;
}

module.exports = {
  SAFETY_DISPLAY_TYPES,
  ensureSafetySchema,
  listSafetyMessages,
  upsertSafetyMessage,
  deleteSafetyMessageById
};
