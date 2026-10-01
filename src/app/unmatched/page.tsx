'use client';

import React, { useEffect, useState } from 'react';
import { ApiClientError, apiJson } from '@/lib/api-client';
import { findMatchingRule, normalizeSerial } from '@/lib/matching';
import type { MappingRuleRecord, SerialScanRecord } from '@/lib/types';
import { Edit2, CheckCircle2, Trash2, RefreshCw } from 'lucide-react';

const DEFAULT_PREFIX_LENGTH = 3;

type Scan = {
  id: string;
  serial_number: string;
  normalized_serial_number: string;
  scanned_at: string;
  collection_id: string;
};

export default function UnmatchedPage() {
  const [unmatched, setUnmatched] = useState<Scan[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Edit form state
  const [brand, setBrand] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [upc, setUpc] = useState('');
  const [systemSku, setSystemSku] = useState('');
  const [manufacturerSku, setManufacturerSku] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [saveRule, setSaveRule] = useState(true);
  const [rulePrefix, setRulePrefix] = useState('');
  const [rules, setRules] = useState<MappingRuleRecord[]>([]);
  const [isReconciling, setIsReconciling] = useState(false);

  useEffect(() => {
    fetchUnmatched();
    fetchRules();
  }, []);

  async function fetchRules() {
    try {
      setRules(await apiJson<MappingRuleRecord[]>('/api/mapping-rules?active=true'));
    } catch {
      setRules([]);
    }
  }

  const editingScan = unmatched.find(scan => scan.id === editingId) ?? null;
  const existingRule = editingScan
    ? findMatchingRule(normalizeSerial(editingScan.serial_number), rules)
    : null;
  const normalizedPrefix = normalizeSerial(rulePrefix);
  const prefixMatchesSerial =
    !!editingScan && !!normalizedPrefix &&
    normalizeSerial(editingScan.serial_number).startsWith(normalizedPrefix);
  const overlappingRules = normalizedPrefix
    ? rules.filter(rule => {
        if (rule.match_type !== 'prefix') return false;
        const other = normalizeSerial(rule.match_value);
        return other.startsWith(normalizedPrefix) || normalizedPrefix.startsWith(other);
      })
    : [];

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      const result = await apiJson<{ reconciledCount: number }>('/api/scans/reconcile', { method: 'POST' });
      alert(
        result.reconciledCount > 0
          ? `${result.reconciledCount} scan${result.reconciledCount === 1 ? '' : 's'} matched an existing rule.`
          : 'No unmatched scans match an existing rule.',
      );
      fetchUnmatched();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to re-run mapping rules.');
    } finally {
      setIsReconciling(false);
    }
  };

  async function fetchUnmatched() {
    try {
      setUnmatched(
        await apiJson<SerialScanRecord[]>('/api/scans?status=unmatched'),
      );
    } catch {
      alert('Failed to load unmatched scans.');
    }
  }

  const [isSearching, setIsSearching] = useState(false);

  const startEditing = (scan: Scan) => {
    setEditingId(scan.id);
    setBrand('');
    setVendorId('');
    setProductDescription('');
    setUpc('');
    setSystemSku('');
    setManufacturerSku('');
    setVendorName('');
    setRulePrefix(normalizeSerial(scan.serial_number).slice(0, DEFAULT_PREFIX_LENGTH));
    setSaveRule(!findMatchingRule(normalizeSerial(scan.serial_number), rules));
  };

  const handleUpcSearch = async () => {
    if (!upc) return;
    
    setIsSearching(true);
    try {
      const res = await fetch(`/api/bigquery/lookup?upc=${encodeURIComponent(upc)}`);
      const data = await res.json();
      
      if (res.ok) {
        if (data.found) {
          setBrand(data.product.brand || '');
          setVendorId(data.product.vendor_id || '');
          setProductDescription(data.product.product_description || '');
          setSystemSku(data.product.system_sku || '');
          setManufacturerSku(data.product.manufacturer_sku || '');
          setVendorName(data.product.vendor_name || '');
        } else {
          alert('Product not found in BigQuery. Please enter details manually.');
        }
      } else {
        alert(`BigQuery Error: ${data.details || data.error || 'Unknown error'}`);
      }
    } catch (err: unknown) {
      console.error(err);
      alert('Error searching BigQuery. Check the console.');
    }
    setIsSearching(false);
  };

  const handleSave = async (id: string) => {
    if (!productDescription) {
      alert('Product Description is required.');
      return;
    }
    if (saveRule && !prefixMatchesSerial) {
      alert('The rule prefix must match the start of this serial number.');
      return;
    }

    const product = {
      brand,
      vendor_id: vendorId,
      vendor_name: vendorName,
      product_description: productDescription,
      upc,
      system_sku: systemSku,
      manufacturer_sku: manufacturerSku,
    };

    try {
      let reconciledCount = 0;
      if (saveRule) {
        // Saving the rule also matches existing unmatched scans, usually
        // including this one.
        const result = await apiJson<{ reconciledCount: number }>('/api/mapping-rules', {
          method: 'POST',
          body: JSON.stringify({
            ...product,
            match_type: 'prefix',
            match_value: normalizedPrefix,
            priority: 10,
            active: true,
          }),
        });
        reconciledCount = result.reconciledCount;
      }

      try {
        await apiJson(`/api/scans/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(product),
        });
      } catch (error) {
        const matchedByRule =
          saveRule && error instanceof ApiClientError && error.code === 'SCAN_ALREADY_ASSIGNED';
        if (!matchedByRule) throw error;
      }

      if (saveRule) {
        const others = Math.max(reconciledCount - 1, 0);
        alert(
          `Rule saved: serials starting with "${normalizedPrefix}" will match ${productDescription}.` +
          (others > 0 ? ` ${others} other unmatched scan${others === 1 ? '' : 's'} also matched.` : ''),
        );
        fetchRules();
      }
      setEditingId(null);
      fetchUnmatched();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : 'Failed to save manually assigned data.',
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this scan?')) return;
    
    try {
      const response = await fetch(`/api/scans/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to delete scan.');
      }
      fetchUnmatched();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete scan.');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1>Unmatched Scans</h1>
        <button onClick={handleReconcile} className="btn btn-outline" disabled={isReconciling || unmatched.length === 0} title="Match unmatched scans against the current mapping rules">
          <RefreshCw size={16} style={{ marginRight: '0.5rem' }} /> {isReconciling ? 'Re-running...' : 'Re-run Rules'}
        </button>
      </div>

      <div className="card">
        {unmatched.length === 0 ? (
          <p className="text-muted text-center py-8">No unmatched scans found. Great job!</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th className="pb-2">Serial Number</th>
                <th className="pb-2">Scanned At</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.map(scan => (
                <React.Fragment key={scan.id}>
                  <tr style={{ borderBottom: editingId === scan.id ? 'none' : '1px solid var(--border)' }}>
                    <td className="py-3 font-mono">{scan.serial_number}</td>
                    <td className="py-3 text-muted">{new Date(scan.scanned_at).toLocaleString()}</td>
                    <td className="py-3 text-right">
                      {editingId === scan.id ? (
                        <button onClick={() => setEditingId(null)} className="btn btn-outline text-sm">Cancel</button>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEditing(scan)} className="btn btn-outline text-sm">
                            <Edit2 size={16} className="mr-2" /> Assign Product
                          </button>
                          <button onClick={() => handleDelete(scan.id)} className="btn btn-outline text-error text-sm" style={{ padding: '0.5rem' }} title="Delete Scan">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {editingId === scan.id && (
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={3} className="py-4">
                        <div className="card" style={{ backgroundColor: 'var(--background)' }}>
                          <h4 className="mb-4">Assign Product Data</h4>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <input className="input" placeholder="Product Description *" value={productDescription} onChange={e => setProductDescription(e.target.value)} required />
                            <input className="input" placeholder="Brand" value={brand} onChange={e => setBrand(e.target.value)} />
                            <input className="input" placeholder="Vendor ID" value={vendorId} onChange={e => setVendorId(e.target.value)} />
                            <div className="flex gap-2">
                              <input className="input flex-1" placeholder="UPC" value={upc} onChange={e => setUpc(e.target.value)} />
                              <button type="button" onClick={handleUpcSearch} disabled={isSearching || !upc} className="btn btn-outline">
                                {isSearching ? '...' : 'Lookup'}
                              </button>
                            </div>
                            <input className="input" placeholder="System SKU" value={systemSku} onChange={e => setSystemSku(e.target.value)} />
                            <input className="input" placeholder="Manufacturer SKU" value={manufacturerSku} onChange={e => setManufacturerSku(e.target.value)} />
                          </div>
                          <div className="mb-4" style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface)' }}>
                            {existingRule && (
                              <p className="text-sm mb-4" style={{ color: 'var(--warning)' }}>
                                Existing rule &quot;{existingRule.product_description}&quot; ({existingRule.match_type}: <code>{existingRule.match_value}</code>) already matches this serial. Try <strong>Re-run Rules</strong> before creating another rule. It won&apos;t apply if the collection&apos;s restrictions block that product.
                              </p>
                            )}
                            <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
                              <input type="checkbox" style={{ width: 'auto' }} checked={saveRule} onChange={e => setSaveRule(e.target.checked)} />
                              Also save a mapping rule so future serials starting with this prefix match automatically
                            </label>
                            {saveRule && (
                              <div className="flex items-center gap-2 mt-4">
                                <span className="text-sm text-muted">Starts with</span>
                                <input
                                  className="input"
                                  style={{ width: '10rem', fontFamily: 'monospace', padding: '0.4rem 0.6rem' }}
                                  value={rulePrefix}
                                  onChange={e => setRulePrefix(e.target.value)}
                                />
                                {!prefixMatchesSerial && (
                                  <span className="text-sm" style={{ color: 'var(--error)' }}>Must match the start of {scan.serial_number}</span>
                                )}
                              </div>
                            )}
                            {saveRule && overlappingRules.length > 0 && (
                              <p className="text-sm mt-4" style={{ color: 'var(--warning)' }}>
                                Overlaps with {overlappingRules.map(rule => `"${rule.product_description}" (${rule.match_value})`).join(', ')}. The rule saved first wins at equal priority.
                              </p>
                            )}
                            <p className="text-sm text-muted mt-4">Serial matching ignores upper/lower case.</p>
                          </div>
                          <button onClick={() => handleSave(scan.id)} className="btn btn-primary">
                            <CheckCircle2 size={18} className="mr-2" /> Save Assignment
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
