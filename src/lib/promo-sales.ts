import 'server-only';

import { lightspeedTable, queryRows } from '@/lib/bigquery';
import type {
  QualifyingSaleLine,
  ReceiptLine,
  ReceiptSale,
  ShopRecord,
} from '@/lib/types';

// Lightspeed tables are synced in Fivetran history mode, so every query must
// keep only the latest version of each row.
function latest(table: Parameters<typeof lightspeedTable>[0]) {
  return `
    SELECT * FROM ${lightspeedTable(table)}
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY id ORDER BY updated_time DESC, _fivetran_synced DESC
    ) = 1
  `;
}

// Items that only exist to carry channel bookkeeping (shipping, refunds, gift
// card placeholders). They never appear on vendor receipts.
const CHANNEL_ITEM_PATTERN = /shopify/i;

export function isChannelLine(description: string) {
  return CHANNEL_ITEM_PATTERN.test(description);
}

export async function listShops() {
  return queryRows<ShopRecord>(`
    SELECT id, name
    FROM (${latest('shop_history')})
    WHERE NOT COALESCE(archived, FALSE)
    ORDER BY name
  `);
}

type ReturnLine = {
  customer_id: number;
  item_id: number;
  complete_time: string;
  quantity: number;
};

/**
 * Sale lines for the given product keys (system SKUs or UPCs, lowercased)
 * completed inside the window. Lines with a net price of zero or less (e.g.
 * warranty replacements) are not claimable and are excluded.
 */
export async function listQualifyingSaleLines(options: {
  startsAt: string;
  endsAt: string;
  shopIds: number[];
  productKeys: string[];
}): Promise<QualifyingSaleLine[]> {
  if (options.productKeys.length === 0) {
    return [];
  }

  const shopClause =
    options.shopIds.length > 0 ? 'AND s.shop_id IN UNNEST(@shopIds)' : '';

  const lines = await queryRows<Omit<QualifyingSaleLine, 'returned_quantity'>>(
    `
      WITH s AS (${latest('sale_history')}),
      sl AS (${latest('sale_line_history')}),
      i AS (${latest('item_history')}),
      m AS (${latest('manufacturer_history')})
      SELECT
        s.id AS sale_id,
        sl.id AS sale_line_id,
        COALESCE(s.ticket_number, CAST(s.id AS STRING)) AS ticket_number,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', s.complete_time) AS complete_time,
        NULLIF(s.customer_id, 0) AS customer_id,
        i.id AS item_id,
        CAST(i.system_sku AS STRING) AS system_sku,
        COALESCE(i.upc, '') AS upc,
        COALESCE(i.manufacturer_sku, '') AS manufacturer_sku,
        COALESCE(i.description, '') AS description,
        COALESCE(m.name, '') AS brand,
        sl.unit_quantity,
        ROUND(SAFE_DIVIDE(sl.displayable_subtotal, sl.unit_quantity), 2)
          AS unit_price,
        ROUND(sl.calc_subtotal - sl.displayable_subtotal, 2) AS discount_amount,
        sl.displayable_subtotal AS calc_subtotal
      FROM s
      JOIN sl ON sl.sale_id = s.id
      JOIN i ON i.id = sl.item_id
      LEFT JOIN m ON m.id = i.manufacturer_id
      WHERE COALESCE(s.completed, FALSE)
        AND NOT COALESCE(s.voided, FALSE)
        AND s.complete_time BETWEEN TIMESTAMP(@startsAt) AND TIMESTAMP(@endsAt)
        ${shopClause}
        AND sl.unit_quantity > 0
        AND sl.displayable_subtotal > 0
        AND (
          CAST(i.system_sku AS STRING) IN UNNEST(@productKeys)
          OR LOWER(i.upc) IN UNNEST(@productKeys)
        )
      ORDER BY s.complete_time, sl.id
    `,
    {
      startsAt: options.startsAt,
      endsAt: options.endsAt,
      productKeys: options.productKeys,
      ...(options.shopIds.length > 0 ? { shopIds: options.shopIds } : {}),
    },
  );

  const customerIds = [
    ...new Set(lines.map((line) => line.customer_id).filter(isPresent)),
  ];
  const itemIds = [...new Set(lines.map((line) => line.item_id))];
  const returns =
    customerIds.length > 0
      ? await queryRows<ReturnLine>(
          `
            WITH s AS (${latest('sale_history')}),
            sl AS (${latest('sale_line_history')})
            SELECT
              s.customer_id,
              sl.item_id,
              FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', s.complete_time)
                AS complete_time,
              -sl.unit_quantity AS quantity
            FROM s
            JOIN sl ON sl.sale_id = s.id
            WHERE COALESCE(s.completed, FALSE)
              AND NOT COALESCE(s.voided, FALSE)
              AND s.complete_time >= TIMESTAMP(@startsAt)
              AND sl.unit_quantity < 0
              AND s.customer_id IN UNNEST(@customerIds)
              AND sl.item_id IN UNNEST(@itemIds)
            ORDER BY s.complete_time
          `,
          { startsAt: options.startsAt, customerIds, itemIds },
        )
      : [];

  return applyReturns(lines, returns);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Lightspeed returns are separate sales with negative quantities and no link
 * to the original sale. Attribute each return to the same customer's most
 * recent earlier purchase of that item.
 */
function applyReturns(
  lines: Omit<QualifyingSaleLine, 'returned_quantity'>[],
  returns: ReturnLine[],
): QualifyingSaleLine[] {
  const result = lines.map((line) => ({ ...line, returned_quantity: 0 }));

  for (const ret of returns) {
    let remaining = ret.quantity;
    const candidates = result
      .filter(
        (line) =>
          line.customer_id === ret.customer_id &&
          line.item_id === ret.item_id &&
          line.complete_time < ret.complete_time,
      )
      .reverse();
    for (const line of candidates) {
      if (remaining <= 0) break;
      const available = line.unit_quantity - line.returned_quantity;
      const applied = Math.min(available, remaining);
      line.returned_quantity += applied;
      remaining -= applied;
    }
  }

  return result;
}

type ReceiptRow = {
  sale_id: number;
  ticket_number: string;
  complete_time: string;
  first_name: string;
  last_name: string;
  sale_line_id: number;
  description: string;
  quantity: number;
  gross: number;
  net: number;
  tax: number;
};

/**
 * Receipt data for the vendor. Only the receipt number, date, customer name
 * and item lines are selected; channel, store, payment and contact details
 * are deliberately never read.
 */
export async function getReceipts(saleIds: number[]): Promise<ReceiptSale[]> {
  if (saleIds.length === 0) {
    return [];
  }

  const rows = await queryRows<ReceiptRow>(
    `
      WITH s AS (${latest('sale_history')}),
      sl AS (${latest('sale_line_history')}),
      i AS (${latest('item_history')}),
      c AS (${latest('customer_history')})
      SELECT
        s.id AS sale_id,
        COALESCE(s.ticket_number, CAST(s.id AS STRING)) AS ticket_number,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', s.complete_time) AS complete_time,
        COALESCE(c.first_name, '') AS first_name,
        COALESCE(c.last_name, '') AS last_name,
        sl.id AS sale_line_id,
        COALESCE(i.description, '') AS description,
        sl.unit_quantity AS quantity,
        COALESCE(sl.calc_subtotal, 0) AS gross,
        COALESCE(sl.displayable_subtotal, 0) AS net,
        COALESCE(sl.calc_tax_1, 0) + COALESCE(sl.calc_tax_2, 0) AS tax
      FROM s
      JOIN sl ON sl.sale_id = s.id
      LEFT JOIN i ON i.id = sl.item_id
      LEFT JOIN c ON c.id = NULLIF(s.customer_id, 0)
      WHERE s.id IN UNNEST(@saleIds)
      ORDER BY s.complete_time, s.id, sl.id
    `,
    { saleIds },
  );

  const sales = new Map<number, ReceiptSale>();
  for (const row of rows) {
    let sale = sales.get(row.sale_id);
    if (!sale) {
      sale = {
        sale_id: row.sale_id,
        ticket_number: row.ticket_number,
        complete_time: row.complete_time,
        customer_name: [row.first_name, row.last_name]
          .map((part) => part.trim())
          .filter(Boolean)
          .join(' '),
        lines: [],
      };
      sales.set(row.sale_id, sale);
    }
    if (isChannelLine(row.description)) {
      continue;
    }
    const line: ReceiptLine = {
      description: row.description,
      quantity: row.quantity,
      unit_price: row.quantity ? row.gross / row.quantity : 0,
      discount: row.gross - row.net,
      subtotal: row.net,
      tax: row.tax,
    };
    sale.lines.push(line);
  }

  return [...sales.values()];
}
