"use strict";

const Busboy = require("busboy");

function withStatusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readMultipartBody(req, busboy) {
  if (Buffer.isBuffer(req.rawBody)) {
    busboy.end(req.rawBody);
    return;
  }

  if (Buffer.isBuffer(req.body)) {
    busboy.end(req.body);
    return;
  }

  if (typeof req.pipe === "function") {
    req.pipe(busboy);
    return;
  }

  throw withStatusError("Unable to read multipart request body", 400);
}

function parseMultipartForm(req, options) {
  const {
    maxFileSizeBytes = 15 * 1024 * 1024,
    maxFiles = 1,
    maxFields = 20
  } = options || {};

  const contentType = (req.headers && req.headers["content-type"]) || "";
  if (!String(contentType).toLowerCase().includes("multipart/form-data")) {
    throw withStatusError("Content-Type must be multipart/form-data", 415);
  }

  return new Promise((resolve, reject) => {
    let fileCount = 0;
    let fileLimitReached = false;
    const fields = {};
    const files = [];

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: maxFiles,
        fileSize: maxFileSizeBytes,
        fields: maxFields
      }
    });

    busboy.on("field", (fieldName, value) => {
      if (Object.prototype.hasOwnProperty.call(fields, fieldName)) {
        const currentValue = fields[fieldName];
        if (Array.isArray(currentValue)) {
          currentValue.push(value);
          return;
        }
        fields[fieldName] = [currentValue, value];
        return;
      }
      fields[fieldName] = value;
    });

    busboy.on("file", (fieldName, stream, info) => {
      fileCount += 1;
      const chunks = [];
      let size = 0;
      let truncated = false;

      stream.on("limit", () => {
        truncated = true;
      });

      stream.on("data", (chunk) => {
        size += chunk.length;
        chunks.push(chunk);
      });

      stream.on("end", () => {
        if (truncated) {
          fileLimitReached = true;
          return;
        }

        files.push({
          fieldName,
          fileName: info.filename,
          mimeType: info.mimeType,
          encoding: info.encoding,
          size,
          buffer: Buffer.concat(chunks)
        });
      });
    });

    busboy.on("filesLimit", () => {
      fileLimitReached = true;
    });

    busboy.on("error", (error) => {
      reject(withStatusError(`Malformed multipart payload: ${error.message}`, 400));
    });

    busboy.on("finish", () => {
      if (fileLimitReached) {
        reject(
          withStatusError(
            `Upload exceeds limits (max files: ${maxFiles}, max bytes per file: ${maxFileSizeBytes})`,
            413
          )
        );
        return;
      }

      if (fileCount === 0 || files.length === 0) {
        const imageFieldValue = fields.image;
        const hasTextImageValue = Array.isArray(imageFieldValue)
          ? imageFieldValue.some((value) => typeof value === "string" && value.trim())
          : typeof imageFieldValue === "string" && imageFieldValue.trim();

        if (hasTextImageValue) {
          reject(
            withStatusError(
              "No file was uploaded. The multipart field `image` must be a file part, not a text path.",
              400
            )
          );
          return;
        }

        reject(withStatusError("No file was uploaded", 400));
        return;
      }

      resolve({ fields, files });
    });

    try {
      readMultipartBody(req, busboy);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  parseMultipartForm,
  withStatusError
};
