-- BigQuery application tables.
-- IDs, allowed status values, duplicate serial prevention, and timestamps are
-- managed by the authenticated application API because BigQuery does not
-- enforce the PostgreSQL constraints/triggers that this project used before.

CREATE TABLE IF NOT EXISTS `bici-klaviyo-datasync.Biciserialtracker.collections` (
  id STRING,
  name STRING,
  brand STRING,
  status STRING,
  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  restricted_skus STRING,
  restricted_brands STRING,
  shop_ids STRING
);

CREATE TABLE IF NOT EXISTS `bici-klaviyo-datasync.Biciserialtracker.serial_mapping_rules` (
  id STRING,
  brand STRING,
  vendor_id STRING,
  vendor_name STRING,
  product_description STRING,
  upc STRING,
  system_sku STRING,
  manufacturer_sku STRING,
  match_type STRING,
  match_value STRING,
  priority INTEGER,
  active BOOLEAN,
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `bici-klaviyo-datasync.Biciserialtracker.serial_scans` (
  id STRING,
  collection_id STRING,
  brand STRING,
  vendor_id STRING,
  vendor_name STRING,
  product_description STRING,
  upc STRING,
  system_sku STRING,
  manufacturer_sku STRING,
  serial_number STRING,
  normalized_serial_number STRING,
  qty_sold INTEGER,
  match_status STRING,
  mapping_rule_id STRING,
  scanned_by STRING,
  scanned_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Links each qualifying Lightspeed sale unit in a collection's promo window to
-- one of the collection's scanned serials. Uniqueness of scan_id and of
-- (sale_line_id, unit_index) within a collection is enforced by the app.
CREATE TABLE IF NOT EXISTS `bici-klaviyo-datasync.Biciserialtracker.sale_serial_links` (
  id STRING,
  collection_id STRING,
  scan_id STRING,
  sale_id INT64,
  sale_line_id INT64,
  unit_index INT64,
  link_method STRING,
  linked_by STRING,
  created_at TIMESTAMP
);

-- Migration for datasets created before promo claims were added:
-- ALTER TABLE `bici-klaviyo-datasync.Biciserialtracker.collections`
--   ADD COLUMN IF NOT EXISTS shop_ids STRING;
