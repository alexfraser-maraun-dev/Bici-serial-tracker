import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import {
  DatabaseRequestError,
  deleteSerialScan,
  manuallyAssignScan,
} from '@/lib/bigquery-db';

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
    return Response.json(
      await manuallyAssignScan(id, {
        brand: typeof body.brand === 'string' ? body.brand : '',
        vendor_id:
          typeof body.vendor_id === 'string' ? body.vendor_id : '',
        vendor_name:
          typeof body.vendor_name === 'string' ? body.vendor_name : '',
        product_description:
          typeof body.product_description === 'string'
            ? body.product_description
            : '',
        upc: typeof body.upc === 'string' ? body.upc : '',
        system_sku:
          typeof body.system_sku === 'string' ? body.system_sku : '',
        manufacturer_sku:
          typeof body.manufacturer_sku === 'string'
            ? body.manufacturer_sku
            : '',
      }),
    );
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to assign scan.');
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
    await deleteSerialScan(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof DatabaseRequestError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error, 'Failed to delete scan.');
  }
}
