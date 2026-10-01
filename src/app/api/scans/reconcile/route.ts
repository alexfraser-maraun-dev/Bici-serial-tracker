import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { reconcileAllUnmatchedScans } from '@/lib/bigquery-db';

export async function POST() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return Response.json({
      reconciledCount: await reconcileAllUnmatchedScans(),
    });
  } catch (error) {
    return apiError(error, 'Failed to re-run mapping rules.');
  }
}
