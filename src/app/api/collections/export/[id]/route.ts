import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { listSerialScans } from '@/lib/bigquery-db';

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

  // Generate CSV
  const columns = [
    { key: 'brand', label: 'brand' },
    { key: 'vendor_id', label: 'vendor ID' },
    { key: 'product_description', label: 'product_description' },
    { key: 'serial_number', label: 'serial_number' },
    { key: 'qty_sold', label: 'qty_sold' },
    { key: 'scanned_by', label: 'scanned_by' },
    { key: 'scanned_at', label: 'scanned_at' },
  ];
  
  const escapeCsv = (val: unknown) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvHeaders = columns.map(col => col.label).join(',');
  const rows = scans.map(scan => 
    columns.map(col => escapeCsv(scan[col.key as keyof typeof scan])).join(',')
  );

  const csvContent = [csvHeaders, ...rows].join('\n');

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="collection_export_${collectionId}.csv"`,
    },
  });
}
