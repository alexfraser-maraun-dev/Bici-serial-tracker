import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { listSerialScans } from '@/lib/bigquery-db';
import { toCsv, type CsvColumn } from '@/lib/csv';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let scans;
  let collectionId;
  try {
    ({ id: collectionId } = await params);
    scans = await listSerialScans({ collectionId });
  } catch (error) {
    return apiError(error, 'Failed to fetch scans.');
  }

  const columns: CsvColumn<(typeof scans)[number]>[] = [
    { label: 'brand', value: (scan) => scan.brand },
    { label: 'vendor ID', value: (scan) => scan.vendor_id },
    { label: 'product_description', value: (scan) => scan.product_description },
    { label: 'serial_number', value: (scan) => scan.serial_number },
    { label: 'qty_sold', value: (scan) => scan.qty_sold },
    { label: 'scanned_by', value: (scan) => scan.scanned_by },
    { label: 'scanned_at', value: (scan) => scan.scanned_at },
  ];

  const csvContent = toCsv(columns, scans);

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="collection_export_${collectionId}.csv"`,
    },
  });
}
