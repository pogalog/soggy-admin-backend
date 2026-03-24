# Soggy Admin Backend

Node.js HTTP service for admin workflows on Cloud Run.

## Routes

- `GET /healthz`
- `GET /admin/commissions`
- `POST /admin/commissions`
- `DELETE /admin/commissions`
- `GET /admin/products`
- `POST /admin/products`
- `DELETE /admin/products`
- `POST /admin/markets`
- `POST /admin/products/image`

## `GET /healthz`

Cheap liveness endpoint for warm-up and monitoring.

Responses:

- `200` with a small JSON payload when the service is up

Example response:

```json
{
  "ok": true,
  "service": "soggy-admin-backend"
}
```

## `GET /admin/commissions`

Returns commission rows from Postgres. If no query params are provided, all rows are returned.

Optional query params:

- `id`
- `submission_key`
- `item_name`
- `yarn_type`
- `yarn_color`
- `attachment_material_type`
- `status`

Filter behavior:

- Each provided query param is applied as an additional filter
- `status=open` returns all rows where `status <> 'closed'`
- `status=closed` matches only rows where `status = 'closed'`
- Any other `status` value is matched exactly

Responses:

- `200` with matching rows
- `204` when no rows match after filtering

Example:

```bash
curl "http://localhost:8080/admin/commissions?status=open&yarn_type=chenille"
```

Example response:

```json
{
  "commissions": [
    {
      "id": "cm_01jnk4rjv4w8d7j8f7j8t9v2g1",
      "submission_key": "d5d30497-1d65-4f93-b7af-7674d9ef7cb7",
      "item_name": "Pastel dragon plush",
      "item_description": "A medium-sized crochet dragon in mint green with cream accents.",
      "yarn_type": "chenille",
      "yarn_color": "#7ed6c2",
      "attachment_material_type": "yarn-only",
      "storage_bucket": "soggy-commissions",
      "upload_directory": "2026/03/02/pastel-dragon-plush",
      "storage_images": [],
      "meta_path": "2026/03/02/pastel-dragon-plush/meta.json",
      "signed_url_expires_at": "2026-03-02T18:25:00.000Z",
      "prepared_at": "2026-03-02T18:15:00.000Z",
      "status": "received",
      "time_cost": 14,
      "ship_date": "2026-03-21",
      "total_cost": 8500,
      "requires_commit": true,
      "created_at": "2026-03-05T15:01:02.123Z",
      "updated_at": "2026-03-09T18:44:55.000Z"
    }
  ]
}
```

## `POST /admin/commissions`

Updates an existing commission row by id. This endpoint never inserts.

Request body (`application/json`):

```json
{
  "id": "cm_01jnk4rjv4w8d7j8f7j8t9v2g1",
  "time_cost": 14,
  "ship_date": "2026-03-21",
  "total_cost": 8500,
  "status": "quoted",
  "requires_commit": true
}
```

## `DELETE /admin/commissions`

Deletes a commission row by id.

Required query params:

- `commissionId`: the commission id to delete

Responses:

- `204` when the commission is deleted
- `404` when no matching commission exists
- `400` when `commissionId` is missing

Example:

```bash
curl -X DELETE "http://localhost:8080/admin/commissions?commissionId=cm_01jnk4rjv4w8d7j8f7j8t9v2g1"
```

Notes:

- `id` is required
- At least one of `time_cost`, `ship_date`, `total_cost`, `status`, or `requires_commit` must be present
- `time_cost` and `total_cost` accept non-negative integers or `null`
- `ship_date` accepts a `YYYY-MM-DD` string or `null`
- `status` accepts a non-empty string
- `requires_commit` accepts a boolean

Responses:

- `200` when the commission is updated
- `404` when no matching commission exists

Example response:

```json
{
  "commission": {
    "id": "cm_01jnk4rjv4w8d7j8f7j8t9v2g1",
    "status": "received",
    "time_cost": 14,
    "ship_date": "2026-03-21",
    "total_cost": 8500,
    "requires_commit": true,
    "created_at": "2026-03-05T15:01:02.123Z",
    "updated_at": "2026-03-09T18:44:55.000Z"
  }
}
```

## `GET /admin/products`

Returns all products from Postgres.

Optional query params:

- `productId`: return only the matching product id

Response (`200`):

```json
{
  "products": [
    {
      "id": "leggy_frog",
      "title": "Leggy Frog",
      "description": "A very long frog",
      "sell_price_cents": 4200,
      "days_to_create": 1.5,
      "image_urls": [
        "https://cdn.example.com/leggy_frog/leggy-frog-watermarked.jpg"
      ],
      "created_at": "2026-03-05T15:01:02.123Z",
      "updated_at": "2026-03-05T15:01:02.123Z"
    }
  ]
}
```

Filtered example:

```bash
curl "http://localhost:8080/admin/products?productId=leggy_frog"
```

## `POST /admin/products`

Creates or updates a product row in Postgres.

Request body (`application/json`):

```json
{
  "id": "leggy_frog",
  "title": "Leggy Frog",
  "description": "A very long frog",
  "sell_price_cents": 4200,
  "days_to_create": 1.5
}
```

Response:

- `201` when a new product is created
- `200` when an existing product is updated

If the product id already exists, `title`, `description`, `sell_price_cents`, and `days_to_create` are overwritten, `updated_at` is refreshed, and `created_at` is preserved.

Example response:

```json
{
  "product": {
    "id": "leggy_frog",
    "title": "Leggy Frog",
    "description": "A very long frog",
    "sell_price_cents": 4200,
    "days_to_create": 1.5,
    "image_urls": [],
    "created_at": "2026-03-05T15:01:02.123Z",
    "updated_at": "2026-03-05T15:01:02.123Z"
  }
}
```

## `DELETE /admin/products`

Deletes a product row by id.

Required query params:

- `productId`: the product id to delete

Responses:

- `204` when the product is deleted
- `404` when no matching product exists
- `400` when `productId` is missing

Example:

```bash
curl -X DELETE "http://localhost:8080/admin/products?productId=leggy_frog"
```

## `POST /admin/markets`

Creates or updates a market row using the public `markets` table columns:
`street_address`, `city`, `state`, `start_time`, `end_time`, `title`,
`description`, and `link`.

Request body (`application/json`):

```json
{
  "title": "Soggy Spring Craft Market",
  "street_address": "123 River Rd",
  "city": "Richmond",
  "state": "VA",
  "start_time": "2026-05-16T10:00:00-04:00",
  "end_time": "2026-05-16T16:00:00-04:00",
  "description": "Outdoor booth by the fountain.",
  "link": "https://example.com/events/soggy-spring-craft-market"
}
```

Notes:

- `title`, `street_address`, `city`, `state`, and `start_time` are required
- `end_time`, `description`, and `link` may be `null`
- `start_time` and `end_time` must be ISO 8601 timestamps with a timezone offset
- `end_time` must be greater than or equal to `start_time` when provided
- `camelCase` aliases are also accepted for `streetAddress`, `startTime`, and `endTime`
- Past events are not inserted or updated

Match behavior:

- First tries an exact match on `title + street_address + city + state + start_time`
- If that fails, it tries a same-day match on `title + street_address + city + state`
- If no match is found and the event is not in the past, a new row is inserted
- If multiple rows match ambiguously, the endpoint returns `409`

Responses:

- `201` when a new row is created
- `200` when an existing row is updated, unchanged, or skipped because it is in the past
- `409` when multiple rows match and the service cannot safely determine which row to update

Example response:

```json
{
  "action": "updated",
  "matched_on": "same_day_identity",
  "market": {
    "street_address": "123 River Rd",
    "city": "Richmond",
    "state": "VA",
    "start_time": "2026-05-16T14:00:00.000Z",
    "end_time": "2026-05-16T20:00:00.000Z",
    "title": "Soggy Spring Craft Market",
    "description": "Outdoor booth by the fountain.",
    "link": "https://example.com/events/soggy-spring-craft-market"
  }
}
```

## `POST /admin/products/image`

Accepts `multipart/form-data` and uploads:

1. Original image to private bucket
2. Watermarked image to public bucket
3. Thumbnail image (non-watermarked) to thumbnail bucket

Form fields:

- `image` (required file)
- `productId` (required for DB relation; used as folder prefix)
- `alt` (optional text for `product_images.alt`)
- `sort_order` or `sortOrder` (optional non-negative integer)

When image upload succeeds, a `product_images` row is also written using the public image path.
The `product_images` row is reserved before processing/upload; if later processing/upload fails, the row is rolled back.

Duplicate prevention:

- App-level duplicate check is enforced for `product_id + path`
- Advisory locking is used per product id to avoid race-condition duplicates
- If duplicate path already exists, a new row is not inserted

Sort-order behavior:

- If `sort_order` is provided, existing rows at or above that value are shifted up by `+1`
- If not provided, the row is appended to the end (`max(sort_order) + 1`)

Object naming convention:

- Folder prefix is product id: `/<productId>/...`
- Filenames use original base name + UTC timestamp:
  - `<originalBase>-YYYYMMDD-HHMMSSmmm.<ext>`
  - `<originalBase>-YYYYMMDD-HHMMSSmmm-watermarked.<ext>`
  - `<originalBase>-YYYYMMDD-HHMMSSmmm-thumbnail.<ext>`

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Configure env:

```bash
cp .env.example .env
```

3. Apply schema:

```bash
psql "$DATABASE_URL" -f product-schema.sql
```

4. Run:

```bash
npm start
```

## Deploy to Cloud Run

`deploy.sh` defaults to project `soggy-stitches`.

Required deploy env vars:

- either `INSTANCE_CONNECTION_NAME` or `DB_HOST`

By default, `deploy.sh` now reads these from Secret Manager when you do not pass them directly:

- `DB_USER` from secret `DB_USER`
- `DB_PASS` from secret `DB_PASS`
- `DB_NAME` from secret `DB_NAME`
- `INSTANCE_CONNECTION_NAME` from secret `INSTANCE_CONNECTION_NAME`

Optional overrides:

- `SECRET_PROJECT_ID` default: `PROJECT_ID`
- `DB_USER_SECRET_NAME`
- `DB_PASS_SECRET_NAME`
- `DB_NAME_SECRET_NAME`
- `INSTANCE_CONNECTION_NAME_SECRET_NAME`
- `DB_USER_SECRET_VERSION` default: `latest`
- `DB_PASS_SECRET_VERSION` default: `latest`
- `DB_NAME_SECRET_VERSION` default: `latest`
- `INSTANCE_CONNECTION_NAME_SECRET_VERSION` default: `latest`

The Cloud Run runtime service account must have access to any secrets injected into the service environment.

Example:

```bash
INVOKER_SERVICE_ACCOUNT=bruno-invoker@soggy-stitches.iam.gserviceaccount.com \
./deploy.sh
```

If your secret names differ from the defaults:

```bash
DB_USER_SECRET_NAME=prod-db-user \
DB_PASS_SECRET_NAME=prod-db-pass \
DB_NAME_SECRET_NAME=prod-db-name \
INSTANCE_CONNECTION_NAME_SECRET_NAME=prod-instance-connection-name \
./deploy.sh
```
