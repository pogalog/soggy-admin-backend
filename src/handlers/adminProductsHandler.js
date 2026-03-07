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
    inventoryQty: readNonNegativeInteger(body.inventory_qty, "inventory_qty")
  };
}

function methodNotAllowed(res) {
  res.set("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

function mapProductResponse(product) {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    sell_price_cents: product.sell_price_cents,
    inventory_qty: product.inventory_qty,
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
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      console.error("adminProductsHandler error", {
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
  createAdminProductsHandler
};
