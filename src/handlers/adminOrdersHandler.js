"use strict";

const {
  ORDER_STATUS_OPTIONS,
  cancelOrderById,
  getOrderById,
  listOrders,
  updateOrderStatusById
} = require("../models/orderModel");

function withStatusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureJsonContentType(req) {
  const contentType = (req.headers && req.headers["content-type"]) || "";
  const isJson =
    (typeof req.is === "function" && req.is("application/json")) ||
    String(contentType).toLowerCase().includes("application/json");

  if (!isJson) {
    throw withStatusError("Content-Type must be application/json", 415);
  }
}

function parseJsonBody(req) {
  function parseText(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw withStatusError(`Invalid JSON body: ${error.message}`, 400);
    }
  }

  if (req.body === undefined || req.body === null || req.body === "") {
    return {};
  }

  if (Buffer.isBuffer(req.body)) {
    const text = req.body.toString("utf8").trim();
    return text ? parseText(text) : {};
  }

  if (typeof req.body === "string") {
    const text = req.body.trim();
    return text ? parseText(text) : {};
  }

  if (typeof req.body === "object") {
    return req.body;
  }

  throw withStatusError("Unsupported request body format", 400);
}

function methodNotAllowed(res) {
  res.set("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

function readRequiredString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw withStatusError(`${fieldName} is required`, 400);
  }

  return normalized;
}

function readOptionalFilterString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function readOptionalDateOnly(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !isValidDateOnly(value)) {
    throw withStatusError(`${fieldName} must be a valid YYYY-MM-DD date`, 400);
  }

  return value;
}

function readOptionalStatus(value) {
  const status = readOptionalFilterString(value);
  if (!status) {
    return null;
  }

  if (!ORDER_STATUS_OPTIONS.includes(status)) {
    throw withStatusError(`Unsupported status: ${status}`, 400);
  }

  return status;
}

function readSortBy(value) {
  if (value === undefined || value === null || value === "") {
    return "date";
  }

  if (value !== "date" && value !== "subtotal") {
    throw withStatusError("sort_by must be either date or subtotal", 400);
  }

  return value;
}

function readSortOrder(value) {
  if (value === undefined || value === null || value === "") {
    return "desc";
  }

  if (value !== "asc" && value !== "desc") {
    throw withStatusError("sort_order must be either asc or desc", 400);
  }

  return value;
}

function normalizeListOrderFilters(query) {
  const source = query && typeof query === "object" ? query : {};
  const allowedKeys = new Set([
    "id",
    "product_id",
    "status",
    "start_date",
    "end_date",
    "sort_by",
    "sort_order"
  ]);

  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key)) {
      throw withStatusError(`Unsupported query parameter: ${key}`, 400);
    }
  }

  const startDate = readOptionalDateOnly(source.start_date, "start_date");
  const endDate = readOptionalDateOnly(source.end_date, "end_date");
  if (startDate && endDate && startDate > endDate) {
    throw withStatusError("start_date must be on or before end_date", 400);
  }

  return {
    id: readOptionalFilterString(source.id),
    productId: readOptionalFilterString(source.product_id),
    status: readOptionalStatus(source.status),
    startDate,
    endDate,
    sortBy: readSortBy(source.sort_by),
    sortOrder: readSortOrder(source.sort_order)
  };
}

function readOptionalBoolean(value, fieldName) {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw withStatusError(`${fieldName} must be a boolean`, 400);
  }

  return value;
}

function normalizeOrderActionRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw withStatusError("Request body must be a JSON object", 400);
  }

  const action = readRequiredString(body.action, "action").toLowerCase();
  const id = readRequiredString(body.id, "id");

  if (action === "update_status") {
    return {
      action,
      id,
      status: readRequiredString(body.status, "status")
    };
  }

  if (action === "cancel") {
    return {
      action,
      id,
      refund: readOptionalBoolean(body.refund, "refund")
    };
  }

  throw withStatusError(`Unsupported action: ${action}`, 400);
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function mapOrderItemResponse(item) {
  return {
    product_id: item.product_id,
    name: item.name,
    unit_amount: Number(item.unit_amount),
    quantity: Number(item.quantity)
  };
}

function mapOrderResponse(order) {
  return {
    id: order.id,
    currency: order.currency,
    status: order.status,
    subtotal_amount: Number(order.subtotal_amount),
    tax_amount: order.tax_amount === null ? null : Number(order.tax_amount),
    total_amount: Number(order.total_amount),
    shipping_method:
      typeof order.shipping_method === "string" && order.shipping_method.trim()
        ? order.shipping_method.trim()
        : null,
    shipping_amount:
      order.shipping_amount === null ? null : Number(order.shipping_amount),
    created_at: toIsoString(order.created_at),
    updated_at: toIsoString(order.updated_at),
    items: Array.isArray(order.items) ? order.items.map(mapOrderItemResponse) : []
  };
}

function createAdminOrdersHandler({ getPool }) {
  return async function adminOrdersHandler(req, res) {
    try {
      if (req.method !== "GET" && req.method !== "POST") {
        return methodNotAllowed(res);
      }

      const pool = getPool();

      if (req.method === "GET") {
        const filters = normalizeListOrderFilters(req.query);
        const orders = await listOrders(pool, filters);
        return res.status(200).json({
          orders: orders.map(mapOrderResponse),
          status_options: ORDER_STATUS_OPTIONS
        });
      }

      ensureJsonContentType(req);
      const body = parseJsonBody(req);
      const request = normalizeOrderActionRequest(body);

      if (request.action === "update_status") {
        if (!ORDER_STATUS_OPTIONS.includes(request.status)) {
          throw withStatusError(`Unsupported status: ${request.status}`, 400);
        }

        const result = await updateOrderStatusById(pool, {
          orderId: request.id,
          status: request.status
        });

        if (!result) {
          return res.status(404).json({
            error: "Order not found"
          });
        }

        return res.status(200).json({
          changed: result.changed,
          message: result.changed ? "Order status updated." : "Order status was already set.",
          order: mapOrderResponse(result.order)
        });
      }

      if (request.refund) {
        const order = await getOrderById(pool, request.id);
        if (!order) {
          return res.status(404).json({
            error: "Order not found"
          });
        }

        return res.status(200).json({
          changed: false,
          message: "Stripe refunds are not implemented yet. No changes were made.",
          order: mapOrderResponse(order)
        });
      }

      const result = await cancelOrderById(pool, {
        orderId: request.id
      });

      if (!result) {
        return res.status(404).json({
          error: "Order not found"
        });
      }

      return res.status(200).json({
        changed: result.changed,
        message: result.changed ? "Order marked as canceled." : "Order was already canceled.",
        order: mapOrderResponse(result.order)
      });
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      console.error("adminOrdersHandler error", {
        message: error.message,
        statusCode
      });

      return res.status(statusCode).json({
        error: statusCode === 500 ? "Internal server error" : error.message
      });
    }
  };
}

module.exports = {
  createAdminOrdersHandler
};
