"use strict";

const productImageParams = Object.freeze({
  thumbnail: Object.freeze({
    width: 640,
    height: 640,
    fit: "inside"
  }),
  watermark: Object.freeze({
    relativeWidth: 0.96,
    minWidth: 320,
    maxHeightRatio: 0.95,
    marginPx: 12
  }),
  cacheControl: Object.freeze({
    watermarked: "public, max-age=31536000, immutable",
    thumbnail: "public, max-age=31536000, immutable"
  })
});

module.exports = {
  productImageParams
};
