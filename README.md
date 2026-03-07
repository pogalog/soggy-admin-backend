# Soggy Admin Backend

Node.js HTTP service for admin workflows on Cloud Run.

## Routes

- `GET /admin/products`
- `POST /admin/products`
- `DELETE /admin/products`
- `POST /admin/products/image`

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
      "inventory_qty": 7,
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
  "inventory_qty": 7
}
```

Response:

- `201` when a new product is created
- `200` when an existing product is updated

If the product id already exists, `title`, `description`, `sell_price_cents`, and `inventory_qty` are overwritten, `updated_at` is refreshed, and `created_at` is preserved.

Example response:

```json
{
  "product": {
    "id": "leggy_frog",
    "title": "Leggy Frog",
    "description": "A very long frog",
    "sell_price_cents": 4200,
    "inventory_qty": 7,
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

- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- and either `INSTANCE_CONNECTION_NAME` or `DB_HOST`

Example:

```bash
DB_USER=postgres \
DB_PASS=changeme \
DB_NAME=products_db \
INSTANCE_CONNECTION_NAME=soggy-stitches:us-east1:products-db \
INVOKER_SERVICE_ACCOUNT=bruno-invoker@soggy-stitches.iam.gserviceaccount.com \
./deploy.sh
```
