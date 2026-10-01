import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { DatabaseRequestError, deleteLink } from '@/lib/bigquery-db';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    await deleteLink(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to unlink serial.');
  }
}
