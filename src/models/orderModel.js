"use strict";

const ORDER_STATUS_OPTIONS = Object.freeze([
  "pending_payment",
  "paid",
  "canceled"
]);

const ORDER_SORT_FIELDS = Object.freeze({
  date: "o.created_at",
  subtotal: "o.subtotal_amount"
});

function buildOrderSelectClause() {
  return `
    SELECT
      o.id,
      o.currency,
      o.status,
      o.subtotal_amount,
      o.tax_amount,
      o.total_amount,
      o.shipping_method,
      o.shipping_amount,
      o.created_at,
      o.updated_at,
      items.items
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'product_id', oi.product_id,
            'name', oi.name,
            'unit_amount', oi.unit_amount,
            'quantity', oi.quantity
          )
          ORDER BY oi.created_at ASC, oi.product_id ASC
        ),
        '[]'::json
      ) AS items
      FROM order_items oi
      WHERE oi.order_id = o.id
    ) items ON TRUE
  `;
}

async function listOrders(pool, filters) {
  const conditions = [];
  const values = [];
  let parameterIndex = 1;

  if (filters.id) {
    conditions.push(`o.id = $${parameterIndex}`);
    values.push(filters.id);
    parameterIndex += 1;
  }

  if (filters.productId) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM order_items filter_oi
        WHERE filter_oi.order_id = o.id
          AND filter_oi.product_id = $${parameterIndex}
      )
    `);
    values.push(filters.productId);
    parameterIndex += 1;
  }

  if (filters.status) {
    conditions.push(`o.status = $${parameterIndex}`);
    values.push(filters.status);
    parameterIndex += 1;
  }

  if (filters.startDate) {
    conditions.push(`o.created_at >= $${parameterIndex}::date`);
    values.push(filters.startDate);
    parameterIndex += 1;
  }

  if (filters.endDate) {
    conditions.push(`o.created_at < ($${parameterIndex}::date + INTERVAL '1 day')`);
    values.push(filters.endDate);
    parameterIndex += 1;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortField = ORDER_SORT_FIELDS[filters.sortBy] || ORDER_SORT_FIELDS.date;
  const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";
  const tieBreakers =
    filters.sortBy === "subtotal"
      ? `, o.created_at DESC, o.id ASC`
      : `, o.id ASC`;

  const result = await pool.query(
    `
      ${buildOrderSelectClause()}
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}${tieBreakers}
    `,
    values
  );

  return result.rows;
}

async function getOrderById(pool, orderId) {
  const orders = await listOrders(pool, {
    id: orderId,
    productId: null,
    status: null,
    startDate: null,
    endDate: null,
    sortBy: "date",
    sortOrder: "desc"
  });

  return orders[0] || null;
}

async function updateOrderStatusById(pool, { orderId, status }) {
  const existingOrder = await getOrderById(pool, orderId);
  if (!existingOrder) {
    return null;
  }

  if (existingOrder.status === status) {
    return {
      changed: false,
      order: existingOrder
    };
  }

  await pool.query(
    `
      UPDATE orders
      SET
        status = $2,
        updated_at = NOW()
      WHERE id = $1
    `,
    [orderId, status]
  );

  return {
    changed: true,
    order: await getOrderById(pool, orderId)
  };
}

async function cancelOrderById(pool, { orderId }) {
  return updateOrderStatusById(pool, {
    orderId,
    status: "canceled"
  });
}

module.exports = {
  ORDER_STATUS_OPTIONS,
  cancelOrderById,
  getOrderById,
  listOrders,
  updateOrderStatusById
};
