# BICI Serial Tracker

Next.js application for collecting serialized products, mapping serial-number
patterns to Lightspeed products, reviewing unmatched scans, and exporting
collection CSVs.

## Database

Application data is stored in BigQuery:

- `bici-klaviyo-datasync.Biciserialtracker.collections`
- `bici-klaviyo-datasync.Biciserialtracker.serial_mapping_rules`
- `bici-klaviyo-datasync.Biciserialtracker.serial_scans`

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

The service account needs permission to create BigQuery query jobs and to read
and edit the three application tables.

## Matching behavior

New scans are matched against active rules in priority order. Saving or editing
an active rule also reconciles previously unmatched scans in one bulk update.
Collection SKU and brand restrictions are enforced both for new scans and for
later reconciliation.

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
