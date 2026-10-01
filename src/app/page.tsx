'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import type { CollectionRecord, SerialScanRecord, ShopRecord } from '@/lib/types';
import Link from 'next/link';
import { Plus, Play, Download, Archive, BarChart3, X, Settings2, Trash2, Copy, Receipt } from 'lucide-react';
import { useSession } from 'next-auth/react';

type Collection = CollectionRecord;
type RollupSummary = {
  byProduct: Record<string, number>;
  byEmployee: Record<string, number>;
  byBrand: Record<string, number>;
};

export default function Home() {
  const { data: session } = useSession();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionBrand, setNewCollectionBrand] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [tileMenus, setTileMenus] = useState<Record<string, 'rollup' | 'settings' | null>>({});
  const [rollupData, setRollupData] = useState<Record<string, RollupSummary>>({});
  const [isRollupLoading, setIsRollupLoading] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [skuDescriptions, setSkuDescriptions] = useState<Record<string, string>>({});
  const requestedSkuDescriptions = useRef(new Set<string>());
  const [shops, setShops] = useState<ShopRecord[]>([]);

  const filteredCollections = showClosed 
    ? collections 
    : collections.filter(c => c.status !== 'closed');

  const fetchSkuDescription = useCallback(async (id: string) => {
    if (requestedSkuDescriptions.current.has(id)) return;
    requestedSkuDescriptions.current.add(id);

    try {
      // Try UPC first, then system SKU
      const res = await fetch(`/api/bigquery/lookup?upc=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.found) {
        setSkuDescriptions(prev => ({ ...prev, [id]: data.product.product_description }));
      } else {
        const res2 = await fetch(`/api/bigquery/lookup?sku=${encodeURIComponent(id)}`);
        const data2 = await res2.json();
        if (data2.found) {
          setSkuDescriptions(prev => ({ ...prev, [id]: data2.product.product_description }));
        }
      }
    } catch {
      requestedSkuDescriptions.current.delete(id);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
    apiJson<ShopRecord[]>('/api/shops')
      .then(setShops)
      .catch(() => setShops([]));
  }, []);

  const shopNames = (ids: string | null) =>
    (ids ? ids.split(',') : [])
      .map(id => shops.find(shop => String(shop.id) === id)?.name ?? `Shop ${id}`)
      .join(', ');

  const toggleShop = (shopId: number) => {
    if (!editingCollection) return;
    const current = editingCollection.shop_ids ? editingCollection.shop_ids.split(',') : [];
    const id = String(shopId);
    const updated = current.includes(id) ? current.filter(s => s !== id) : [...current, id];
    setEditingCollection({ ...editingCollection, shop_ids: updated.join(',') || null });
  };

  useEffect(() => {
    if (editingCollection?.restricted_skus) {
      const ids = editingCollection.restricted_skus.split(',').filter(Boolean);
      ids.forEach(id => fetchSkuDescription(id));
    }
  }, [editingCollection?.restricted_skus, fetchSkuDescription]);

  async function fetchCollections() {
    setIsLoading(true);
    try {
      const data = await apiJson<Collection[]>('/api/collections');
      setCollections(data);
    } catch {
      alert('Failed to load collections.');
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName || !session?.user?.email) return;

    setIsCreating(true);
    try {
      const data = await apiJson<Collection>('/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          name: newCollectionName,
          brand: newCollectionBrand || null,
          status: 'active',
        }),
      });
      setCollections(prev => [data, ...prev]);
      setNewCollectionName('');
      setNewCollectionBrand('');
    } catch {
      alert('Failed to create collection.');
    } finally {
      setIsCreating(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiJson(`/api/collections/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      fetchCollections();
    } catch {
      alert('Failed to update collection status.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollection) return;

    setIsSavingSettings(true);
    try {
      await apiJson(
        `/api/collections/${encodeURIComponent(editingCollection.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
        name: editingCollection.name,
        brand: editingCollection.brand,
        restricted_skus: editingCollection.restricted_skus,
        restricted_brands: editingCollection.restricted_brands,
        starts_on: editingCollection.starts_on,
        ends_on: editingCollection.ends_on,
        shop_ids: editingCollection.shop_ids,
          }),
        },
      );
      fetchCollections();
      setEditingCollection(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save collection settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDuplicate = async (col: Collection) => {
    if (!session?.user?.email) return;

    try {
      const data = await apiJson<Collection>('/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          name: `${col.name} (Copy)`,
          brand: col.brand,
          status: 'active',
          restricted_skus: col.restricted_skus,
          restricted_brands: col.restricted_brands,
          shop_ids: col.shop_ids,
        }),
      });
      setCollections(prev => [data, ...prev]);
    } catch {
      alert('Failed to duplicate collection.');
    }
  };

  const downloadCsv = (id: string) => {
    window.open(`/api/collections/export/${id}`, '_blank');
  };

  const fetchRollup = async (col: Collection) => {
    if (tileMenus[col.id] === 'rollup') {
      setTileMenus(prev => ({ ...prev, [col.id]: null }));
      return;
    }

    if (rollupData[col.id]) {
      setTileMenus(prev => ({ ...prev, [col.id]: 'rollup' }));
      return;
    }

    setIsRollupLoading(true);
    try {
      const data = await apiJson<SerialScanRecord[]>(
        `/api/scans?collectionId=${encodeURIComponent(col.id)}`,
      );
      const byProduct: Record<string, number> = {};
      const byEmployee: Record<string, number> = {};
      const byBrand: Record<string, number> = {};

      data.forEach(scan => {
        const prod = scan.product_description || 'Unmatched';
        const emp = scan.scanned_by || 'Unknown';
        const brand = scan.brand || 'Unknown';

        byProduct[prod] = (byProduct[prod] || 0) + 1;
        byEmployee[emp] = (byEmployee[emp] || 0) + 1;
        byBrand[brand] = (byBrand[brand] || 0) + 1;
      });

      setRollupData(prev => ({
        ...prev,
        [col.id]: { byProduct, byEmployee, byBrand }
      }));
      setTileMenus(prev => ({ ...prev, [col.id]: 'rollup' }));
    } catch {
      alert('Failed to load collection summary.');
    } finally {
      setIsRollupLoading(false);
    }
  };

  const closeMenu = (id: string) => {
    setTileMenus(prev => ({ ...prev, [id]: null }));
    if (editingCollection?.id === id) {
      setEditingCollection(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1>Serial Number Collections</h1>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input 
            type="checkbox" 
            checked={showClosed} 
            onChange={(e) => setShowClosed(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Show Closed
        </label>
      </div>

      <div className="card mb-4 p-4 py-3 bg-primary bg-opacity-5 border-primary border-opacity-10">
        <h4 className="text-primary mb-2 text-[10px] uppercase tracking-widest font-bold">Quick Guide</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[12px]">
          <div>
            <span className="font-bold mr-1">1. Create:</span>
            <span className="text-muted">Start a collection with a descriptive name.</span>
          </div>
          <div>
            <span className="font-bold mr-1">2. Scan:</span>
            <span className="text-muted">Use <strong>Start Scanning</strong> to record serials.</span>
          </div>
          <div>
            <span className="font-bold mr-1">3. Finalize:</span>
            <span className="text-muted"><strong>Export</strong> CSV or <strong>Archive</strong> when finished.</span>
          </div>
        </div>
      </div>

      <div className="card mb-6 p-4">
        <h3 className="text-base mb-3">Create New Collection</h3>
        <form onSubmit={handleCreate} className="flex gap-4 items-center">
          <div style={{ flex: 1 }}>
            <input 
              type="text" 
              placeholder="Name (e.g., Summer MAP Window)" 
              className="input py-2 text-sm"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              required
            />
          </div>
          <div style={{ flex: 1 }}>
            <input 
              type="text" 
              placeholder="Brand (Optional)" 
              className="input py-2 text-sm"
              value={newCollectionBrand}
              onChange={(e) => setNewCollectionBrand(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary py-2" disabled={isCreating}>
            <Plus size={16} className="mr-1" /> Create
          </button>
        </form>
      </div>

      {isLoading ? (
        <p>Loading collections...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
          {filteredCollections.map(col => (
            <div key={col.id} className="card flex flex-col h-fit">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 style={{ margin: 0 }}>{col.name}</h3>
                  <span className={`badge badge-${col.status === 'active' ? 'success' : col.status === 'draft' ? 'warning' : 'neutral'}`}>
                    {col.status}
                  </span>
                </div>
                <p className="text-sm text-muted mb-4">
                  {col.brand ? `Brand: ${col.brand}` : 'No brand specified'} <br />
                  Promo window: {col.starts_on && col.ends_on ? `${col.starts_on} to ${col.ends_on}` : 'Not set'}
                  {col.shop_ids ? ` (${shopNames(col.shop_ids)})` : ''} <br />
                  Created: {new Date(col.created_at).toLocaleDateString()}
                </p>
              </div>
              
              <div className="flex gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
                <Link href={`/collection/${col.id}`} className="btn btn-outline" style={{ flex: 1 }}>
                  View Scans
                </Link>

                {col.status === 'active' && (
                  <Link href={`/scan/${col.id}`} className="btn btn-primary" style={{ flex: 1 }}>
                    <Play size={16} className="mr-2" /> Start Scanning
                  </Link>
                )}
                
                {col.status === 'active' && (
                  <button onClick={() => updateStatus(col.id, 'closed')} className="btn btn-outline" title="Close Collection">
                    <Archive size={16} />
                  </button>
                )}

                {(col.status === 'closed' || col.status === 'exported') && (
                  <button onClick={() => updateStatus(col.id, 'active')} className="btn btn-outline text-warning" title="Reopen Collection">
                    Reopen
                  </button>
                )}

                {(col.status === 'closed' || col.status === 'active' || col.status === 'exported') && (
                  <button onClick={() => downloadCsv(col.id)} className="btn btn-outline" title="Export CSV">
                    <Download size={16} /> Export
                  </button>
                )}

                <button 
                  onClick={() => {
                    setEditingCollection(col);
                    setTileMenus(prev => ({ ...prev, [col.id]: 'settings' }));
                  }} 
                  className={`btn ${tileMenus[col.id] === 'settings' ? 'btn-primary' : 'btn-outline'}`}
                  title="Settings"
                >
                  <Settings2 size={16} />
                </button>

                <Link href={`/collection/${col.id}/claim`} className="btn btn-outline" title="Promo Claim">
                  <Receipt size={16} /> Claim
                </Link>

                <button onClick={() => handleDuplicate(col)} className="btn btn-outline" title="Duplicate Collection">
                  <Copy size={16} />
                </button>

                <button 
                  onClick={() => fetchRollup(col)} 
                  className={`btn ${tileMenus[col.id] === 'rollup' ? 'btn-primary' : 'btn-outline'}`}
                  title="Rollup Summary"
                  disabled={isRollupLoading && tileMenus[col.id] !== 'rollup'}
                >
                  <BarChart3 size={16} className="mr-2" /> Rollup
                </button>
              </div>

              {/* Inline Rollup Section */}
              <div 
                className={`overflow-hidden transition-all duration-500 ease-in-out ${tileMenus[col.id] === 'rollup' ? 'max-h-[2000px] mt-6 opacity-100' : 'max-h-0 opacity-0 invisible'}`}
              >
                {rollupData[col.id] && (
                  <div className="bg-muted bg-opacity-30 rounded-xl p-5 border border-border flex flex-col gap-6 relative">
                    <button 
                      onClick={() => closeMenu(col.id)} 
                      className="btn-close absolute top-4 right-4 z-10"
                      title="Close Summary"
                    >
                      <X size={16} />
                    </button>

                    <div className="flex flex-col gap-6">
                      <section>
                        <h5 className="text-xs font-semibold mb-3 flex justify-between items-center">
                          <span>By Product</span>
                          <span className="text-[10px] text-muted font-normal">Count</span>
                        </h5>
                        <div className="flex flex-col gap-3">
                          {Object.entries(rollupData[col.id].byProduct)
                            .sort((a, b) => b[1] - a[1])
                            .map(([name, count]) => {
                              const counts = Object.values(rollupData[col.id].byProduct) as number[];
                              const max = Math.max(...counts);
                              const percent = (count / max) * 100;
                              return (
                                <div key={name} className="flex flex-col gap-1.5">
                                  <div className="flex justify-between items-center text-[11px]">
                                    <span className="font-medium truncate pr-4" title={name}>{name}</span>
                                    <span className="font-bold">{count}</span>
                                  </div>
                                  <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden border border-border border-opacity-30">
                                    <div 
                                      className="bg-primary h-full rounded-full transition-all duration-1000" 
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </section>

                      <div className="grid grid-cols-1 gap-6">
                        <section>
                          <h5 className="text-xs font-semibold mb-3 flex justify-between items-center">
                            <span>By Employee</span>
                          </h5>
                          <div className="grid grid-cols-1 gap-2">
                            {Object.entries(rollupData[col.id].byEmployee)
                              .sort((a, b) => b[1] - a[1])
                              .map(([name, count]) => (
                                <div key={name} className="flex justify-between items-center text-[11px] bg-surface p-2 rounded-lg border border-border border-opacity-50">
                                  <span className="truncate text-muted">{name}</span>
                                  <span className="badge badge-neutral shrink-0" style={{ fontSize: '10px' }}>{count}</span>
                                </div>
                              ))}
                          </div>
                        </section>

                        <section>
                          <h5 className="text-xs font-semibold mb-3 flex justify-between items-center">
                            <span>By Brand</span>
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(rollupData[col.id].byBrand)
                              .sort((a, b) => b[1] - a[1])
                              .map(([name, count]) => (
                                <div key={name} className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-full border border-border border-opacity-50 text-[11px]">
                                  <span className="font-medium">{name}</span>
                                  <div className="w-px h-3 bg-border" />
                                  <span className="font-bold text-primary">{count}</span>
                                </div>
                              ))}
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Inline Settings Section */}
              <div 
                className={`overflow-hidden transition-all duration-500 ease-in-out ${tileMenus[col.id] === 'settings' ? 'max-h-[2000px] mt-6 opacity-100' : 'max-h-0 opacity-0 invisible'}`}
              >
                {(tileMenus[col.id] === 'settings' && editingCollection) && (
                  <div className="bg-muted bg-opacity-30 rounded-xl p-5 border border-border flex flex-col gap-6 relative">
                    <button 
                      onClick={() => closeMenu(col.id)}
                      className="btn-close absolute top-4 right-4 z-10"
                      title="Close Settings"
                    >
                      <X size={16} />
                    </button>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <Settings2 size={14} className="text-primary" />
                      <h4 className="uppercase tracking-widest text-[10px] font-bold text-muted m-0">Collection Settings</h4>
                    </div>
                    
                    <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase text-muted mb-1 block">Collection Name</label>
                        <input 
                          type="text" 
                          className="input w-full py-2 text-sm"
                          value={editingCollection.name}
                          onChange={e => setEditingCollection({...editingCollection, name: e.target.value})}
                          required
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold uppercase text-muted mb-1 block">Default Brand</label>
                        <input 
                          type="text" 
                          className="input w-full py-2 text-sm"
                          value={editingCollection.brand || ''}
                          onChange={e => setEditingCollection({...editingCollection, brand: e.target.value || null})}
                        />
                      </div>

                      <div className="p-4 bg-surface rounded-lg border border-border mt-2">
                        <h4 className="text-[10px] font-bold uppercase text-primary mb-4 tracking-widest">Promo Window</h4>
                        <div className="flex gap-4 mb-4">
                          <div style={{ flex: 1 }}>
                            <label className="text-[9px] font-bold uppercase text-muted mb-2 block">Start Date</label>
                            <input
                              type="date"
                              className="input w-full py-2 text-sm"
                              value={editingCollection.starts_on || ''}
                              onChange={e => setEditingCollection({...editingCollection, starts_on: e.target.value || null})}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="text-[9px] font-bold uppercase text-muted mb-2 block">End Date</label>
                            <input
                              type="date"
                              className="input w-full py-2 text-sm"
                              value={editingCollection.ends_on || ''}
                              min={editingCollection.starts_on || undefined}
                              onChange={e => setEditingCollection({...editingCollection, ends_on: e.target.value || null})}
                            />
                          </div>
                        </div>
                        <label className="text-[9px] font-bold uppercase text-muted mb-2 block">Shops (none selected = all shops)</label>
                        <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
                          {shops.map(shop => (
                            <label key={shop.id} className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                style={{ width: 'auto' }}
                                checked={(editingCollection.shop_ids || '').split(',').includes(String(shop.id))}
                                onChange={() => toggleShop(shop.id)}
                              />
                              {shop.name}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 bg-surface rounded-lg border border-border mt-2">
                        <h4 className="text-[10px] font-bold uppercase text-primary mb-4 tracking-widest">Scanning Restrictions</h4>
                        
                        <div className="flex flex-col gap-6">
                          {/* SKU/UPC Restrictions */}
                          <div>
                            <label className="text-[9px] font-bold uppercase text-muted mb-2 block">Allowed System SKUs or UPCs</label>
                            <div className="flex gap-2 mb-2">
                              <input 
                                type="text" 
                                className="input text-xs font-mono py-1 flex-1" 
                                placeholder="Enter SKU or UPC..." 
                                value={newSku}
                                onChange={e => setNewSku(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { 
                                  e.preventDefault(); 
                                  const val = newSku.trim(); 
                                  if (val) { 
                                    const current = editingCollection.restricted_skus ? editingCollection.restricted_skus.split(',') : []; 
                                    if (!current.includes(val)) { 
                                      setEditingCollection({...editingCollection, restricted_skus: [...current, val].join(',')}); 
                                      fetchSkuDescription(val);
                                    } 
                                    setNewSku(''); 
                                  } 
                                } }}
                              />
                              <button 
                                type="button" 
                                onClick={() => { 
                                  const val = newSku.trim(); 
                                  if (val) { 
                                    const current = editingCollection.restricted_skus ? editingCollection.restricted_skus.split(',') : []; 
                                    if (!current.includes(val)) { 
                                      setEditingCollection({...editingCollection, restricted_skus: [...current, val].join(',')}); 
                                      fetchSkuDescription(val);
                                    } 
                                    setNewSku(''); 
                                  } 
                                }}
                                className="btn btn-primary py-1 px-2"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                            <div className="max-h-48 overflow-y-auto border border-border rounded-lg bg-surface">
                              <table className="w-full text-[11px]">
                                <tbody className="divide-y divide-border">
                                  {(editingCollection.restricted_skus ? editingCollection.restricted_skus.split(',') : []).map((sku, idx) => (
                                    <tr key={idx} className="hover:bg-muted group">
                                      <td className="px-3 py-2">
                                        <div className="font-semibold text-text">{skuDescriptions[sku] || 'Loading...'}</div>
                                        <div className="text-[9px] text-muted font-mono">{sku}</div>
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <button 
                                          type="button" 
                                          onClick={() => { const current = editingCollection.restricted_skus?.split(',') || []; const updated = current.filter((_, i) => i !== idx).join(','); setEditingCollection({...editingCollection, restricted_skus: updated || null}); }}
                                          className="text-error opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                  {!(editingCollection.restricted_skus) && (
                                    <tr><td className="px-3 py-2 text-muted italic text-[10px]">No SKU restrictions.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Brand Restrictions */}
                          <div>
                            <label className="text-[9px] font-bold uppercase text-muted mb-2 block">Allowed Brands</label>
                            <div className="flex gap-2 mb-2">
                              <input 
                                type="text" 
                                className="input text-xs py-1 flex-1" 
                                placeholder="Enter Brand..." 
                                value={newBrand}
                                onChange={e => setNewBrand(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const val = newBrand.trim(); if (val) { const current = editingCollection.restricted_brands ? editingCollection.restricted_brands.split(',') : []; if (!current.includes(val)) { setEditingCollection({...editingCollection, restricted_brands: [...current, val].join(',')}); } setNewBrand(''); } } }}
                              />
                              <button 
                                type="button" 
                                onClick={() => { const val = newBrand.trim(); if (val) { const current = editingCollection.restricted_brands ? editingCollection.restricted_brands.split(',') : []; if (!current.includes(val)) { setEditingCollection({...editingCollection, restricted_brands: [...current, val].join(',')}); } setNewBrand(''); } }}
                                className="btn btn-primary py-1 px-2"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                            <div className="max-h-32 overflow-y-auto border border-border rounded-lg bg-surface">
                              <table className="w-full text-[11px]">
                                <tbody className="divide-y divide-border">
                                  {(editingCollection.restricted_brands ? editingCollection.restricted_brands.split(',') : []).map((brand, idx) => (
                                    <tr key={idx} className="hover:bg-muted group">
                                      <td className="px-3 py-2">{brand}</td>
                                      <td className="px-3 py-2 text-right">
                                        <button 
                                          type="button" 
                                          onClick={() => { const current = editingCollection.restricted_brands?.split(',') || []; const updated = current.filter((_, i) => i !== idx).join(','); setEditingCollection({...editingCollection, restricted_brands: updated || null}); }}
                                          className="text-error opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                  {!(editingCollection.restricted_brands) && (
                                    <tr><td className="px-3 py-2 text-muted italic text-[10px]">No brand restrictions.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 mt-4">
                        <button 
                          type="button" 
                          onClick={() => setEditingCollection(null)} 
                          className="btn btn-outline flex-1 text-xs py-2"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit" 
                          className="btn btn-primary flex-1 text-xs py-2"
                          disabled={isSavingSettings}
                        >
                          {isSavingSettings ? 'Saving...' : 'Save Settings'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ))}
          {collections.length === 0 && (
            <p className="text-muted col-span-full">No collections found. Create one to get started.</p>
          )}
        </div>
      )}



    </div>
  );
}
