import type { QualifyingSaleLine, SerialScanRecord } from '@/lib/types';

export type UnitKey = { sale_line_id: number; unit_index: number };

export type ProposedLink = UnitKey & {
  sale_id: number;
  scan_id: string;
};

type LinkRef = UnitKey & { scan_id: string };

export function unitKey(unit: UnitKey) {
  return `${unit.sale_line_id}:${unit.unit_index}`;
}

export function isClaimableScan(scan: SerialScanRecord) {
  return (
    scan.match_status === 'matched' ||
    scan.match_status === 'manually_assigned'
  );
}

/** True when a scanned serial belongs to the same product as a sale line. */
export function scanMatchesLine(
  scan: Pick<SerialScanRecord, 'system_sku' | 'upc'>,
  line: Pick<QualifyingSaleLine, 'system_sku' | 'upc'>,
) {
  const scanSku = scan.system_sku?.trim() ?? '';
  const scanUpc = scan.upc?.trim().toLowerCase() ?? '';
  return (
    (scanSku !== '' && scanSku === line.system_sku) ||
    (scanUpc !== '' && scanUpc === line.upc.trim().toLowerCase())
  );
}

/** Expands sale lines into one entry per sold unit that was not returned. */
export function claimableUnits(lines: QualifyingSaleLine[]) {
  return lines.flatMap((line) =>
    Array.from(
      { length: line.unit_quantity - line.returned_quantity },
      (_, unit_index) => ({ line, unit_index }),
    ),
  );
}

/**
 * Pairs every unlinked sale unit with an unused serial of the same product.
 * Serials are attributed, not traced, so the only goal is coverage; sorting
 * just keeps re-runs stable. Existing links are never changed.
 */
export function allocate(
  lines: QualifyingSaleLine[],
  scans: SerialScanRecord[],
  existingLinks: LinkRef[],
): ProposedLink[] {
  const linkedUnits = new Set(existingLinks.map(unitKey));
  const usedScans = new Set(existingLinks.map((link) => link.scan_id));

  const openScans = scans
    .filter((scan) => isClaimableScan(scan) && !usedScans.has(scan.id))
    .sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));

  const openUnits = claimableUnits(lines)
    .filter(
      ({ line, unit_index }) =>
        !linkedUnits.has(
          unitKey({ sale_line_id: line.sale_line_id, unit_index }),
        ),
    )
    .sort(
      (a, b) =>
        a.line.complete_time.localeCompare(b.line.complete_time) ||
        a.line.sale_line_id - b.line.sale_line_id ||
        a.unit_index - b.unit_index,
    );

  const proposed: ProposedLink[] = [];
  for (const { line, unit_index } of openUnits) {
    const index = openScans.findIndex((scan) => scanMatchesLine(scan, line));
    if (index === -1) continue;
    const [scan] = openScans.splice(index, 1);
    proposed.push({
      sale_id: line.sale_id,
      sale_line_id: line.sale_line_id,
      unit_index,
      scan_id: scan.id,
    });
  }
  return proposed;
}
