import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import {
  DatabaseRequestError,
  getCollection,
  updateCollection,
} from '@/lib/bigquery-db';
import {
  CollectionInputError,
  parseDateInput,
  parseShopIdsInput,
  validateWindow,
} from '@/lib/collection-input';
import type { CollectionStatus } from '@/lib/types';

const collectionStatuses: CollectionStatus[] = [
  'draft',
  'active',
  'closed',
  'exported',
];

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
    const collection = await getCollection(id);
    if (!collection) {
      return Response.json(
        { error: 'Collection not found.' },
        { status: 404 },
      );
    }
    return Response.json(collection);
  } catch (error) {
    return apiError(error, 'Failed to fetch collection.');
  }
}

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
    const body = await request.json();
    const input: Parameters<typeof updateCollection>[1] = {};

    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return Response.json(
          { error: 'Collection name is required.' },
          { status: 400 },
        );
      }
      input.name = body.name.trim();
    }
    if ('brand' in body) {
      input.brand =
        typeof body.brand === 'string' && body.brand.trim()
          ? body.brand.trim()
          : null;
    }
    if ('status' in body) {
      if (!collectionStatuses.includes(body.status)) {
        return Response.json(
          { error: 'Invalid collection status.' },
          { status: 400 },
        );
      }
      input.status = body.status;
    }
    if ('restricted_skus' in body) {
      input.restricted_skus =
        typeof body.restricted_skus === 'string' && body.restricted_skus
          ? body.restricted_skus
          : null;
    }
    if ('restricted_brands' in body) {
      input.restricted_brands =
        typeof body.restricted_brands === 'string' && body.restricted_brands
          ? body.restricted_brands
          : null;
    }

    if ('starts_on' in body) {
      input.starts_on = parseDateInput(body.starts_on, 'Start date');
    }
    if ('ends_on' in body) {
      input.ends_on = parseDateInput(body.ends_on, 'End date');
    }
    if ('shop_ids' in body) {
      input.shop_ids = parseShopIdsInput(body.shop_ids);
    }
    if (input.starts_on !== undefined || input.ends_on !== undefined) {
      const current = await getCollection(id);
      validateWindow(
        input.starts_on !== undefined ? input.starts_on : current?.starts_on,
        input.ends_on !== undefined ? input.ends_on : current?.ends_on,
      );
    }

    return Response.json(await updateCollection(id, input));
  } catch (error) {
    if (error instanceof CollectionInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to update collection.');
  }
}
