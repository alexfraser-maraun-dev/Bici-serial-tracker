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
  restricted_brands STRING
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
