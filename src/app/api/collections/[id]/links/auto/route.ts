import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { DatabaseRequestError } from '@/lib/bigquery-db';
import { autoLink } from '@/lib/promo-claim';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    return Response.json(await autoLink(id, email));
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to link serials.');
  }
}
