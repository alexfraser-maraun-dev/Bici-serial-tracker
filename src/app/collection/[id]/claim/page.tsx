'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Download, Link2, Unlink, Wand2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { scanMatchesLine } from '@/lib/allocation';
import type { PromoClaimData, QualifyingUnit } from '@/lib/types';

const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

export default function PromoClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: collectionId } = use(params);
  const [data, setData] = useState<PromoClaimData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [selectedScans, setSelectedScans] = useState<Record<string, string>>({});
  const autoLinkAttempted = useRef(false);

  const fetchClaim = useCallback(
    () => apiJson<PromoClaimData>(`/api/collections/${encodeURIComponent(collectionId)}/sales`),
    [collectionId],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await fetchClaim());
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to load promo sales.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchClaim]);

  const runAutoLink = useCallback(async () => {
    setIsLinking(true);
    try {
      await apiJson(`/api/collections/${encodeURIComponent(collectionId)}/links/auto`, {
        method: 'POST',
      });
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to link serials.');
    } finally {
      setIsLinking(false);
    }
  }, [collectionId, load]);

  useEffect(() => {
    let cancelled = false;

    fetchClaim()
      .then(result => {
        if (cancelled) return;
        setData(result);
        if (autoLinkAttempted.current) return;
        autoLinkAttempted.current = true;
        // Fill gaps automatically when there is something to link.
        const canLink = result.units.some(
          unit => !unit.returned && !unit.link &&
            result.unusedScans.some(scan => scanMatchesLine(scan, unit)),
        );
        if (canLink) runAutoLink();
      })
      .catch(error => {
        if (!cancelled) alert(error instanceof Error ? error.message : 'Failed to load promo sales.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchClaim, runAutoLink]);

  const unitId = (unit: QualifyingUnit) => `${unit.sale_line_id}:${unit.unit_index}`;

  const handleUnlink = async (linkId: string) => {
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(linkId)}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to unlink serial.');
      }
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to unlink serial.');
    }
  };

  const handleLink = async (unit: QualifyingUnit) => {
    const scanId = selectedScans[unitId(unit)];
    if (!scanId) return;
    try {
      const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scan_id: scanId,
          sale_line_id: unit.sale_line_id,
          unit_index: unit.unit_index,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to link serial.');
      }
      setSelectedScans(prev => ({ ...prev, [unitId(unit)]: '' }));
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to link serial.');
    }
  };

  const download = (kind: 'claim' | 'receipts') => {
    window.open(`/api/collections/export/${encodeURIComponent(collectionId)}/${kind}`, '_blank');
  };

  const eligible = data?.units.filter(unit => !unit.returned) ?? [];
  const missing = eligible.filter(unit => !unit.link).length;
  const linked = eligible.length - missing;
  const visibleUnits = (data?.units ?? []).filter(unit => !missingOnly || (!unit.returned && !unit.link));

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/collection/${collectionId}`} className="btn btn-outline" style={{ padding: '0.5rem' }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 style={{ margin: 0 }}>Promo Claim</h1>
          <p className="text-muted">
            {data?.collection.name ?? 'Loading...'}
            {data?.collection.starts_on && data.collection.ends_on
              ? ` · ${data.collection.starts_on} to ${data.collection.ends_on}`
              : ''}
          </p>
        </div>
        <div className="flex gap-2" style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={runAutoLink} disabled={isLinking || isLoading || !!data?.configError}>
            <Wand2 size={16} style={{ marginRight: '0.5rem' }} /> {isLinking ? 'Linking...' : 'Auto-link'}
          </button>
          <button className="btn btn-outline" onClick={() => download('claim')} disabled={!data || linked === 0}>
            <Download size={16} style={{ marginRight: '0.5rem' }} /> Claim CSV
          </button>
          <button className="btn btn-primary" onClick={() => download('receipts')} disabled={!data || linked === 0}>
            <Download size={16} style={{ marginRight: '0.5rem' }} /> Receipts PDF
          </button>
        </div>
      </div>

      {data?.configError && (
        <div className="card mb-4" style={{ backgroundColor: 'var(--warning-bg)', borderColor: 'var(--warning)' }}>
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-warning" />
            <span>{data.configError} <Link href="/" style={{ textDecoration: 'underline' }}>Open collections</Link></span>
          </div>
        </div>
      )}

      {data && !data.configError && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="card">
              <div className="text-muted text-sm">Eligible units</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{eligible.length}</div>
            </div>
            <div className="card">
              <div className="text-muted text-sm">Linked to a serial</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success)' }}>{linked}</div>
            </div>
            <div className="card" style={missing > 0 ? { borderColor: 'var(--error)' } : undefined}>
              <div className="text-muted text-sm">Missing a serial</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: missing > 0 ? 'var(--error)' : undefined }}>{missing}</div>
            </div>
          </div>

          {data.unmatchedScans.length > 0 && (
            <div className="card mb-4" style={{ backgroundColor: 'var(--warning-bg)', borderColor: 'var(--warning)' }}>
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-warning" />
                <span>
                  {data.unmatchedScans.length} scan(s) in this collection have no product assigned and can&apos;t be claimed.{' '}
                  <Link href="/unmatched" style={{ textDecoration: 'underline' }}>Assign them</Link>, then run Auto-link.
                </span>
              </div>
            </div>
          )}

          <div className="card mb-6">
            <h3>Coverage by product</h3>
            {data.summary.length === 0 ? (
              <p className="text-muted">No qualifying sales found in this window.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.5rem 0' }}>Product</th>
                      <th style={{ textAlign: 'right' }}>Eligible</th>
                      <th style={{ textAlign: 'right' }}>Linked</th>
                      <th style={{ textAlign: 'right' }}>Missing</th>
                      <th style={{ textAlign: 'right' }}>Unused serials</th>
                      <th style={{ textAlign: 'right' }}>Returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.summary.map(row => (
                      <tr key={row.sku} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.5rem 0' }}>
                          {row.description}
                          <div className="text-muted" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{row.sku}</div>
                        </td>
                        <td style={{ textAlign: 'right' }}>{row.eligible_units}</td>
                        <td style={{ textAlign: 'right' }}>{row.linked_units}</td>
                        <td style={{ textAlign: 'right', color: row.missing_units > 0 ? 'var(--error)' : undefined, fontWeight: row.missing_units > 0 ? 700 : undefined }}>{row.missing_units}</td>
                        <td style={{ textAlign: 'right' }}>{row.unused_serials}</td>
                        <td style={{ textAlign: 'right' }} className="text-muted">{row.returned_units}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 style={{ margin: 0 }}>Qualifying sales</h3>
              <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={missingOnly} onChange={e => setMissingOnly(e.target.checked)} />
                Missing serials only
              </label>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.5rem 0' }}>Receipt #</th>
                    <th>Date</th>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Unit price</th>
                    <th style={{ paddingLeft: '1rem' }}>Serial</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUnits.map(unit => {
                    const options = data.unusedScans.filter(scan => scanMatchesLine(scan, unit));
                    return (
                      <tr key={unitId(unit)} style={{ borderBottom: '1px solid var(--border)', opacity: unit.returned ? 0.55 : 1 }}>
                        <td className="font-mono" style={{ padding: '0.5rem 0', fontFamily: 'monospace' }}>{unit.ticket_number}</td>
                        <td className="text-sm">{new Date(unit.complete_time).toLocaleDateString()}</td>
                        <td className="text-sm">{unit.description}</td>
                        <td className="text-sm" style={{ textAlign: 'right' }}>{money.format(unit.unit_price)}</td>
                        <td style={{ paddingLeft: '1rem' }}>
                          {unit.returned ? (
                            <span className="badge badge-neutral">returned</span>
                          ) : unit.link ? (
                            <div className="flex items-center gap-2">
                              <span style={{ fontFamily: 'monospace' }}>{unit.serial_number}</span>
                              {unit.link.link_method === 'manual' && <span className="badge badge-neutral">manual</span>}
                              <button onClick={() => handleUnlink(unit.link!.id)} className="text-error" title="Unlink serial" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <Unlink size={14} />
                              </button>
                            </div>
                          ) : options.length === 0 ? (
                            <span className="badge badge-error">no serial available</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <select
                                className="input text-sm"
                                style={{ padding: '0.25rem 0.5rem', width: 'auto' }}
                                value={selectedScans[unitId(unit)] ?? ''}
                                onChange={e => setSelectedScans(prev => ({ ...prev, [unitId(unit)]: e.target.value }))}
                              >
                                <option value="">Pick a serial...</option>
                                {options.map(scan => (
                                  <option key={scan.id} value={scan.id}>{scan.serial_number}</option>
                                ))}
                              </select>
                              <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handleLink(unit)} disabled={!selectedScans[unitId(unit)]} title="Link serial">
                                <Link2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleUnits.length === 0 && <p className="text-muted text-center" style={{ padding: '2rem 0' }}>Nothing to show.</p>}
            </div>
          </div>

          <div className="card">
            <h3>Unused serials ({data.unusedScans.length})</h3>
            {data.unusedScans.length === 0 ? (
              <p className="text-muted">Every scanned serial is linked to a sale.</p>
            ) : (
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {data.unusedScans.map(scan => (
                  <span key={scan.id} className="badge badge-neutral" title={scan.product_description ?? ''} style={{ fontFamily: 'monospace' }}>
                    {scan.serial_number} · {scan.product_description}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {isLoading && !data && <p>Loading promo sales...</p>}
    </div>
  );
}
