# BICI Serial Tracker

Next.js application for collecting serialized products, mapping serial-number
patterns to Lightspeed products, reviewing unmatched scans, and exporting
collection CSVs.

## Database

Application data is stored in BigQuery:

- `bici-klaviyo-datasync.Biciserialtracker.collections`
- `bici-klaviyo-datasync.Biciserialtracker.serial_mapping_rules`
- `bici-klaviyo-datasync.Biciserialtracker.serial_scans`
- `bici-klaviyo-datasync.Biciserialtracker.sale_serial_links`

Promo claims read Lightspeed sales from
`bici-klaviyo-datasync.light_speed_retailne` (override with
`LIGHTSPEED_DATASET_ID`).

Browser pages call authenticated Next.js route handlers. BigQuery credentials
and queries remain server-side.

Configure:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
BIGQUERY_DATASET_ID=bici-klaviyo-datasync.Biciserialtracker
```

`BIGQUERY_PROJECT_ID` can be set separately when
`BIGQUERY_DATASET_ID` contains only the dataset name. The defaults are
`bici-klaviyo-datasync` and `Biciserialtracker`.

The service account needs permission to create BigQuery query jobs, to read
and edit the application tables, and to read the Lightspeed dataset. See
`schema.sql` for the table definitions and the `shop_ids` migration.

## Matching behavior

New scans are matched against active rules in priority order. Saving or editing
an active rule also reconciles previously unmatched scans in one bulk update.
Collection SKU and brand restrictions are enforced both for new scans and for
later reconciliation.

## Promo claims

Each collection has a promo window (local dates, America/Vancouver) and an
optional set of Lightspeed shops. Qualifying sales are completed, non-voided
Lightspeed sales in that window, which include Shopify orders. A sale line
qualifies when its item's system SKU or UPC is in the collection's allowed
SKUs; if that list is empty, any product scanned into the collection counts.
Returned units and lines with a net price of $0 or less are excluded.

Serials are attributed to sales, not traced: auto-link pairs every unlinked
sale unit with an unused serial of the same product from the same collection.
A serial only has to be unique within its collection, because serials are
rescanned for each window. Receipts leave out shop, register, payment, order
reference and customer contact details, plus every item whose name contains
"Shopify" (shipping, refund and gift card placeholders). Receipt totals are
recalculated from the printed lines.

## Development

```bash
npm install
npm run dev
```

Validation:

```bash
npm run lint
npx tsc --noEmit
npm run build
```
