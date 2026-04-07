"use strict";

const {
  SAFETY_DISPLAY_TYPES,
  deleteSafetyMessageById,
  listSafetyMessages,
  upsertSafetyMessage
} = require("../models/safetyModel");

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

function readOptionalPositiveInteger(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw withStatusError(`${fieldName} must be a positive integer`, 400);
  }

  return parsed;
}

function readDisplayType(value) {
  const normalized = readRequiredString(value, "display_type");
  if (!SAFETY_DISPLAY_TYPES.includes(normalized)) {
    throw withStatusError(`Unsupported display_type: ${normalized}`, 400);
  }

  return normalized;
}

function readUpdatedBy(value) {
  const normalized = readRequiredString(value, "updated_by").toLowerCase();
  return normalized.split("@")[0] || normalized;
}

function readOptionalSafetyId(req) {
  if (!req || !req.query || typeof req.query !== "object") {
    return null;
  }

  const raw = typeof req.query.id === "string" ? req.query.id : "";
  const normalized = raw.trim();
  return normalized || null;
}

function normalizeSafetyPostRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw withStatusError("Request body must be a JSON object", 400);
  }

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "save";

  if (action === "delete") {
    return {
      action,
      id: readOptionalPositiveInteger(body.id, "id")
    };
  }

  if (action !== "save") {
    throw withStatusError(`Unsupported action: ${action}`, 400);
  }

  return {
    action,
    id: readOptionalPositiveInteger(body.id, "id"),
    name: readRequiredString(body.name, "name"),
    message: readRequiredString(body.message, "message"),
    displayType: readDisplayType(body.display_type),
    updatedBy: readUpdatedBy(body.updated_by)
  };
}

function methodNotAllowed(res) {
  res.set("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

function mapSafetyResponse(safetyMessage) {
  return {
    id: String(safetyMessage.id),
    name: safetyMessage.name,
    message: safetyMessage.message,
    display_type: safetyMessage.display_type,
    updated_by: safetyMessage.updated_by,
    created_at: safetyMessage.created_at,
    updated_at: safetyMessage.updated_at
  };
}

function createAdminProductSafetyHandler({ getPool }) {
  return async function adminProductSafetyHandler(req, res) {
    try {
      if (req.method !== "GET" && req.method !== "POST") {
        return methodNotAllowed(res);
      }

      const pool = getPool();

      if (req.method === "GET") {
        const safetyId = readOptionalSafetyId(req);
        const safetyMessages = await listSafetyMessages(pool, { safetyId });
        return res.status(200).json({
          safety: safetyMessages.map(mapSafetyResponse)
        });
      }

      ensureJsonContentType(req);
      const body = parseJsonBody(req);
      const request = normalizeSafetyPostRequest(body);

      if (request.action === "delete") {
        if (!request.id) {
          throw withStatusError("id is required", 400);
        }

        const deleted = await deleteSafetyMessageById(pool, request.id);
        if (!deleted) {
          return res.status(404).json({ error: "Safety message not found" });
        }

        return res.status(200).json({ deleted: true });
      }

      const safetyMessage = await upsertSafetyMessage(pool, request);
      if (!safetyMessage) {
        return res.status(404).json({ error: "Safety message not found" });
      }

      return res.status(safetyMessage.inserted ? 201 : 200).json({
        safety_message: mapSafetyResponse(safetyMessage)
      });
    } catch (error) {
      const uniqueViolation = error && error.code === "23505";
      const statusCode = uniqueViolation
        ? 409
        : Number.isInteger(error.statusCode)
          ? error.statusCode
          : 500;
      const message = uniqueViolation ? "A safety message with that name already exists" : error.message;

      console.error("adminProductSafetyHandler error", {
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
  createAdminProductSafetyHandler
};
