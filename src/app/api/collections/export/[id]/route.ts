import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email?.endsWith('@bici.cc')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const collectionId = resolvedParams.id;

  const { data: scans, error } = await supabase
    .from('serial_scans')
    .select('brand, vendor_id, product_description, serial_number, qty_sold, scanned_by, scanned_at')
    .eq('collection_id', collectionId);

  if (error || !scans) {
    return NextResponse.json({ error: 'Failed to fetch scans' }, { status: 500 });
  }

  // Generate CSV
  const columns = [
    { key: 'brand', label: 'brand' },
    { key: 'vendor_id', label: 'vendor ID' },
    { key: 'product_description', label: 'product_description' },
    { key: 'serial_number', label: 'serial_number' },
    { key: 'qty_sold', label: 'qty_sold' },
    { key: 'scanned_by', label: 'scanned_by' },
    { key: 'scanned_at', label: 'scanned_at' },
  ];
  
  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvHeaders = columns.map(col => col.label).join(',');
  const rows = scans.map(scan => 
    columns.map(col => escapeCsv(scan[col.key as keyof typeof scan])).join(',')
  );

  const csvContent = [csvHeaders, ...rows].join('\n');

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="collection_export_${collectionId}.csv"`,
    },
  });
}
