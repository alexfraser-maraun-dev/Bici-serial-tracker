import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { listShops } from '@/lib/promo-sales';

export async function GET() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return Response.json(await listShops());
  } catch (error) {
    return apiError(error, 'Failed to fetch shops.');
  }
}
