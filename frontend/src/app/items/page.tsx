'use client';

import { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import ItemCard, { type Item } from '@/components/ItemCard';
import api from '@/lib/api';
import { CATEGORIES } from '@/lib/utils';

const SKELETON_COUNT = 8;

function ItemSkeleton() {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div className="skeleton" style={{ height: 200 }} />
      <div style={{ padding: 16 }}>
        <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 13, width: '90%', marginBottom: 4 }} />
        <div className="skeleton" style={{ height: 13, width: '60%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 12, width: '40%' }} />
      </div>
    </div>
  );
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 12;

  const fetchItems = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const p = reset ? 1 : page;
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('page', String(p));
      params.set('limit', String(PAGE_SIZE));

      const { data } = await api.get(`/items?${params}`);
      const newItems: Item[] = data.items ?? data;
      setItems(reset ? newItems : (prev) => [...prev, ...newItems]);
      setHasMore(newItems.length === PAGE_SIZE);
      if (!reset) setPage(p + 1);
    } catch {
      // silently handle — items stays empty
    } finally {
      setLoading(false);
    }
  }, [typeFilter, categoryFilter, search, page]);

  // Reset on filter change
  useEffect(() => {
    setPage(1);
    fetchItems(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, categoryFilter]);

  return (
    <>
      <Navbar />
      <AuthGuard>
        <main style={{ flex: 1, background: 'var(--bg-primary)', padding: '40px 0 80px' }}>
          <div className="container-main">

            {/* Page header */}
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                Browse Items
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                All reported lost and found items on campus.
              </p>
            </div>

            {/* Filters */}
            <div style={{
              display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              {/* Search */}
              <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
                <div style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)', pointerEvents: 'none',
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                <input
                  id="search-input"
                  className="input"
                  style={{ paddingLeft: 36 }}
                  type="text"
                  placeholder="Search items…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchItems(true)}
                />
              </div>

              {/* Type toggle */}
              <div style={{
                display: 'flex', gap: 4, padding: 4,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}>
                {(['all', 'lost', 'found'] as const).map((t) => (
                  <button
                    key={t}
                    id={`filter-${t}-btn`}
                    onClick={() => setTypeFilter(t)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      background: typeFilter === t ? 'var(--accent)' : 'transparent',
                      color: typeFilter === t ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    {t === 'all' ? 'All' : t === 'lost' ? 'Lost' : 'Found'}
                  </button>
                ))}
              </div>

              {/* Category */}
              <select
                id="category-filter"
                className="input"
                style={{ flex: '0 0 auto', width: 'auto', minWidth: 160 }}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Grid */}
            {loading && items.length === 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 20,
              }}>
                {Array.from({ length: SKELETON_COUNT }).map((_, i) => <ItemSkeleton key={i} />)}
              </div>
            ) : items.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '80px 24px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  No items found
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                  {search || typeFilter !== 'all' || categoryFilter
                    ? 'Try adjusting your filters.'
                    : 'Be the first to report a lost or found item.'}
                </p>
                <a href="/report" className="btn btn-primary">Report an item</a>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: 20,
                  marginBottom: 32,
                }}>
                  {items.map((item) => <ItemCard key={item.id} item={item} />)}
                </div>

                {hasMore && (
                  <div style={{ textAlign: 'center' }}>
                    <button
                      id="load-more-btn"
                      className="btn btn-secondary"
                      onClick={() => fetchItems(false)}
                      disabled={loading}
                      style={{ minWidth: 140 }}
                    >
                      {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Loading…</> : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </AuthGuard>
    </>
  );
}
