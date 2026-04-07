"use strict";

const {
  listProducts,
  upsertProduct,
  deleteProductById
} = require("../models/productModel");

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

function readRequiredString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw withStatusError(`${fieldName} is required`, 400);
  }
  return normalized;
}

function readNonNegativeInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw withStatusError(`${fieldName} must be a non-negative integer`, 400);
  }
  return parsed;
}

function readNonNegativeNumber(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw withStatusError(`${fieldName} must be a non-negative number`, 400);
  }
  return parsed;
}

function readOptionalPositiveInteger(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw withStatusError(`${fieldName} must be a positive integer`, 400);
  }

  return parsed;
}

function readOptionalNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw withStatusError(`${fieldName} must be a non-negative number`, 400);
  }

  return parsed;
}

function readOptionalProductMeasurement(body, fieldName) {
  const legacyFieldNames = {
    weight: "shipping_weight_lbs",
    length: "shipping_length_in",
    width: "shipping_width_in",
    height: "shipping_height_in"
  };
  const legacyFieldName = legacyFieldNames[fieldName];

  if (!body || typeof body !== "object") {
    return null;
  }

  function normalizeMeasurementValue(value, sourceFieldName) {
    const parsed = readOptionalNonNegativeNumber(value, sourceFieldName);
    return parsed === 0 ? null : parsed;
  }

  if (Object.prototype.hasOwnProperty.call(body, fieldName)) {
    return normalizeMeasurementValue(body[fieldName], fieldName);
  }

  if (legacyFieldName && Object.prototype.hasOwnProperty.call(body, legacyFieldName)) {
    return normalizeMeasurementValue(body[legacyFieldName], legacyFieldName);
  }

  if (body.dimensions && typeof body.dimensions === "object") {
    return normalizeMeasurementValue(body.dimensions[fieldName], fieldName);
  }

  return null;
}

function normalizeCreateProductRequest(body) {
  if (!body || typeof body !== "object") {
    throw withStatusError("Request body must be a JSON object", 400);
  }

  return {
    id: readRequiredString(body.id, "id"),
    title: readRequiredString(body.title, "title"),
    description: readRequiredString(body.description, "description"),
    sellPriceCents: readNonNegativeInteger(
      body.sell_price_cents,
      "sell_price_cents"
    ),
    daysToCreate: readNonNegativeNumber(body.days_to_create, "days_to_create"),
    safetyId: readOptionalPositiveInteger(body.safety_id, "safety_id"),
    weight: readOptionalProductMeasurement(body, "weight"),
    length: readOptionalProductMeasurement(body, "length"),
    width: readOptionalProductMeasurement(body, "width"),
    height: readOptionalProductMeasurement(body, "height")
  };
}

function methodNotAllowed(res) {
  res.set("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

function mapProductResponse(product) {
  function mapOptionalNumber(value) {
    return value === null || value === undefined ? null : Number(value);
  }

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    sell_price_cents: product.sell_price_cents,
    days_to_create: Number(product.days_to_create),
    safety_id: product.safety_id === null || product.safety_id === undefined ? null : String(product.safety_id),
    safety_name: product.safety_name || null,
    weight: mapOptionalNumber(product.weight),
    length: mapOptionalNumber(product.length),
    width: mapOptionalNumber(product.width),
    height: mapOptionalNumber(product.height),
    image_urls: Array.isArray(product.image_urls) ? product.image_urls : [],
    created_at: product.created_at,
    updated_at: product.updated_at
  };
}

function readOptionalProductId(req) {
  if (!req || !req.query || typeof req.query !== "object") {
    return null;
  }

  const raw =
    typeof req.query.productId === "string"
      ? req.query.productId
      : typeof req.query.id === "string"
        ? req.query.id
        : "";

  const normalized = raw.trim();
  return normalized || null;
}

function readRequiredProductId(req) {
  const productId = readOptionalProductId(req);
  if (!productId) {
    throw withStatusError("productId query parameter is required", 400);
  }

  return productId;
}

function createAdminProductsHandler({ getPool }) {
  return async function adminProductsHandler(req, res) {
    try {
      if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
        return methodNotAllowed(res);
      }

      const pool = getPool();

      if (req.method === "GET") {
        const productId = readOptionalProductId(req);
        const products = await listProducts(pool, { productId });
        return res.status(200).json({
          products: products.map(mapProductResponse)
        });
      }

      if (req.method === "DELETE") {
        const productId = readRequiredProductId(req);
        const deleted = await deleteProductById(pool, productId);

        if (!deleted) {
          return res.status(404).json({
            error: "Product not found"
          });
        }

        return res.status(204).send();
      }

      ensureJsonContentType(req);
      const body = parseJsonBody(req);
      const request = normalizeCreateProductRequest(body);
      const product = await upsertProduct(pool, request);
      return res
        .status(product.inserted ? 201 : 200)
        .json({ product: mapProductResponse(product) });
    } catch (error) {
      const invalidSafetyReference = error && error.code === "23503";
      const statusCode = invalidSafetyReference
        ? 400
        : Number.isInteger(error.statusCode)
          ? error.statusCode
          : 500;
      const message = invalidSafetyReference ? "Invalid safety_id" : error.message;
      console.error("adminProductsHandler error", {
        message,
        statusCode
      });

      return res.status(statusCode).json({
        error: statusCode === 500 ? "Internal server error" : message
      });
    }
  };
}

module.exports = {
  createAdminProductsHandler
};
