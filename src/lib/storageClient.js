"use strict";

const { Storage } = require("@google-cloud/storage");
const { env } = require("../config/env");

let storageClient;

function getStorageClient() {
  if (!storageClient) {
    storageClient = env.gcpProjectId
      ? new Storage({ projectId: env.gcpProjectId })
      : new Storage();
  }

  return storageClient;
}

async function uploadBuffer({
  bucketName,
  objectPath,
  buffer,
  contentType,
  cacheControl
}) {
  const bucket = getStorageClient().bucket(bucketName);
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: cacheControl ? { cacheControl } : undefined
  });
}

function toPublicUrl(bucketName, objectPath) {
  const escapedPath = String(objectPath)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://storage.googleapis.com/${bucketName}/${escapedPath}`;
}

module.exports = {
  uploadBuffer,
  toPublicUrl
};
