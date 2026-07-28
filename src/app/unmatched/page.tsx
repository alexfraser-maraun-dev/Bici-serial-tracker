'use client';

import React, { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import type { SerialScanRecord } from '@/lib/types';
import { Edit2, CheckCircle2, Trash2 } from 'lucide-react';

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

  useEffect(() => {
    fetchUnmatched();
  }, []);

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

    try {
      await apiJson(`/api/scans/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          brand,
          vendor_id: vendorId,
          product_description: productDescription,
          upc,
          system_sku: systemSku,
          manufacturer_sku: manufacturerSku,
        }),
      });
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
