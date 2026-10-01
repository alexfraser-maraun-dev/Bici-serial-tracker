'use client';

import { useEffect, useState, useRef, use } from 'react';
import { ApiClientError, apiJson } from '@/lib/api-client';
import { normalizeSerial } from '@/lib/matching';
import type { CollectionRecord, SerialScanRecord } from '@/lib/types';
import { useSession } from 'next-auth/react';
import { CheckCircle2, AlertCircle, Clock, XCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type ScanRow = {
  id: string; // Temporary UUID for UI
  serial_number: string;
  normalized_serial_number: string;
  status: 'pending' | 'saved' | 'matched' | 'unmatched' | 'duplicate' | 'error';
  product_description?: string;
  timestamp: Date;
};

export default function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const collectionId = resolvedParams.id;
  const { data: session } = useSession();
  
  const [inputValue, setInputValue] = useState('');
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [collection, setCollection] = useState<CollectionRecord | null>(null);
  const [sessionScanCount, setSessionScanCount] = useState(0);
  
  // Session duplicates Set
  const sessionScans = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

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
      .then(([colData, existingScans]) => {
        if (cancelled) return;
        setCollection(colData);
        existingScans.forEach(s =>
          sessionScans.current.add(normalizeSerial(s.normalized_serial_number)),
        );
        setSessionScanCount(sessionScans.current.size);
      })
      .catch(() => {
        if (!cancelled) alert('Failed to load collection data.');
      })
      .finally(() => {
        if (!cancelled) inputRef.current?.focus();
      });

    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue || !session?.user?.email) return;

    const rawSerial = inputValue;
    const normalized = normalizeSerial(rawSerial);
    
    // Reset input instantly
    setInputValue('');
    inputRef.current?.focus();

    if (!normalized) return;

    const uiId = crypto.randomUUID();
    
    // Duplicate Check 1 & 2: Local Session / Preloaded Database
    if (sessionScans.current.has(normalized)) {
      const duplicateScan: ScanRow = {
        id: uiId,
        serial_number: rawSerial,
        normalized_serial_number: normalized,
        status: 'duplicate',
        timestamp: new Date()
      };
      setScans(prev => [duplicateScan, ...prev]);
      return;
    }

    sessionScans.current.add(normalized);
    setSessionScanCount(sessionScans.current.size);

    const initialStatus: ScanRow['status'] = 'pending';

    // Add to UI state
    const newScanRow: ScanRow = {
      id: uiId,
      serial_number: rawSerial,
      normalized_serial_number: normalized,
      status: initialStatus,
      product_description: 'Pending matching...',
      timestamp: new Date()
    };
    
    setScans(prev => [newScanRow, ...prev]);

    try {
      const savedScan = await apiJson<SerialScanRecord>('/api/scans', {
        method: 'POST',
        body: JSON.stringify({
          collection_id: collectionId,
          serial_number: rawSerial,
        }),
      });
      setScans(prev => prev.map(s => s.id === uiId ? {
        ...s,
        status: savedScan.match_status === 'matched' ? 'matched' : 'unmatched',
        product_description: savedScan.product_description || 'No mapping found.',
      } : s));
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'DUPLICATE_SERIAL') {
        setScans(prev => prev.map(s => s.id === uiId ? { ...s, status: 'duplicate' as ScanRow['status'], product_description: 'Already scanned in this collection.' } : s));
      } else {
        const message = error instanceof Error ? error.message : 'Failed to save to database.';
        setScans(prev => prev.map(s => s.id === uiId ? { ...s, status: 'error' as ScanRow['status'], product_description: message } : s));
        sessionScans.current.delete(normalized); // Remove from local cache so they can try again
        setSessionScanCount(sessionScans.current.size);
      }
    }
  };

  const getStatusIcon = (status: ScanRow['status']) => {
    switch (status) {
      case 'matched': return <CheckCircle2 className="text-success" size={20} />;
      case 'unmatched': return <CheckCircle2 className="text-warning" size={20} />;
      case 'duplicate': return <XCircle className="text-error" size={20} />;
      case 'error': return <AlertCircle className="text-error" size={20} />;
      case 'pending': return <Clock className="text-muted" size={20} />;
      default: return null;
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="btn btn-outline" style={{ padding: '0.5rem' }}>
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 style={{ margin: 0 }}>Live Scanning</h1>
            <p className="text-muted">{collection?.name || 'Loading...'}</p>
          </div>
        </div>
        <div className="card" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="text-muted text-sm">Session Scans</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{sessionScanCount}</div>
        </div>
      </div>

      <div className="card mb-6" style={{ backgroundColor: 'var(--primary-hover)', borderColor: 'var(--primary)' }}>
        <form onSubmit={handleScanSubmit}>
          <input 
            ref={inputRef}
            type="text" 
            className="input scan-input" 
            placeholder="SCAN SERIAL NUMBER HERE"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
            autoComplete="off"
            style={{ 
              backgroundColor: 'var(--surface)', 
              borderColor: 'var(--primary)',
              borderWidth: '2px',
              boxShadow: '0 0 15px rgba(37, 99, 235, 0.3)'
            }}
          />
        </form>
        <p className="text-center mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
          Scanner should submit with Enter automatically. Keep this input focused.
        </p>
      </div>

      <div>
        <h3 className="mb-4">Recent Scans</h3>
        <div className="flex flex-col gap-2">
          {scans.length === 0 ? (
            <div className="card text-center text-muted" style={{ padding: '3rem 1rem' }}>
              No scans yet in this session. Start scanning above!
            </div>
          ) : (
            scans.map(scan => (
              <div key={scan.id} className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: scan.status === 'duplicate' || scan.status === 'error' ? 'var(--error-bg)' : 'var(--surface)' }}>
                <div className="flex items-center gap-4">
                  {getStatusIcon(scan.status)}
                  <div>
                    <div style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.1rem' }}>
                      {scan.normalized_serial_number}
                    </div>
                    <div className="text-sm text-muted">
                      {scan.product_description}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`badge badge-${scan.status === 'matched' ? 'success' : scan.status === 'duplicate' || scan.status === 'error' ? 'error' : scan.status === 'unmatched' ? 'warning' : 'neutral'}`}>
                    {scan.status}
                  </span>
                  <span className="text-xs text-muted">
                    {scan.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
