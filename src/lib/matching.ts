import type {
  CollectionRecord,
  MappingRuleRecord,
  ProductAssignment,
} from '@/lib/types';

// Serial numbers are case-insensitive, so they are stored and compared in
// upper case.
export function normalizeSerial(serial: string) {
  return serial.trim().replace(/\r?\n|\r/g, '').toUpperCase();
}

export function matchesRule(
  normalizedSerial: string,
  rule: Pick<MappingRuleRecord, 'match_type' | 'match_value'>,
) {
  // Older scans and rules may be stored in mixed case.
  const serial = normalizedSerial.toUpperCase();
  const value = rule.match_value.toUpperCase();
  switch (rule.match_type) {
    case 'exact':
      return serial === value;
    case 'prefix':
      return serial.startsWith(value);
    case 'contains':
      return serial.includes(value);
    case 'regex':
      try {
        return new RegExp(rule.match_value, 'i').test(serial);
      } catch {
        return false;
      }
  }
}

export function findMatchingRule(
  normalizedSerial: string,
  rules: MappingRuleRecord[],
) {
  return rules.find((rule) => matchesRule(normalizedSerial, rule)) ?? null;
}

export function splitRestrictionList(value: string | null) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getRestrictionError(
  collection: Pick<
    CollectionRecord,
    'restricted_brands' | 'restricted_skus'
  >,
  product: ProductAssignment,
) {
  const allowedBrands = splitRestrictionList(collection.restricted_brands);
  const brand = product.brand?.trim().toLowerCase() ?? '';

  // Preserve the existing behavior: a blank brand is not rejected.
  if (allowedBrands.length > 0 && brand && !allowedBrands.includes(brand)) {
    return `The brand "${product.brand}" is not allowed in this collection.`;
  }

  const allowedItems = splitRestrictionList(collection.restricted_skus);
  if (allowedItems.length > 0) {
    const systemSku = product.system_sku?.trim().toLowerCase() ?? '';
    const upc = product.upc?.trim().toLowerCase() ?? '';
    if (
      (!systemSku || !allowedItems.includes(systemSku)) &&
      (!upc || !allowedItems.includes(upc))
    ) {
      return `The SKU "${product.system_sku ?? ''}" or UPC "${product.upc ?? ''}" is not allowed in this collection.`;
    }
  }

  return null;
}
