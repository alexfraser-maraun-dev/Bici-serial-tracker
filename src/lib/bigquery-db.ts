import 'server-only';

import { randomUUID } from 'node:crypto';
import { executeDml, queryRows, tableRef } from '@/lib/bigquery';
import {
  findMatchingRule,
  getRestrictionError,
  matchesRule,
  normalizeSerial,
} from '@/lib/matching';
import type {
  CollectionRecord,
  CollectionStatus,
  MappingRuleRecord,
  MatchStatus,
  MatchType,
  ProductAssignment,
  SerialScanRecord,
} from '@/lib/types';

const collectionsTable = tableRef('collections');
const rulesTable = tableRef('serial_mapping_rules');
const scansTable = tableRef('serial_scans');

const collectionFields = `
  id,
  name,
  brand,
  status,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', starts_at) AS starts_at,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', ends_at) AS ends_at,
  created_by,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', created_at) AS created_at,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', updated_at) AS updated_at,
  restricted_skus,
  restricted_brands
`;

const ruleFields = `
  id,
  COALESCE(brand, '') AS brand,
  COALESCE(vendor_id, '') AS vendor_id,
  COALESCE(vendor_name, '') AS vendor_name,
  COALESCE(product_description, '') AS product_description,
  COALESCE(upc, '') AS upc,
  COALESCE(system_sku, '') AS system_sku,
  COALESCE(manufacturer_sku, '') AS manufacturer_sku,
  match_type,
  match_value,
  priority,
  active,
  created_by,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', created_at) AS created_at,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', updated_at) AS updated_at
`;

const scanFields = `
  id,
  collection_id,
  brand,
  vendor_id,
  vendor_name,
  product_description,
  upc,
  system_sku,
  manufacturer_sku,
  serial_number,
  normalized_serial_number,
  qty_sold,
  match_status,
  mapping_rule_id,
  scanned_by,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', scanned_at) AS scanned_at,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', created_at) AS created_at,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', updated_at) AS updated_at
`;

export class DatabaseRequestError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'INVALID_REQUEST') {
    super(message);
    this.name = 'DatabaseRequestError';
    this.status = status;
    this.code = code;
  }
}

export type CreateCollectionInput = {
  name: string;
  brand?: string | null;
  status?: CollectionStatus;
  restricted_skus?: string | null;
  restricted_brands?: string | null;
};

export type UpdateCollectionInput = Partial<
  Pick<
    CollectionRecord,
    | 'name'
    | 'brand'
    | 'status'
    | 'restricted_skus'
    | 'restricted_brands'
  >
>;

export type RuleInput = ProductAssignment & {
  match_type: MatchType;
  match_value: string;
  priority: number;
  active: boolean;
};

export async function listCollections() {
  return queryRows<CollectionRecord>(`
    SELECT ${collectionFields}
    FROM ${collectionsTable}
    ORDER BY created_at DESC
  `);
}

export async function getCollection(id: string) {
  const rows = await queryRows<CollectionRecord>(
    `
      SELECT ${collectionFields}
      FROM ${collectionsTable}
      WHERE id = @id
      LIMIT 1
    `,
    { id },
  );
  return rows[0] ?? null;
}

export async function createCollection(
  input: CreateCollectionInput,
  createdBy: string,
) {
  const id = randomUUID();
  await executeDml(
    `
      INSERT INTO ${collectionsTable} (
        id, name, brand, status, starts_at, ends_at, created_by,
        created_at, updated_at, restricted_skus, restricted_brands
      )
      VALUES (
        @id, @name, NULLIF(@brand, ''), @status, NULL, NULL, @createdBy,
        CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(),
        NULLIF(@restrictedSkus, ''), NULLIF(@restrictedBrands, '')
      )
    `,
    {
      id,
      name: input.name,
      brand: input.brand ?? '',
      status: input.status ?? 'active',
      createdBy,
      restrictedSkus: input.restricted_skus ?? '',
      restrictedBrands: input.restricted_brands ?? '',
    },
  );

  const collection = await getCollection(id);
  if (!collection) {
    throw new Error('The collection was not available after it was created.');
  }
  return collection;
}

export async function updateCollection(
  id: string,
  input: UpdateCollectionInput,
) {
  const assignments: string[] = [];
  const params: Record<string, string> = { id };

  if (input.name !== undefined) {
    assignments.push('name = @name');
    params.name = input.name;
  }
  if (input.brand !== undefined) {
    assignments.push("brand = NULLIF(@brand, '')");
    params.brand = input.brand ?? '';
  }
  if (input.status !== undefined) {
    assignments.push('status = @status');
    params.status = input.status;
  }
  if (input.restricted_skus !== undefined) {
    assignments.push("restricted_skus = NULLIF(@restrictedSkus, '')");
    params.restrictedSkus = input.restricted_skus ?? '';
  }
  if (input.restricted_brands !== undefined) {
    assignments.push("restricted_brands = NULLIF(@restrictedBrands, '')");
    params.restrictedBrands = input.restricted_brands ?? '';
  }

  if (assignments.length === 0) {
    throw new DatabaseRequestError('No collection fields were provided.');
  }

  assignments.push('updated_at = CURRENT_TIMESTAMP()');
  const affected = await executeDml(
    `
      UPDATE ${collectionsTable}
      SET ${assignments.join(', ')}
      WHERE id = @id
    `,
    params,
  );

  if (affected === 0) {
    throw new DatabaseRequestError('Collection not found.', 404, 'NOT_FOUND');
  }

  const collection = await getCollection(id);
  if (!collection) {
    throw new DatabaseRequestError('Collection not found.', 404, 'NOT_FOUND');
  }
  return collection;
}

export async function listMappingRules(activeOnly = false) {
  return queryRows<MappingRuleRecord>(`
    SELECT ${ruleFields}
    FROM ${rulesTable}
    ${activeOnly ? 'WHERE active = TRUE' : ''}
    ORDER BY priority DESC, created_at ASC, id ASC
  `);
}

export async function getMappingRule(id: string) {
  const rows = await queryRows<MappingRuleRecord>(
    `
      SELECT ${ruleFields}
      FROM ${rulesTable}
      WHERE id = @id
      LIMIT 1
    `,
    { id },
  );
  return rows[0] ?? null;
}

function validateRule(input: RuleInput) {
  const validTypes: MatchType[] = ['prefix', 'contains', 'regex', 'exact'];
  if (!validTypes.includes(input.match_type)) {
    throw new DatabaseRequestError('Invalid mapping rule type.');
  }
  if (!input.match_value) {
    throw new DatabaseRequestError('A mapping rule value is required.');
  }
  if (!Number.isInteger(input.priority)) {
    throw new DatabaseRequestError('Mapping rule priority must be an integer.');
  }
  if (input.match_type === 'regex') {
    try {
      new RegExp(input.match_value);
    } catch {
      throw new DatabaseRequestError('The regular expression is invalid.');
    }
  }
}

function ruleParams(input: RuleInput) {
  return {
    brand: input.brand ?? '',
    vendorId: input.vendor_id ?? '',
    vendorName: input.vendor_name ?? '',
    productDescription: input.product_description ?? '',
    upc: input.upc ?? '',
    systemSku: input.system_sku ?? '',
    manufacturerSku: input.manufacturer_sku ?? '',
    matchType: input.match_type,
    matchValue: input.match_value,
    priority: input.priority,
    active: input.active,
  };
}

export async function createMappingRule(input: RuleInput, createdBy: string) {
  validateRule(input);
  const id = randomUUID();
  await executeDml(
    `
      INSERT INTO ${rulesTable} (
        id, brand, vendor_id, vendor_name, product_description, upc,
        system_sku, manufacturer_sku, match_type, match_value, priority,
        active, created_by, created_at, updated_at
      )
      VALUES (
        @id, NULLIF(@brand, ''), NULLIF(@vendorId, ''),
        NULLIF(@vendorName, ''), NULLIF(@productDescription, ''),
        NULLIF(@upc, ''), NULLIF(@systemSku, ''),
        NULLIF(@manufacturerSku, ''), @matchType, @matchValue, @priority,
        @active, @createdBy, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
      )
    `,
    { id, createdBy, ...ruleParams(input) },
  );

  const rule = await getMappingRule(id);
  if (!rule) {
    throw new Error('The mapping rule was not available after it was created.');
  }
  const reconciledCount = rule.active
    ? await reconcileUnmatchedScans(rule)
    : 0;
  return { rule, reconciledCount };
}

export async function updateMappingRule(id: string, input: RuleInput) {
  validateRule(input);
  const affected = await executeDml(
    `
      UPDATE ${rulesTable}
      SET
        brand = NULLIF(@brand, ''),
        vendor_id = NULLIF(@vendorId, ''),
        vendor_name = NULLIF(@vendorName, ''),
        product_description = NULLIF(@productDescription, ''),
        upc = NULLIF(@upc, ''),
        system_sku = NULLIF(@systemSku, ''),
        manufacturer_sku = NULLIF(@manufacturerSku, ''),
        match_type = @matchType,
        match_value = @matchValue,
        priority = @priority,
        active = @active,
        updated_at = CURRENT_TIMESTAMP()
      WHERE id = @id
    `,
    { id, ...ruleParams(input) },
  );

  if (affected === 0) {
    throw new DatabaseRequestError(
      'Mapping rule not found.',
      404,
      'NOT_FOUND',
    );
  }

  const rule = await getMappingRule(id);
  if (!rule) {
    throw new DatabaseRequestError(
      'Mapping rule not found.',
      404,
      'NOT_FOUND',
    );
  }
  const reconciledCount = rule.active
    ? await reconcileUnmatchedScans(rule)
    : 0;
  return { rule, reconciledCount };
}

export async function deleteMappingRule(id: string) {
  await executeDml(
    `
      UPDATE ${scansTable}
      SET mapping_rule_id = NULL, updated_at = CURRENT_TIMESTAMP()
      WHERE mapping_rule_id = @id
    `,
    { id },
  );
  const affected = await executeDml(
    `DELETE FROM ${rulesTable} WHERE id = @id`,
    { id },
  );
  if (affected === 0) {
    throw new DatabaseRequestError(
      'Mapping rule not found.',
      404,
      'NOT_FOUND',
    );
  }
}

type ReconciliationCandidate = {
  id: string;
  normalized_serial_number: string;
  restricted_skus: string | null;
  restricted_brands: string | null;
};

export async function reconcileUnmatchedScans(rule: MappingRuleRecord) {
  const candidates = await queryRows<ReconciliationCandidate>(`
    SELECT
      scans.id,
      scans.normalized_serial_number,
      collections.restricted_skus,
      collections.restricted_brands
    FROM ${scansTable} AS scans
    INNER JOIN ${collectionsTable} AS collections
      ON collections.id = scans.collection_id
    WHERE scans.match_status = 'unmatched'
  `);

  const eligibleIds = candidates
    .filter(
      (scan) =>
        matchesRule(scan.normalized_serial_number, rule) &&
        !getRestrictionError(scan, rule),
    )
    .map((scan) => scan.id);

  if (eligibleIds.length === 0) {
    return 0;
  }

  const affected = await executeDml(
    `
      UPDATE ${scansTable}
      SET
        brand = NULLIF(@brand, ''),
        vendor_id = NULLIF(@vendorId, ''),
        vendor_name = NULLIF(@vendorName, ''),
        product_description = NULLIF(@productDescription, ''),
        upc = NULLIF(@upc, ''),
        system_sku = NULLIF(@systemSku, ''),
        manufacturer_sku = NULLIF(@manufacturerSku, ''),
        match_status = 'matched',
        mapping_rule_id = @ruleId,
        updated_at = CURRENT_TIMESTAMP()
      WHERE id IN UNNEST(@eligibleIds)
        AND match_status = 'unmatched'
    `,
    {
      eligibleIds,
      ruleId: rule.id,
      brand: rule.brand,
      vendorId: rule.vendor_id,
      vendorName: rule.vendor_name,
      productDescription: rule.product_description,
      upc: rule.upc,
      systemSku: rule.system_sku,
      manufacturerSku: rule.manufacturer_sku,
    },
  );

  return affected ?? eligibleIds.length;
}

export async function listSerialScans(filters: {
  collectionId?: string;
  matchStatus?: MatchStatus;
}) {
  const clauses: string[] = [];
  const params: Record<string, string> = {};

  if (filters.collectionId) {
    clauses.push('collection_id = @collectionId');
    params.collectionId = filters.collectionId;
  }
  if (filters.matchStatus) {
    clauses.push('match_status = @matchStatus');
    params.matchStatus = filters.matchStatus;
  }

  return queryRows<SerialScanRecord>(
    `
      SELECT ${scanFields}
      FROM ${scansTable}
      ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY scanned_at DESC
    `,
    params,
  );
}

export async function getSerialScan(id: string) {
  const rows = await queryRows<SerialScanRecord>(
    `
      SELECT ${scanFields}
      FROM ${scansTable}
      WHERE id = @id
      LIMIT 1
    `,
    { id },
  );
  return rows[0] ?? null;
}

export async function createSerialScan(
  collectionId: string,
  serialNumber: string,
  scannedBy: string,
) {
  const normalized = normalizeSerial(serialNumber);
  if (!normalized) {
    throw new DatabaseRequestError('A serial number is required.');
  }

  const [collection, rules] = await Promise.all([
    getCollection(collectionId),
    listMappingRules(true),
  ]);
  if (!collection) {
    throw new DatabaseRequestError('Collection not found.', 404, 'NOT_FOUND');
  }
  if (collection.status !== 'active') {
    throw new DatabaseRequestError(
      'This collection is not active.',
      409,
      'COLLECTION_INACTIVE',
    );
  }

  const matchedRule = findMatchingRule(normalized, rules);
  if (matchedRule) {
    const restrictionError = getRestrictionError(collection, matchedRule);
    if (restrictionError) {
      throw new DatabaseRequestError(
        restrictionError,
        422,
        'RESTRICTED_PRODUCT',
      );
    }
  }

  const id = randomUUID();
  const affected = await executeDml(
    `
      MERGE ${scansTable} AS target
      USING (
        SELECT @normalizedSerialNumber AS normalized_serial_number
      ) AS source
      ON target.normalized_serial_number = source.normalized_serial_number
      WHEN NOT MATCHED THEN
        INSERT (
          id, collection_id, brand, vendor_id, vendor_name,
          product_description, upc, system_sku, manufacturer_sku,
          serial_number, normalized_serial_number, qty_sold, match_status,
          mapping_rule_id, scanned_by, scanned_at, created_at, updated_at
        )
        VALUES (
          @id, @collectionId, NULLIF(@brand, ''), NULLIF(@vendorId, ''),
          NULLIF(@vendorName, ''), NULLIF(@productDescription, ''),
          NULLIF(@upc, ''), NULLIF(@systemSku, ''),
          NULLIF(@manufacturerSku, ''), @serialNumber,
          source.normalized_serial_number, 1, @matchStatus,
          NULLIF(@mappingRuleId, ''), @scannedBy, CURRENT_TIMESTAMP(),
          CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
        )
    `,
    {
      id,
      collectionId,
      serialNumber,
      normalizedSerialNumber: normalized,
      matchStatus: matchedRule ? 'matched' : 'unmatched',
      mappingRuleId: matchedRule?.id ?? '',
      scannedBy,
      brand: matchedRule?.brand ?? '',
      vendorId: matchedRule?.vendor_id ?? '',
      vendorName: matchedRule?.vendor_name ?? '',
      productDescription: matchedRule?.product_description ?? '',
      upc: matchedRule?.upc ?? '',
      systemSku: matchedRule?.system_sku ?? '',
      manufacturerSku: matchedRule?.manufacturer_sku ?? '',
    },
  );

  if (affected === 0) {
    throw new DatabaseRequestError(
      'This serial number has already been scanned.',
      409,
      'DUPLICATE_SERIAL',
    );
  }

  const scan = await getSerialScan(id);
  if (!scan) {
    // If DML statistics were unavailable, distinguish a duplicate from an
    // unexpected write failure by checking for the generated row.
    throw new DatabaseRequestError(
      'This serial number has already been scanned.',
      409,
      'DUPLICATE_SERIAL',
    );
  }
  return scan;
}

export async function manuallyAssignScan(
  id: string,
  product: ProductAssignment,
) {
  if (!product.product_description) {
    throw new DatabaseRequestError('Product description is required.');
  }

  const scan = await getSerialScan(id);
  if (!scan) {
    throw new DatabaseRequestError('Scan not found.', 404, 'NOT_FOUND');
  }
  const collection = await getCollection(scan.collection_id);
  if (!collection) {
    throw new DatabaseRequestError('Collection not found.', 404, 'NOT_FOUND');
  }
  const restrictionError = getRestrictionError(collection, product);
  if (restrictionError) {
    throw new DatabaseRequestError(
      restrictionError,
      422,
      'RESTRICTED_PRODUCT',
    );
  }

  const affected = await executeDml(
    `
      UPDATE ${scansTable}
      SET
        brand = NULLIF(@brand, ''),
        vendor_id = NULLIF(@vendorId, ''),
        vendor_name = NULLIF(@vendorName, ''),
        product_description = NULLIF(@productDescription, ''),
        upc = NULLIF(@upc, ''),
        system_sku = NULLIF(@systemSku, ''),
        manufacturer_sku = NULLIF(@manufacturerSku, ''),
        match_status = 'manually_assigned',
        mapping_rule_id = NULL,
        updated_at = CURRENT_TIMESTAMP()
      WHERE id = @id
        AND match_status = 'unmatched'
    `,
    {
      id,
      brand: product.brand ?? '',
      vendorId: product.vendor_id ?? '',
      vendorName: product.vendor_name ?? '',
      productDescription: product.product_description,
      upc: product.upc ?? '',
      systemSku: product.system_sku ?? '',
      manufacturerSku: product.manufacturer_sku ?? '',
    },
  );

  if (affected === 0) {
    throw new DatabaseRequestError(
      'This scan is no longer unmatched.',
      409,
      'SCAN_ALREADY_ASSIGNED',
    );
  }

  const updated = await getSerialScan(id);
  if (!updated) {
    throw new DatabaseRequestError('Scan not found.', 404, 'NOT_FOUND');
  }
  return updated;
}

export async function deleteSerialScan(id: string) {
  const affected = await executeDml(
    `DELETE FROM ${scansTable} WHERE id = @id`,
    { id },
  );
  if (affected === 0) {
    throw new DatabaseRequestError('Scan not found.', 404, 'NOT_FOUND');
  }
}
