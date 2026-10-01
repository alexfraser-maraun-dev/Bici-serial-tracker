import 'server-only';

import {
  allocate,
  claimableUnits,
  isClaimableScan,
  scanMatchesLine,
  unitKey,
  type UnitKey,
} from '@/lib/allocation';
import {
  DatabaseRequestError,
  deleteLinks,
  getCollection,
  insertLinks,
  listLinks,
  listSerialScans,
} from '@/lib/bigquery-db';
import { splitRestrictionList } from '@/lib/matching';
import { listQualifyingSaleLines } from '@/lib/promo-sales';
import type {
  CollectionRecord,
  PromoClaimData,
  PromoClaimSummary,
  QualifyingSaleLine,
  QualifyingUnit,
  SaleSerialLink,
  SerialScanRecord,
} from '@/lib/types';

type LoadedClaim = {
  collection: CollectionRecord;
  configError: string | null;
  lines: QualifyingSaleLine[];
  scans: SerialScanRecord[];
  validLinks: SaleSerialLink[];
  staleLinks: SaleSerialLink[];
};

function productKeys(collection: CollectionRecord, scans: SerialScanRecord[]) {
  const allowed = splitRestrictionList(collection.restricted_skus);
  if (allowed.length > 0) {
    return allowed;
  }
  // No promo SKU list: every product that was scanned into the collection.
  const keys = new Set<string>();
  for (const scan of scans.filter(isClaimableScan)) {
    if (scan.system_sku?.trim()) keys.add(scan.system_sku.trim().toLowerCase());
    if (scan.upc?.trim()) keys.add(scan.upc.trim().toLowerCase());
  }
  return [...keys];
}

function parseShopIds(value: string | null) {
  return (value ?? '')
    .split(',')
    .map((id) => Number.parseInt(id.trim(), 10))
    .filter(Number.isInteger);
}

async function loadClaim(collectionId: string): Promise<LoadedClaim> {
  const collection = await getCollection(collectionId);
  if (!collection) {
    throw new DatabaseRequestError('Collection not found.', 404, 'NOT_FOUND');
  }

  const [scans, links] = await Promise.all([
    listSerialScans({ collectionId }),
    listLinks(collectionId),
  ]);

  if (!collection.starts_at || !collection.ends_at) {
    return {
      collection,
      configError:
        'Set the promo start and end dates in the collection settings to find qualifying sales.',
      lines: [],
      scans,
      validLinks: [],
      staleLinks: links,
    };
  }

  const lines = await listQualifyingSaleLines({
    startsAt: collection.starts_at,
    endsAt: collection.ends_at,
    shopIds: parseShopIds(collection.shop_ids),
    productKeys: productKeys(collection, scans),
  });

  // A link stays valid only while its unit still qualifies (window, shops and
  // returns can change) and its serial still belongs to the same product.
  const unitLines = new Map(
    claimableUnits(lines).map(({ line, unit_index }) => [
      unitKey({ sale_line_id: line.sale_line_id, unit_index }),
      line,
    ]),
  );
  const scansById = new Map(scans.map((scan) => [scan.id, scan]));
  const validLinks: SaleSerialLink[] = [];
  const staleLinks: SaleSerialLink[] = [];
  for (const link of links) {
    const line = unitLines.get(unitKey(link));
    const scan = scansById.get(link.scan_id);
    if (line && scan && isClaimableScan(scan) && scanMatchesLine(scan, line)) {
      validLinks.push(link);
    } else {
      staleLinks.push(link);
    }
  }

  return { collection, configError: null, lines, scans, validLinks, staleLinks };
}

export async function getPromoClaimData(
  collectionId: string,
): Promise<PromoClaimData> {
  const { collection, configError, lines, scans, validLinks } =
    await loadClaim(collectionId);

  const linksByUnit = new Map(validLinks.map((link) => [unitKey(link), link]));
  const scansById = new Map(scans.map((scan) => [scan.id, scan]));
  const usedScanIds = new Set(validLinks.map((link) => link.scan_id));

  const units: QualifyingUnit[] = lines.flatMap((line) =>
    Array.from({ length: line.unit_quantity }, (_, unit_index) => {
      const link =
        linksByUnit.get(
          unitKey({ sale_line_id: line.sale_line_id, unit_index }),
        ) ?? null;
      return {
        ...line,
        unit_index,
        // Returns are attributed to the highest unit indexes of a line.
        returned: unit_index >= line.unit_quantity - line.returned_quantity,
        link,
        serial_number: link
          ? (scansById.get(link.scan_id)?.serial_number ?? null)
          : null,
      };
    }),
  );

  const unusedScans = scans.filter(
    (scan) => isClaimableScan(scan) && !usedScanIds.has(scan.id),
  );
  const unmatchedScans = scans.filter((scan) => !isClaimableScan(scan));

  const summaryBySku = new Map<string, PromoClaimSummary>();
  for (const unit of units) {
    let row = summaryBySku.get(unit.system_sku);
    if (!row) {
      row = {
        sku: unit.system_sku,
        description: unit.description,
        eligible_units: 0,
        linked_units: 0,
        missing_units: 0,
        unused_serials: unusedScans.filter((scan) =>
          scanMatchesLine(scan, unit),
        ).length,
        returned_units: 0,
      };
      summaryBySku.set(unit.system_sku, row);
    }
    if (unit.returned) {
      row.returned_units += 1;
    } else {
      row.eligible_units += 1;
      if (unit.link) row.linked_units += 1;
      else row.missing_units += 1;
    }
  }

  return {
    collection,
    units,
    unusedScans,
    unmatchedScans,
    summary: [...summaryBySku.values()].sort((a, b) =>
      a.description.localeCompare(b.description),
    ),
    configError,
  };
}

/**
 * Removes links that no longer qualify, then links every remaining sale unit
 * it can to an unused serial of the same product.
 */
export async function autoLink(collectionId: string, linkedBy: string) {
  const { lines, scans, validLinks, staleLinks } =
    await loadClaim(collectionId);

  const removed = await deleteLinks(
    collectionId,
    staleLinks.map((link) => link.id),
  );
  const proposed = allocate(lines, scans, validLinks);
  const linked = await insertLinks(collectionId, proposed, 'auto', linkedBy);
  return { linked, removed };
}

export async function linkManually(
  collectionId: string,
  input: UnitKey & { scan_id: string },
  linkedBy: string,
) {
  const { lines, scans, validLinks, staleLinks } =
    await loadClaim(collectionId);
  await deleteLinks(
    collectionId,
    staleLinks.map((link) => link.id),
  );

  const line = claimableUnits(lines).find(
    ({ line, unit_index }) =>
      line.sale_line_id === input.sale_line_id &&
      unit_index === input.unit_index,
  )?.line;
  if (!line) {
    throw new DatabaseRequestError(
      'That sale unit does not qualify for this promo.',
      422,
      'UNIT_NOT_ELIGIBLE',
    );
  }

  const scan = scans.find((candidate) => candidate.id === input.scan_id);
  if (!scan || !isClaimableScan(scan)) {
    throw new DatabaseRequestError(
      'That serial is not a matched scan in this collection.',
      422,
      'SCAN_NOT_ELIGIBLE',
    );
  }
  if (!scanMatchesLine(scan, line)) {
    throw new DatabaseRequestError(
      'That serial belongs to a different product.',
      422,
      'PRODUCT_MISMATCH',
    );
  }
  if (
    validLinks.some(
      (link) =>
        link.scan_id === scan.id || unitKey(link) === unitKey(input),
    )
  ) {
    throw new DatabaseRequestError(
      'That serial or sale unit is already linked.',
      409,
      'ALREADY_LINKED',
    );
  }

  const linked = await insertLinks(
    collectionId,
    [{ ...input, sale_id: line.sale_id }],
    'manual',
    linkedBy,
  );
  if (linked === 0) {
    throw new DatabaseRequestError(
      'That serial or sale unit is already linked.',
      409,
      'ALREADY_LINKED',
    );
  }
}

export type ClaimRow = {
  receipt_number: string;
  sale_date: string;
  brand: string;
  product_description: string;
  system_sku: string;
  manufacturer_sku: string;
  upc: string;
  serial_number: string;
  qty_sold_on_transaction: number;
  unit_sale_price: number;
};

const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Vancouver',
});

/** One row per linked serial, plus the sales that need receipts. */
export async function getClaimExport(collectionId: string) {
  const { collection, units } = await getPromoClaimData(collectionId);

  const claimed = units.filter((unit) => !unit.returned);
  const qtyBySaleItem = new Map<string, number>();
  for (const unit of claimed) {
    const key = `${unit.sale_id}:${unit.item_id}`;
    qtyBySaleItem.set(key, (qtyBySaleItem.get(key) ?? 0) + 1);
  }

  const rows: ClaimRow[] = claimed
    .filter((unit) => unit.link && unit.serial_number)
    .map((unit) => ({
      receipt_number: unit.ticket_number,
      sale_date: localDate.format(new Date(unit.complete_time)),
      brand: unit.brand,
      product_description: unit.description,
      system_sku: unit.system_sku,
      manufacturer_sku: unit.manufacturer_sku,
      upc: unit.upc,
      serial_number: unit.serial_number ?? '',
      qty_sold_on_transaction:
        qtyBySaleItem.get(`${unit.sale_id}:${unit.item_id}`) ?? 0,
      unit_sale_price: unit.unit_price,
    }));

  const saleIds = [...new Set(
    claimed.filter((unit) => unit.link).map((unit) => unit.sale_id),
  )];

  return { collection, rows, saleIds };
}
