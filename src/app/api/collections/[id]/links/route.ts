import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { DatabaseRequestError } from '@/lib/bigquery-db';
import { linkManually } from '@/lib/promo-claim';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const scanId = typeof body.scan_id === 'string' ? body.scan_id : '';
    const saleLineId = Number(body.sale_line_id);
    const unitIndex = Number(body.unit_index);

    if (
      !scanId ||
      !Number.isInteger(saleLineId) ||
      !Number.isInteger(unitIndex)
    ) {
      return Response.json(
        { error: 'A serial and sale unit are required.' },
        { status: 400 },
      );
    }

    await linkManually(
      id,
      { scan_id: scanId, sale_line_id: saleLineId, unit_index: unitIndex },
      email,
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to link serial.');
  }
}
