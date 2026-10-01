export type CollectionStatus = 'draft' | 'active' | 'closed' | 'exported';

export type CollectionRecord = {
  id: string;
  name: string;
  brand: string | null;
  status: CollectionStatus;
  starts_at: string | null;
  ends_at: string | null;
  /** Local (America/Vancouver) calendar dates of the promo window. */
  starts_on: string | null;
  ends_on: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  restricted_skus: string | null;
  restricted_brands: string | null;
  shop_ids: string | null;
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

export type LinkMethod = 'auto' | 'manual';

export type SaleSerialLink = {
  id: string;
  collection_id: string;
  scan_id: string;
  sale_id: number;
  sale_line_id: number;
  unit_index: number;
  link_method: LinkMethod;
  linked_by: string;
  created_at: string;
};

export type QualifyingSaleLine = {
  sale_id: number;
  sale_line_id: number;
  ticket_number: string;
  complete_time: string;
  customer_id: number | null;
  item_id: number;
  system_sku: string;
  upc: string;
  manufacturer_sku: string;
  description: string;
  brand: string;
  unit_quantity: number;
  unit_price: number;
  discount_amount: number;
  calc_subtotal: number;
  returned_quantity: number;
};

/** One unit of a qualifying sale line, which can carry one serial. */
export type QualifyingUnit = QualifyingSaleLine & {
  unit_index: number;
  returned: boolean;
  link: SaleSerialLink | null;
  serial_number: string | null;
};

export type ShopRecord = {
  id: number;
  name: string;
};

export type ReceiptLine = {
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  subtotal: number;
  tax: number;
};

export type ReceiptSale = {
  sale_id: number;
  ticket_number: string;
  complete_time: string;
  customer_name: string;
  lines: ReceiptLine[];
};

export type PromoClaimSummary = {
  sku: string;
  description: string;
  eligible_units: number;
  linked_units: number;
  missing_units: number;
  unused_serials: number;
  returned_units: number;
};

export type PromoClaimData = {
  collection: CollectionRecord;
  units: QualifyingUnit[];
  unusedScans: SerialScanRecord[];
  unmatchedScans: SerialScanRecord[];
  summary: PromoClaimSummary[];
  configError: string | null;
};
