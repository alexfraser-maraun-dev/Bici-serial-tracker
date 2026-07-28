export type CollectionStatus = 'draft' | 'active' | 'closed' | 'exported';

export type CollectionRecord = {
  id: string;
  name: string;
  brand: string | null;
  status: CollectionStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  restricted_skus: string | null;
  restricted_brands: string | null;
};

export type MatchType = 'prefix' | 'contains' | 'regex' | 'exact';

export type MappingRuleRecord = {
  id: string;
  brand: string;
  vendor_id: string;
  vendor_name: string;
  product_description: string;
  upc: string;
  system_sku: string;
  manufacturer_sku: string;
  match_type: MatchType;
  match_value: string;
  priority: number;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type MatchStatus =
  | 'pending_match'
  | 'matched'
  | 'unmatched'
  | 'manually_assigned';

export type SerialScanRecord = {
  id: string;
  collection_id: string;
  brand: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  product_description: string | null;
  upc: string | null;
  system_sku: string | null;
  manufacturer_sku: string | null;
  serial_number: string;
  normalized_serial_number: string;
  qty_sold: number;
  match_status: MatchStatus;
  mapping_rule_id: string | null;
  scanned_by: string;
  scanned_at: string;
  created_at: string;
  updated_at: string;
};

export type ProductAssignment = {
  brand?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  product_description?: string | null;
  upc?: string | null;
  system_sku?: string | null;
  manufacturer_sku?: string | null;
};
