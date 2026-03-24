"use strict";

const { upsertMarket } = require("../models/marketModel");

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

function readBodyField(body, snakeCaseName, camelCaseName) {
  if (Object.prototype.hasOwnProperty.call(body, snakeCaseName)) {
    return body[snakeCaseName];
  }

  if (camelCaseName && Object.prototype.hasOwnProperty.call(body, camelCaseName)) {
    return body[camelCaseName];
  }

  return undefined;
}

function readRequiredString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw withStatusError(`${fieldName} is required`, 400);
  }

  return normalized;
}

function readOptionalNullableString(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw withStatusError(`${fieldName} must be a string or null`, 400);
  }

  const normalized = value.trim();
  return normalized || null;
}

function isIsoTimestampWithTimezone(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      normalized
    )
  ) {
    return false;
  }

  return !Number.isNaN(new Date(normalized).getTime());
}

function readRequiredTimestamp(value, fieldName) {
  if (!isIsoTimestampWithTimezone(value)) {
    throw withStatusError(
      `${fieldName} must be a valid ISO 8601 timestamp with a timezone offset`,
      400
    );
  }

  return new Date(value.trim()).toISOString();
}

function readOptionalTimestamp(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (!isIsoTimestampWithTimezone(value)) {
    throw withStatusError(
      `${fieldName} must be a valid ISO 8601 timestamp with a timezone offset or null`,
      400
    );
  }

  return new Date(value.trim()).toISOString();
}

function normalizeUpsertMarketRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw withStatusError("Request body must be a JSON object", 400);
  }

  const request = {
    title: readRequiredString(readBodyField(body, "title"), "title"),
    streetAddress: readRequiredString(
      readBodyField(body, "street_address", "streetAddress"),
      "street_address"
    ),
    city: readRequiredString(readBodyField(body, "city"), "city"),
    state: readRequiredString(readBodyField(body, "state"), "state"),
    startTime: readRequiredTimestamp(
      readBodyField(body, "start_time", "startTime"),
      "start_time"
    ),
    endTime: readOptionalTimestamp(
      readBodyField(body, "end_time", "endTime"),
      "end_time"
    ),
    description: readOptionalNullableString(
      readBodyField(body, "description"),
      "description"
    ),
    link: readOptionalNullableString(readBodyField(body, "link"), "link")
  };

  if (
    request.endTime &&
    new Date(request.endTime).getTime() < new Date(request.startTime).getTime()
  ) {
    throw withStatusError("end_time must be greater than or equal to start_time", 400);
  }

  return request;
}

function methodNotAllowed(res) {
  res.set("Allow", "POST");
  return res.status(405).json({ error: "Method not allowed" });
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function mapMarketResponse(market) {
  return {
    street_address: market.street_address,
    city: market.city,
    state: market.state,
    start_time: toIsoString(market.start_time),
    end_time: market.end_time ? toIsoString(market.end_time) : null,
    title: market.title,
    description: market.description,
    link: market.link
  };
}

function createAdminMarketsHandler({ getPool }) {
  return async function adminMarketsHandler(req, res) {
    try {
      if (req.method !== "POST") {
        return methodNotAllowed(res);
      }

      ensureJsonContentType(req);
      const body = parseJsonBody(req);
      const request = normalizeUpsertMarketRequest(body);
      const pool = getPool();
      const result = await upsertMarket(pool, request);

      return res.status(result.action === "created" ? 201 : 200).json({
        action: result.action,
        matched_on: result.matchedOn,
        market: mapMarketResponse(result.market)
      });
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      console.error("adminMarketsHandler error", {
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
  createAdminMarketsHandler
};
