"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { productImageParams } = require("../config/productImageParams");
const {
  createProductImage,
  deleteProductImageById
} = require("../models/productImageModel");
const { parseMultipartForm, withStatusError } = require("../lib/multipart");
const { processProductImage } = require("../lib/imageProcessing");
const { uploadBuffer, toPublicUrl } = require("../lib/storageClient");

let watermarkSvgPromise;

function getWatermarkSvgBuffer() {
  if (!watermarkSvgPromise) {
    watermarkSvgPromise = fs.readFile(env.watermarkSvgPath);
  }

  return watermarkSvgPromise;
}

function methodNotAllowed(res) {
  res.set("Allow", "POST");
  return res.status(405).json({ error: "Method not allowed" });
}

function normalizePathSegment(input, fallback) {
  const normalized = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

function readSingleFieldValue(value) {
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return value;
}

function readFileExtension(fileName, fallback) {
  const ext = String(path.extname(fileName || "") || "")
    .replace(".", "")
    .toLowerCase();
  return ext || fallback;
}

function normalizeImageExtension(extension) {
  const normalized = String(extension || "").trim().toLowerCase();
  if (normalized === "jpeg") {
    return "jpg";
  }
  return normalized;
}

function chooseProcessedExtension(file) {
  const mimeType = String(file.mimeType || "").toLowerCase();
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  if (mimeType === "image/avif") {
    return "avif";
  }

  const fileExt = normalizeImageExtension(readFileExtension(file.fileName, ""));
  if (fileExt === "jpg" || fileExt === "png" || fileExt === "webp" || fileExt === "avif") {
    return fileExt;
  }

  return "png";
}

function sanitizeBaseFileName(fileName) {
  const ext = path.extname(fileName || "");
  const baseName = path.basename(fileName || "", ext);
  const normalized = String(baseName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "image";
}

function buildTimestampSuffix(date) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const millis = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}${millis}`;
}

function buildObjectPaths({ productId, sourceFileName, processedExt, originalExt }) {
  const date = new Date();
  const baseName = sanitizeBaseFileName(sourceFileName);
  const timestampSuffix = buildTimestampSuffix(date);
  const stem = `${baseName}-${timestampSuffix}`;
  const folder = `${productId}`;

  return {
    originalPath: `${folder}/${stem}.${originalExt}`,
    watermarkedPath: `${folder}/${stem}-watermarked.${processedExt}`,
    thumbnailPath: `${folder}/${stem}-thumbnail.${processedExt}`
  };
}

function validateImageFile(file) {
  if (!file.buffer || file.buffer.length === 0) {
    throw withStatusError("Uploaded file is empty", 400);
  }
}

function readOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function readOptionalSortOrder(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw withStatusError("sort_order must be a non-negative integer", 400);
  }

  return parsed;
}

function readImageMetadataFields(fields) {
  const alt = readOptionalString(readSingleFieldValue(fields.alt));
  const sortOrderRaw =
    readSingleFieldValue(fields.sort_order) ??
    readSingleFieldValue(fields.sortOrder);
  const sortOrder = readOptionalSortOrder(sortOrderRaw);

  return {
    alt,
    sortOrder
  };
}

function buildResponseBody({
  productId,
  original,
  watermarked,
  thumbnail,
  productImage,
  sourceWidth,
  sourceHeight,
  thumbnailWidth,
  thumbnailHeight
}) {
  return {
    productId,
    image: {
      sourceDimensions: {
        width: sourceWidth,
        height: sourceHeight
      },
      original: {
        bucket: original.bucket,
        objectPath: original.objectPath,
        contentType: original.contentType,
        bytes: original.bytes
      },
      watermarked: {
        bucket: watermarked.bucket,
        objectPath: watermarked.objectPath,
        contentType: watermarked.contentType,
        bytes: watermarked.bytes,
        publicUrl: watermarked.publicUrl
      },
      thumbnail: {
        bucket: thumbnail.bucket,
        objectPath: thumbnail.objectPath,
        contentType: thumbnail.contentType,
        bytes: thumbnail.bytes,
        width: thumbnailWidth,
        height: thumbnailHeight,
        publicUrl: thumbnail.publicUrl
      },
      product_image: productImage
    }
  };
}

function createAdminProductImageHandler({ getPool }) {
  return async function adminProductImageHandler(req, res) {
    let createdProductImageId = null;

    try {
      if (req.method !== "POST") {
        return methodNotAllowed(res);
      }

      const multipart = await parseMultipartForm(req, {
        maxFileSizeBytes: env.productImageMaxUploadBytes,
        maxFiles: 1
      });

      const file = multipart.files.find((entry) => entry.fieldName === "image");
      if (!file) {
        throw withStatusError(
          "Expected a multipart file field named `image`.",
          400
        );
      }

      validateImageFile(file);

      const productIdRaw = readSingleFieldValue(multipart.fields.productId);
      const productId = normalizePathSegment(productIdRaw, "");
      if (!productId) {
        throw withStatusError("productId is required", 400);
      }
      const imageMetadata = readImageMetadataFields(multipart.fields);
      const processedExt = chooseProcessedExtension(file);

      const objectPaths = buildObjectPaths({
        productId,
        sourceFileName: file.fileName,
        processedExt,
        originalExt: readFileExtension(file.fileName, processedExt)
      });

      const productImageRecord = await createProductImage(getPool(), {
        productId,
        path: objectPaths.watermarkedPath,
        alt: imageMetadata.alt,
        sortOrder: imageMetadata.sortOrder
      });
      if (!productImageRecord.inserted) {
        return res.status(409).json({
          error: "Duplicate product image path already exists",
          product_image: {
            id: productImageRecord.row.id,
            product_id: productImageRecord.row.product_id,
            path: productImageRecord.row.path,
            alt: productImageRecord.row.alt,
            sort_order: productImageRecord.row.sort_order
          }
        });
      }
      createdProductImageId = productImageRecord.row.id;

      const watermarkSvg = await getWatermarkSvgBuffer();
      let processed;
      try {
        processed = await processProductImage({
          imageBuffer: file.buffer,
          sourceMimeType: file.mimeType,
          preferredOutputExtension: processedExt,
          watermarkSvg,
          watermarkConfig: productImageParams.watermark,
          thumbnailConfig: productImageParams.thumbnail
        });
      } catch (error) {
        throw withStatusError(`Unable to process image: ${error.message}`, 400);
      }

      await Promise.all([
        uploadBuffer({
          bucketName: env.productsPrivateBucket,
          objectPath: objectPaths.originalPath,
          buffer: file.buffer,
          contentType: file.mimeType || "application/octet-stream"
        }),
        uploadBuffer({
          bucketName: env.productsPublicBucket,
          objectPath: objectPaths.watermarkedPath,
          buffer: processed.watermarkedBuffer,
          contentType: processed.contentType,
          cacheControl: productImageParams.cacheControl.watermarked
        }),
        uploadBuffer({
          bucketName: env.productsThumbnailBucket,
          objectPath: objectPaths.thumbnailPath,
          buffer: processed.thumbnailBuffer,
          contentType: processed.contentType,
          cacheControl: productImageParams.cacheControl.thumbnail
        })
      ]);

      const responseBody = buildResponseBody({
        productId,
        sourceWidth: processed.sourceWidth,
        sourceHeight: processed.sourceHeight,
        thumbnailWidth: processed.thumbnailWidth,
        thumbnailHeight: processed.thumbnailHeight,
        original: {
          bucket: env.productsPrivateBucket,
          objectPath: objectPaths.originalPath,
          contentType: file.mimeType || "application/octet-stream",
          bytes: file.buffer.length
        },
        watermarked: {
          bucket: env.productsPublicBucket,
          objectPath: objectPaths.watermarkedPath,
          contentType: processed.contentType,
          bytes: processed.watermarkedBuffer.length,
          publicUrl: toPublicUrl(env.productsPublicBucket, objectPaths.watermarkedPath)
        },
        thumbnail: {
          bucket: env.productsThumbnailBucket,
          objectPath: objectPaths.thumbnailPath,
          contentType: processed.contentType,
          bytes: processed.thumbnailBuffer.length,
          publicUrl: toPublicUrl(
            env.productsThumbnailBucket,
            objectPaths.thumbnailPath
          )
        },
        productImage: {
          id: productImageRecord.row.id,
          product_id: productImageRecord.row.product_id,
          path: productImageRecord.row.path,
          alt: productImageRecord.row.alt,
          sort_order: productImageRecord.row.sort_order,
          inserted: productImageRecord.inserted
        }
      });

      return res.status(201).json(responseBody);
    } catch (error) {
      if (error && error.code === "23503") {
        return res.status(400).json({
          error: "productId does not exist in products table"
        });
      }

      if (createdProductImageId !== null) {
        try {
          await deleteProductImageById(getPool(), createdProductImageId);
        } catch (cleanupError) {
          console.error("Failed to rollback product_images row after upload failure", {
            productImageId: createdProductImageId,
            message: cleanupError.message
          });
        }
      }

      if (error && error.code === "23505") {
        if (error.constraint === "product_images_pkey") {
          return res.status(500).json({
            error:
              "Database primary key sequence is out of sync for product_images. Retry the request."
          });
        }

        return res.status(409).json({
          error: "Duplicate database record conflict"
        });
      }

      if (error && error.code === "23514") {
        return res.status(400).json({
          error: "Database check constraint violation"
        });
      }

      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;

      console.error("adminProductImageHandler error", {
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
  createAdminProductImageHandler
};
