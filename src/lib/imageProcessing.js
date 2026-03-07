"use strict";

const sharp = require("sharp");

function pickOutputFormat(sourceFormat, sourceMimeType, preferredExtension) {
  const preferred = String(preferredExtension || "").toLowerCase();
  if (preferred === "jpg" || preferred === "jpeg") {
    return { format: "jpeg", extension: "jpg", contentType: "image/jpeg" };
  }
  if (preferred === "png") {
    return { format: "png", extension: "png", contentType: "image/png" };
  }
  if (preferred === "webp") {
    return { format: "webp", extension: "webp", contentType: "image/webp" };
  }
  if (preferred === "avif") {
    return { format: "avif", extension: "avif", contentType: "image/avif" };
  }

  const fromMetadata = String(sourceFormat || "").toLowerCase();
  const fromMime = String(sourceMimeType || "").toLowerCase();

  if (fromMetadata === "jpeg" || fromMetadata === "jpg" || fromMime === "image/jpeg") {
    return { format: "jpeg", extension: "jpg", contentType: "image/jpeg" };
  }
  if (fromMetadata === "png" || fromMime === "image/png") {
    return { format: "png", extension: "png", contentType: "image/png" };
  }
  if (fromMetadata === "webp" || fromMime === "image/webp") {
    return { format: "webp", extension: "webp", contentType: "image/webp" };
  }
  if (fromMetadata === "avif" || fromMime === "image/avif") {
    return { format: "avif", extension: "avif", contentType: "image/avif" };
  }

  return { format: "png", extension: "png", contentType: "image/png" };
}

function encodeWithFormat(pipeline, format) {
  if (format === "jpeg") {
    return pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  }
  if (format === "png") {
    return pipeline.png({ compressionLevel: 9 }).toBuffer();
  }
  if (format === "webp") {
    return pipeline.webp({ quality: 88 }).toBuffer();
  }
  if (format === "avif") {
    return pipeline.avif({ quality: 58 }).toBuffer();
  }

  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

async function normalizeImage(imageBuffer) {
  const normalizedBuffer = await sharp(imageBuffer).rotate().toBuffer();
  const metadata = await sharp(normalizedBuffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Uploaded image dimensions could not be determined");
  }

  return { normalizedBuffer, metadata };
}

async function buildWatermarkedImage(normalizedBuffer, dimensions, watermarkSvg, watermarkConfig, outputFormat) {
  const maxHeightRatio = watermarkConfig.maxHeightRatio || 0.8;
  const maxAllowedWidth = Math.max(
    32,
    dimensions.width - watermarkConfig.marginPx * 2
  );
  const maxAllowedHeight = Math.max(
    32,
    Math.round(dimensions.height * maxHeightRatio)
  );
  const targetWatermarkWidth = Math.min(
    maxAllowedWidth,
    Math.max(
      Math.floor(maxAllowedWidth * 0.98),
      watermarkConfig.minWidth,
      Math.round(dimensions.width * watermarkConfig.relativeWidth)
    )
  );

  const baseRaster = await sharp(watermarkSvg).png().toBuffer();
  const trimmedRaster = await sharp(baseRaster).trim().png().toBuffer();

  const watermarkRaster = await sharp(trimmedRaster)
    .resize({
      width: targetWatermarkWidth,
      height: maxAllowedHeight,
      fit: "inside"
    })
    .png()
    .toBuffer();

  const watermarkMetadata = await sharp(watermarkRaster).metadata();
  const overlayWidth = watermarkMetadata.width || targetWatermarkWidth;
  const overlayHeight = watermarkMetadata.height || targetWatermarkWidth;
  const top = Math.max(0, Math.floor((dimensions.height - overlayHeight) / 2));
  const left = Math.max(0, Math.floor((dimensions.width - overlayWidth) / 2));

  const composed = sharp(normalizedBuffer).composite([
    {
      input: watermarkRaster,
      top,
      left
    }
  ]);

  const watermarkedBuffer = await encodeWithFormat(composed, outputFormat);
  return watermarkedBuffer;
}

async function buildThumbnail(sourceBuffer, thumbnailConfig, outputFormat) {
  const resized = sharp(sourceBuffer).resize({
    width: thumbnailConfig.width,
    height: thumbnailConfig.height,
    fit: thumbnailConfig.fit,
    withoutEnlargement: true
  });

  const thumbnailBuffer = await encodeWithFormat(resized, outputFormat);
  const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();

  return {
    thumbnailBuffer,
    width: thumbnailMetadata.width || null,
    height: thumbnailMetadata.height || null
  };
}

async function processProductImage({
  imageBuffer,
  sourceMimeType,
  preferredOutputExtension,
  watermarkSvg,
  watermarkConfig,
  thumbnailConfig
}) {
  const { normalizedBuffer, metadata } = await normalizeImage(imageBuffer);
  const output = pickOutputFormat(
    metadata.format,
    sourceMimeType,
    preferredOutputExtension
  );

  const watermarkedBuffer = await buildWatermarkedImage(
    normalizedBuffer,
    {
      width: metadata.width,
      height: metadata.height
    },
    watermarkSvg,
    watermarkConfig,
    output.format
  );

  const thumbnail = await buildThumbnail(
    normalizedBuffer,
    thumbnailConfig,
    output.format
  );

  return {
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    watermarkedBuffer,
    thumbnailBuffer: thumbnail.thumbnailBuffer,
    thumbnailWidth: thumbnail.width,
    thumbnailHeight: thumbnail.height,
    contentType: output.contentType,
    extension: output.extension
  };
}

module.exports = {
  processProductImage
};
