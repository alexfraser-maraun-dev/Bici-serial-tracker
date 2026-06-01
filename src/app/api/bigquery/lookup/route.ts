import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'bici-klaviyo-datasync',
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email?.endsWith('@bici.cc')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const upc = searchParams.get('upc');
  const sku = searchParams.get('sku');

  if (!upc && !sku) {
    return NextResponse.json({ error: 'UPC or SKU is required' }, { status: 400 });
  }

  try {
    const query = `
      SELECT 
        i.upc, 
        i.system_sku, 
        i.manufacturer_sku, 
        i.description, 
        m.name AS brand,
        vn.vendor_id AS vendor_id
      FROM \`bici-klaviyo-datasync.light_speed_retailne.item_history\` i
      LEFT JOIN \`bici-klaviyo-datasync.light_speed_retailne.manufacturer_history\` m 
        ON i.manufacturer_id = m.id
      LEFT JOIN \`bici-klaviyo-datasync.light_speed_retailne.item_vendor_num_history\` vn
        ON i.id = vn.item_id
      WHERE ${upc ? 'i.upc = @upc' : 'CAST(i.system_sku AS STRING) = @sku'}
      LIMIT 1
    `;
    
    // In a real environment with default application credentials, this will work automatically
    const options = {
      query: query,
      params: upc ? { upc } : { sku },
    };

    const [rows] = await bigquery.query(options);

    if (rows.length === 0) {
      return NextResponse.json({ found: false });
    }

    const row = rows[0];
    const product = {
      upc: row.upc || '',
      system_sku: row.system_sku ? String(row.system_sku) : '',
      manufacturer_sku: row.manufacturer_sku || '',
      product_description: row.description || '',
      brand: row.brand || '',
      vendor_id: row.vendor_id ? String(row.vendor_id) : ''
    };

    return NextResponse.json({ found: true, product });
  } catch (error: any) {
    console.error('BigQuery Error:', error);
    return NextResponse.json({ error: 'Failed to query BigQuery', details: error.message }, { status: 500 });
  }
}
