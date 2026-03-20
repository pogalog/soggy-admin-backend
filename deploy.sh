#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-soggy-stitches}"
REGION="${REGION:-us-east1}"
SERVICE_NAME="${SERVICE_NAME:-soggy-admin-backend}"
SECRET_PROJECT_ID="${SECRET_PROJECT_ID:-$PROJECT_ID}"

PRODUCTS_PUBLIC_BUCKET="${PRODUCTS_PUBLIC_BUCKET:-soggy-products}"
PRODUCTS_PRIVATE_BUCKET="${PRODUCTS_PRIVATE_BUCKET:-soggy-privates}"
PRODUCTS_THUMBNAIL_BUCKET="${PRODUCTS_THUMBNAIL_BUCKET:-soggy-thumbnails}"
PRODUCT_IMAGE_MAX_UPLOAD_BYTES="${PRODUCT_IMAGE_MAX_UPLOAD_BYTES:-15728640}"
PRODUCT_WATERMARK_SVG_PATH="${PRODUCT_WATERMARK_SVG_PATH:-}"
GCP_PROJECT_ID="${GCP_PROJECT_ID:-$PROJECT_ID}"
DB_HOST="${DB_HOST:-}"
DB_PORT="${DB_PORT:-5432}"
DB_SSL="${DB_SSL:-false}"
DB_SOCKET_PATH="${DB_SOCKET_PATH:-/cloudsql}"
DB_POOL_MAX="${DB_POOL_MAX:-5}"
DB_IDLE_TIMEOUT_MS="${DB_IDLE_TIMEOUT_MS:-30000}"
DB_CONNECTION_TIMEOUT_MS="${DB_CONNECTION_TIMEOUT_MS:-10000}"
DB_USER="${DB_USER:-}"
DB_PASS="${DB_PASS:-}"
DB_NAME="${DB_NAME:-}"
INSTANCE_CONNECTION_NAME="${INSTANCE_CONNECTION_NAME:-}"
DB_USER_SECRET_NAME="${DB_USER_SECRET_NAME:-DB_USER}"
DB_PASS_SECRET_NAME="${DB_PASS_SECRET_NAME:-DB_PASS}"
DB_NAME_SECRET_NAME="${DB_NAME_SECRET_NAME:-DB_NAME}"
INSTANCE_CONNECTION_NAME_SECRET_NAME="${INSTANCE_CONNECTION_NAME_SECRET_NAME:-INSTANCE_CONNECTION_NAME}"
DB_USER_SECRET_VERSION="${DB_USER_SECRET_VERSION:-latest}"
DB_PASS_SECRET_VERSION="${DB_PASS_SECRET_VERSION:-latest}"
DB_NAME_SECRET_VERSION="${DB_NAME_SECRET_VERSION:-latest}"
INSTANCE_CONNECTION_NAME_SECRET_VERSION="${INSTANCE_CONNECTION_NAME_SECRET_VERSION:-latest}"

ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-false}"
ENABLE_REQUIRED_APIS="${ENABLE_REQUIRED_APIS:-true}"

# Optional:
# - Runtime identity for the Cloud Run service
# - Principal (usually service account email) to grant roles/run.invoker
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-}"
INVOKER_SERVICE_ACCOUNT="${INVOKER_SERVICE_ACCOUNT:-}"

read_secret_value() {
  local secret_name="${1}"
  local secret_version="${2}"

  gcloud secrets versions access "${secret_version}" \
    --secret="${secret_name}" \
    --project="${SECRET_PROJECT_ID}"
}

add_secret_mapping() {
  local env_name="${1}"
  local secret_name="${2}"
  local secret_version="${3}"

  SECRET_VARS+=("${env_name}=${secret_name}:${secret_version}")
}

SECRET_VARS=()

if [[ -n "${DB_USER}" ]]; then
  echo "Ignoring literal DB_USER because this deploy reads DB credentials from Secret Manager." >&2
fi
add_secret_mapping "DB_USER" "${DB_USER_SECRET_NAME}" "${DB_USER_SECRET_VERSION}"

if [[ -n "${DB_PASS}" ]]; then
  echo "Ignoring literal DB_PASS because this deploy reads DB credentials from Secret Manager." >&2
fi
add_secret_mapping "DB_PASS" "${DB_PASS_SECRET_NAME}" "${DB_PASS_SECRET_VERSION}"

if [[ -n "${DB_NAME}" ]]; then
  echo "Ignoring literal DB_NAME because this deploy reads DB credentials from Secret Manager." >&2
fi
add_secret_mapping "DB_NAME" "${DB_NAME_SECRET_NAME}" "${DB_NAME_SECRET_VERSION}"

if [[ -z "${INSTANCE_CONNECTION_NAME}" && -z "${DB_HOST}" ]]; then
  INSTANCE_CONNECTION_NAME="$(
    read_secret_value "${INSTANCE_CONNECTION_NAME_SECRET_NAME}" "${INSTANCE_CONNECTION_NAME_SECRET_VERSION}"
  )"
fi

if [[ -z "${INSTANCE_CONNECTION_NAME}" && -z "${DB_HOST}" ]]; then
  echo "Set either INSTANCE_CONNECTION_NAME (recommended) or DB_HOST." >&2
  exit 1
fi

if [[ "${ENABLE_REQUIRED_APIS}" == "true" ]]; then
  gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    --project="${PROJECT_ID}"
fi

ENV_VARS=(
  "GCP_PROJECT_ID=${GCP_PROJECT_ID}"
  "PRODUCTS_PUBLIC_BUCKET=${PRODUCTS_PUBLIC_BUCKET}"
  "PRODUCTS_PRIVATE_BUCKET=${PRODUCTS_PRIVATE_BUCKET}"
  "PRODUCTS_THUMBNAIL_BUCKET=${PRODUCTS_THUMBNAIL_BUCKET}"
  "PRODUCT_IMAGE_MAX_UPLOAD_BYTES=${PRODUCT_IMAGE_MAX_UPLOAD_BYTES}"
  "DB_PORT=${DB_PORT}"
  "DB_SSL=${DB_SSL}"
  "DB_SOCKET_PATH=${DB_SOCKET_PATH}"
  "DB_POOL_MAX=${DB_POOL_MAX}"
  "DB_IDLE_TIMEOUT_MS=${DB_IDLE_TIMEOUT_MS}"
  "DB_CONNECTION_TIMEOUT_MS=${DB_CONNECTION_TIMEOUT_MS}"
)

if [[ -n "${PRODUCT_WATERMARK_SVG_PATH}" ]]; then
  ENV_VARS+=("PRODUCT_WATERMARK_SVG_PATH=${PRODUCT_WATERMARK_SVG_PATH}")
fi

if [[ -n "${INSTANCE_CONNECTION_NAME}" ]]; then
  ENV_VARS+=("INSTANCE_CONNECTION_NAME=${INSTANCE_CONNECTION_NAME}")
else
  ENV_VARS+=("DB_HOST=${DB_HOST}")
fi

if [[ "${ALLOW_UNAUTHENTICATED}" == "true" ]]; then
  AUTH_FLAG="--allow-unauthenticated"
else
  AUTH_FLAG="--no-allow-unauthenticated"
fi

DEPLOY_ARGS=(
  run
  deploy
  "${SERVICE_NAME}"
  "--project=${PROJECT_ID}"
  "--region=${REGION}"
  "--source=."
  "--set-env-vars=$(IFS=,; echo "${ENV_VARS[*]}")"
  "${AUTH_FLAG}"
)

if [[ -n "${RUNTIME_SERVICE_ACCOUNT}" ]]; then
  DEPLOY_ARGS+=("--service-account=${RUNTIME_SERVICE_ACCOUNT}")
fi

if [[ -n "${INSTANCE_CONNECTION_NAME}" ]]; then
  DEPLOY_ARGS+=("--add-cloudsql-instances=${INSTANCE_CONNECTION_NAME}")
fi

if [[ ${#SECRET_VARS[@]} -gt 0 ]]; then
  DEPLOY_ARGS+=("--update-secrets=$(IFS=,; echo "${SECRET_VARS[*]}")")
fi

gcloud "${DEPLOY_ARGS[@]}"

if [[ -n "${INVOKER_SERVICE_ACCOUNT}" ]]; then
  gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --member="serviceAccount:${INVOKER_SERVICE_ACCOUNT}" \
    --role="roles/run.invoker"
fi

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

echo "Deployed ${SERVICE_NAME} to ${SERVICE_URL}"
