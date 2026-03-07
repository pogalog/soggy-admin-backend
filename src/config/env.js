"use strict";

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function readInt(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readPositiveInt(value, fallback) {
  const parsed = readInt(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return fallback;
}

const env = {
  gcpProjectId: process.env.GCP_PROJECT_ID,
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASS,
  dbName: process.env.DB_NAME,
  dbHost: process.env.DB_HOST,
  dbPort: readInt(process.env.DB_PORT, 5432),
  dbSsl: readBoolean(process.env.DB_SSL, false),
  instanceConnectionName: process.env.INSTANCE_CONNECTION_NAME,
  dbSocketPath: process.env.DB_SOCKET_PATH || "/cloudsql",
  dbPoolMax: readPositiveInt(process.env.DB_POOL_MAX, 5),
  dbIdleTimeoutMs: readPositiveInt(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  dbConnectionTimeoutMs: readPositiveInt(
    process.env.DB_CONNECTION_TIMEOUT_MS,
    10000
  ),
  productsPublicBucket: process.env.PRODUCTS_PUBLIC_BUCKET || "soggy-products",
  productsPrivateBucket: process.env.PRODUCTS_PRIVATE_BUCKET || "soggy-privates",
  productsThumbnailBucket:
    process.env.PRODUCTS_THUMBNAIL_BUCKET || "soggy-thumbnails",
  productImageMaxUploadBytes: readPositiveInt(
    process.env.PRODUCT_IMAGE_MAX_UPLOAD_BYTES,
    15 * 1024 * 1024
  ),
  watermarkSvgPath:
    process.env.PRODUCT_WATERMARK_SVG_PATH ||
    path.resolve(process.cwd(), "watermark.svg")
};

module.exports = {
  env
};
