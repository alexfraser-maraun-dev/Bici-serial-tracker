import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import {
  createMappingRule,
  DatabaseRequestError,
  listMappingRules,
} from '@/lib/bigquery-db';
import { parseRuleInput } from '@/lib/rule-input';

export async function GET(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const activeOnly =
      new URL(request.url).searchParams.get('active') === 'true';
    return Response.json(await listMappingRules(activeOnly));
  } catch (error) {
    return apiError(error, 'Failed to fetch mapping rules.');
  }
}

export async function POST(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createMappingRule(parseRuleInput(body), email);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to create mapping rule.');
  }
}
