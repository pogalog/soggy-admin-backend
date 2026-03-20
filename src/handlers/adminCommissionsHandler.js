"use strict";

const {
  deleteCommissionById,
  listCommissions,
  updateCommissionById
} = require("../models/commissionModel");

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

function readNonEmptyString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw withStatusError(`${fieldName} must be a non-empty string`, 400);
  }
  return normalized;
}

function readNullableNonNegativeInteger(value, fieldName) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw withStatusError(`${fieldName} must be a non-negative integer or null`, 400);
  }

  return parsed;
}

function readOptionalBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw withStatusError(`${fieldName} must be a boolean`, 400);
  }

  return value;
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

function readNullableDateOnly(value, fieldName) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !isValidDateOnly(value)) {
    throw withStatusError(`${fieldName} must be a valid YYYY-MM-DD date or null`, 400);
  }

  return value;
}

function readOptionalFilterString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeListCommissionFilters(query) {
  const source = query && typeof query === "object" ? query : {};
  const allowedKeys = new Set([
    "id",
    "submission_key",
    "item_name",
    "yarn_type",
    "yarn_color",
    "attachment_material_type",
    "status"
  ]);

  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key)) {
      throw withStatusError(`Unsupported query parameter: ${key}`, 400);
    }
  }

  return {
    id: readOptionalFilterString(source.id),
    submissionKey: readOptionalFilterString(source.submission_key),
    itemName: readOptionalFilterString(source.item_name),
    yarnType: readOptionalFilterString(source.yarn_type),
    yarnColor: readOptionalFilterString(source.yarn_color),
    attachmentMaterialType: readOptionalFilterString(source.attachment_material_type),
    status: readOptionalFilterString(source.status)
  };
}

function readRequiredCommissionId(req) {
  if (!req || !req.query || typeof req.query !== "object") {
    throw withStatusError("commissionId query parameter is required", 400);
  }

  const raw =
    typeof req.query.commissionId === "string"
      ? req.query.commissionId
      : typeof req.query.id === "string"
        ? req.query.id
        : "";

  const commissionId = raw.trim();
  if (!commissionId) {
    throw withStatusError("commissionId query parameter is required", 400);
  }

  return commissionId;
}

function normalizeUpdateCommissionRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw withStatusError("Request body must be a JSON object", 400);
  }

  const hasTimeCost = Object.prototype.hasOwnProperty.call(body, "time_cost");
  const hasShipDate = Object.prototype.hasOwnProperty.call(body, "ship_date");
  const hasTotalCost = Object.prototype.hasOwnProperty.call(body, "total_cost");
  const hasCommitmentDepositAmount = Object.prototype.hasOwnProperty.call(
    body,
    "commitment_deposit_amount"
  );
  const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
  const hasRequiresCommit = Object.prototype.hasOwnProperty.call(
    body,
    "requires_commit"
  );

  if (
    !hasTimeCost &&
    !hasShipDate &&
    !hasTotalCost &&
    !hasCommitmentDepositAmount &&
    !hasStatus &&
    !hasRequiresCommit
  ) {
    throw withStatusError(
      "At least one of time_cost, ship_date, total_cost, commitment_deposit_amount, status, or requires_commit is required",
      400
    );
  }

  return {
    id: readRequiredString(body.id, "id"),
    hasTimeCost,
    hasShipDate,
    hasTotalCost,
    hasCommitmentDepositAmount,
    hasStatus,
    hasRequiresCommit,
    timeCost: hasTimeCost
      ? readNullableNonNegativeInteger(body.time_cost, "time_cost")
      : undefined,
    shipDate: hasShipDate
      ? readNullableDateOnly(body.ship_date, "ship_date")
      : undefined,
    totalCost: hasTotalCost
      ? readNullableNonNegativeInteger(body.total_cost, "total_cost")
      : undefined,
    commitmentDepositAmount: hasCommitmentDepositAmount
      ? readNullableNonNegativeInteger(
          body.commitment_deposit_amount,
          "commitment_deposit_amount"
        )
      : undefined,
    status: hasStatus ? readNonEmptyString(body.status, "status") : undefined,
    requiresCommit: hasRequiresCommit
      ? readOptionalBoolean(body.requires_commit, "requires_commit")
      : undefined
  };
}

function methodNotAllowed(res) {
  res.set("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function toDateOnlyString(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function mapCommissionResponse(commission) {
  return {
    id: commission.id,
    submission_key: commission.submission_key,
    item_name: commission.item_name,
    item_description: commission.item_description,
    yarn_type: commission.yarn_type,
    yarn_color: commission.yarn_color,
    attachment_material_type: commission.attachment_material_type,
    storage_bucket: commission.storage_bucket,
    upload_directory: commission.upload_directory,
    storage_images: Array.isArray(commission.storage_images)
      ? commission.storage_images
      : [],
    meta_path: commission.meta_path,
    signed_url_expires_at: toIsoString(commission.signed_url_expires_at),
    prepared_at: toIsoString(commission.prepared_at),
    status: commission.status,
    commitment_deposit_amount: commission.commitment_deposit_amount,
    time_cost: commission.time_cost,
    ship_date: toDateOnlyString(commission.ship_date),
    total_cost: commission.total_cost,
    requires_commit: commission.requires_commit,
    created_at: toIsoString(commission.created_at),
    updated_at: toIsoString(commission.updated_at)
  };
}

function createAdminCommissionsHandler({ getPool }) {
  return async function adminCommissionsHandler(req, res) {
    try {
      if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
        return methodNotAllowed(res);
      }

      const pool = getPool();

      if (req.method === "GET") {
        const filters = normalizeListCommissionFilters(req.query);
        const commissions = await listCommissions(pool, filters);

        if (commissions.length === 0) {
          return res.status(204).send();
        }

        return res.status(200).json({
          commissions: commissions.map(mapCommissionResponse)
        });
      }

      if (req.method === "DELETE") {
        const commissionId = readRequiredCommissionId(req);
        const deleted = await deleteCommissionById(pool, commissionId);

        if (!deleted) {
          return res.status(404).json({
            error: "Commission not found"
          });
        }

        return res.status(204).send();
      }

      ensureJsonContentType(req);
      const body = parseJsonBody(req);
      const request = normalizeUpdateCommissionRequest(body);
      const commission = await updateCommissionById(pool, request);

      if (!commission) {
        return res.status(404).json({
          error: "Commission not found"
        });
      }

      return res.status(200).json({
        commission: mapCommissionResponse(commission)
      });
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      console.error("adminCommissionsHandler error", {
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
  createAdminCommissionsHandler
};
