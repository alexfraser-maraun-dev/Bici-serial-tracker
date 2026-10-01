import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { DatabaseRequestError } from '@/lib/bigquery-db';
import { getClaimExport } from '@/lib/promo-claim';
import { getReceipts } from '@/lib/promo-sales';
import { renderReceiptsPdf } from '@/lib/receipt-pdf';

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
    const { saleIds } = await getClaimExport(id);
    const pdf = await renderReceiptsPdf(await getReceipts(saleIds));
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="promo_receipts_${id}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to export receipts.');
  }
}
