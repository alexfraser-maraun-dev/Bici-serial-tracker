import { getAuthenticatedEmail, apiError } from '@/lib/api-auth';
import { lightspeedTable, queryRows } from '@/lib/bigquery';

export async function GET(req: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const upc = searchParams.get('upc');
  const sku = searchParams.get('sku');

  if (!upc && !sku) {
    return Response.json({ error: 'UPC or SKU is required' }, { status: 400 });
  }

  try {
    const query = `
      SELECT 
        i.upc, 
        i.system_sku, 
        i.manufacturer_sku, 
        i.description, 
        m.name AS brand,
        vn.vendor_id AS vendor_id,
        v.name AS vendor_name
      FROM ${lightspeedTable('item_history')} i
      LEFT JOIN ${lightspeedTable('manufacturer_history')} m
        ON i.manufacturer_id = m.id
      LEFT JOIN ${lightspeedTable('item_vendor_num_history')} vn
        ON i.id = vn.item_id
      LEFT JOIN ${lightspeedTable('vendor_history')} v
        ON vn.vendor_id = v.id
      WHERE ${upc ? 'i.upc = @upc' : 'CAST(i.system_sku AS STRING) = @sku'}
      LIMIT 1
    `;
    
    const rows = await queryRows<Record<string, unknown>>(
      query,
      upc ? { upc } : { sku },
    );

    if (rows.length === 0) {
      return Response.json({ found: false });
    }

    const row = rows[0];
    const product = {
      upc: row.upc ? String(row.upc) : '',
      system_sku: row.system_sku ? String(row.system_sku) : '',
      manufacturer_sku: row.manufacturer_sku ? String(row.manufacturer_sku) : '',
      product_description: row.description ? String(row.description) : '',
      brand: row.brand ? String(row.brand) : '',
      vendor_id: row.vendor_id ? String(row.vendor_id) : '',
      vendor_name: row.vendor_name ? String(row.vendor_name) : ''
    };

    return Response.json({ found: true, product });
  } catch (error) {
    return apiError(error, 'Failed to query BigQuery.');
  }
}
