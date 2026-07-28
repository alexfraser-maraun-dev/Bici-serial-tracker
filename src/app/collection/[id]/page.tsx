'use client';

import { useEffect, useState, use } from 'react';
import { apiJson } from '@/lib/api-client';
import type { CollectionRecord, SerialScanRecord } from '@/lib/types';
import Link from 'next/link';
import { ArrowLeft, Trash2 } from 'lucide-react';

type Scan = SerialScanRecord;

export default function CollectionViewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const collectionId = resolvedParams.id;
  
  const [scans, setScans] = useState<Scan[]>([]);
  const [collection, setCollection] = useState<CollectionRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
        apiJson<CollectionRecord>(
          `/api/collections/${encodeURIComponent(collectionId)}`,
        ),
        apiJson<SerialScanRecord[]>(
          `/api/scans?collectionId=${encodeURIComponent(collectionId)}`,
        ),
      ])
      .then(([colData, scanData]) => {
        if (cancelled) return;
        setCollection(colData);
        setScans(scanData);
      })
      .catch(() => {
        if (!cancelled) alert('Failed to load collection scans.');
      });

    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  const handleDelete = async (scanId: string) => {
    if (!confirm('Are you sure you want to delete this scan? This action cannot be undone.')) return;

    try {
      const response = await fetch(
        `/api/scans/${encodeURIComponent(scanId)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to delete scan.');
      }
      setScans(prev => prev.filter(s => s.id !== scanId));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete scan.');
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="btn btn-outline" style={{ padding: '0.5rem' }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 style={{ margin: 0 }}>{collection?.name || 'Loading Collection...'}</h1>
          <p className="text-muted">Total Scans: {scans.length}</p>
        </div>
      </div>

      <div className="card">
        {scans.length === 0 ? (
          <p className="text-muted text-center py-8">No scans found in this collection.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="pb-2">Serial Number</th>
                  <th className="pb-2">Product Description</th>
                  <th className="pb-2">Brand</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Scanned By</th>
                  <th className="pb-2">Scanned At</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scans.map(scan => (
                  <tr key={scan.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-3 font-mono">{scan.serial_number}</td>
                    <td className="py-3">{scan.product_description || '-'}</td>
                    <td className="py-3">{scan.brand || '-'}</td>
                    <td className="py-3">
                      <span className={`badge badge-${scan.match_status === 'matched' || scan.match_status === 'manually_assigned' ? 'success' : 'warning'}`}>
                        {scan.match_status}
                      </span>
                    </td>
                    <td className="py-3 text-sm">{scan.scanned_by}</td>
                    <td className="py-3 text-sm text-muted">{new Date(scan.scanned_at).toLocaleString()}</td>
                    <td className="py-3 text-right">
                      <button 
                        onClick={() => handleDelete(scan.id)} 
                        className="text-error hover:text-red-700 transition-colors p-2"
                        title="Delete Scan"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
