import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { DatabaseRequestError } from '@/lib/bigquery-db';
import { getPromoClaimData } from '@/lib/promo-claim';

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
    return Response.json(await getPromoClaimData(id));
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to load promo sales.');
  }
}
