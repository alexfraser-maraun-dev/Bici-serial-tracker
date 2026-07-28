import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import {
  createCollection,
  DatabaseRequestError,
  listCollections,
} from '@/lib/bigquery-db';
import type { CollectionStatus } from '@/lib/types';

const collectionStatuses: CollectionStatus[] = [
  'draft',
  'active',
  'closed',
  'exported',
];

export async function GET() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return Response.json(await listCollections());
  } catch (error) {
    return apiError(error, 'Failed to fetch collections.');
  }
}

export async function POST(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const status = body.status ?? 'active';

    if (!name) {
      return Response.json(
        { error: 'Collection name is required.' },
        { status: 400 },
      );
    }
    if (!collectionStatuses.includes(status)) {
      return Response.json(
        { error: 'Invalid collection status.' },
        { status: 400 },
      );
    }

    const collection = await createCollection(
      {
        name,
        brand: typeof body.brand === 'string' ? body.brand.trim() : null,
        status,
        restricted_skus:
          typeof body.restricted_skus === 'string'
            ? body.restricted_skus
            : null,
        restricted_brands:
          typeof body.restricted_brands === 'string'
            ? body.restricted_brands
            : null,
      },
      email,
    );
    return Response.json(collection, { status: 201 });
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to create collection.');
  }
}
