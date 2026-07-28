import type { RuleInput } from '@/lib/bigquery-db';
import type { MatchType } from '@/lib/types';

export function parseRuleInput(body: Record<string, unknown>): RuleInput {
  return {
    brand: typeof body.brand === 'string' ? body.brand : '',
    vendor_id: typeof body.vendor_id === 'string' ? body.vendor_id : '',
    vendor_name: typeof body.vendor_name === 'string' ? body.vendor_name : '',
    product_description:
      typeof body.product_description === 'string'
        ? body.product_description
        : '',
    upc: typeof body.upc === 'string' ? body.upc : '',
    system_sku: typeof body.system_sku === 'string' ? body.system_sku : '',
    manufacturer_sku:
      typeof body.manufacturer_sku === 'string' ? body.manufacturer_sku : '',
    match_type: body.match_type as MatchType,
    match_value:
      typeof body.match_value === 'string' ? body.match_value : '',
    priority:
      typeof body.priority === 'number' && Number.isInteger(body.priority)
        ? body.priority
        : 10,
    active: typeof body.active === 'boolean' ? body.active : true,
  };
}
