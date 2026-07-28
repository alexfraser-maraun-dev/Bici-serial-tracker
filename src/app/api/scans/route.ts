import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import {
  createSerialScan,
  DatabaseRequestError,
  listSerialScans,
} from '@/lib/bigquery-db';
import type { MatchStatus } from '@/lib/types';

const matchStatuses: MatchStatus[] = [
  'pending_match',
  'matched',
  'unmatched',
  'manually_assigned',
];

export async function GET(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const collectionId = searchParams.get('collectionId') || undefined;
  const matchStatus = searchParams.get('status') || undefined;

  if (!collectionId && !matchStatus) {
    return Response.json(
      { error: 'A collection or match status filter is required.' },
      { status: 400 },
    );
  }
  if (matchStatus && !matchStatuses.includes(matchStatus as MatchStatus)) {
    return Response.json(
      { error: 'Invalid match status.' },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await listSerialScans({
        collectionId,
        matchStatus: matchStatus as MatchStatus | undefined,
      }),
    );
  } catch (error) {
    return apiError(error, 'Failed to fetch scans.');
  }
}

export async function POST(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const collectionId =
      typeof body.collection_id === 'string' ? body.collection_id : '';
    const serialNumber =
      typeof body.serial_number === 'string' ? body.serial_number : '';

    if (!collectionId || !serialNumber) {
      return Response.json(
        { error: 'Collection and serial number are required.' },
        { status: 400 },
      );
    }

    return Response.json(
      await createSerialScan(collectionId, serialNumber, email),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to save scan.');
  }
}
