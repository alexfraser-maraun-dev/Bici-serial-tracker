import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { DatabaseRequestError } from '@/lib/bigquery-db';
import { toCsv, type CsvColumn } from '@/lib/csv';
import { getClaimExport, type ClaimRow } from '@/lib/promo-claim';

const columns: CsvColumn<ClaimRow>[] = [
  { label: 'receipt_number', value: (row) => row.receipt_number },
  { label: 'sale_date', value: (row) => row.sale_date },
  { label: 'brand', value: (row) => row.brand },
  { label: 'product_description', value: (row) => row.product_description },
  { label: 'system_sku', value: (row) => row.system_sku },
  { label: 'manufacturer_sku', value: (row) => row.manufacturer_sku },
  { label: 'upc', value: (row) => row.upc },
  { label: 'serial_number', value: (row) => row.serial_number },
  {
    label: 'qty_sold_on_transaction',
    value: (row) => row.qty_sold_on_transaction,
  },
  { label: 'unit_sale_price', value: (row) => row.unit_sale_price.toFixed(2) },
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { rows } = await getClaimExport(id);
    return new Response(toCsv(columns, rows), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="promo_claim_${id}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to export promo claim.');
  }
}
