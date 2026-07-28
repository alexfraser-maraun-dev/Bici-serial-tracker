import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import {
  DatabaseRequestError,
  deleteMappingRule,
  updateMappingRule,
} from '@/lib/bigquery-db';
import { parseRuleInput } from '@/lib/rule-input';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    return Response.json(await updateMappingRule(id, parseRuleInput(body)));
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to update mapping rule.');
  }
}

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
    await deleteMappingRule(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to delete mapping rule.');
  }
}
