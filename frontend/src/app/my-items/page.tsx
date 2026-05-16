'use client';

import { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import ItemCard, { type Item } from '@/components/ItemCard';
import api from '@/lib/api';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';

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

export default function MyItemsPage() {
  const { userId, isLoaded } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'lost' | 'found'>('lost');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get(`/items?user_id=${userId}&type=${tab}&limit=50`);
      setItems(Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []);
    } catch {
      setError(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId, tab]);

  useEffect(() => {
    if (isLoaded) fetchItems();
  }, [isLoaded, fetchItems]);

  const handleDelete = async (itemId: string) => {
    setDeletingId(itemId);
    try {
      await api.delete(`/items/${itemId}`);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      alert('Failed to delete item. Please try again.');
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  return (
    <>
      <Navbar />
      <AuthGuard>
        <main style={{ flex: 1, background: 'var(--bg-primary)', padding: '40px 0 80px' }}>
          <div className="container-main">
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                My Items
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                Track and manage the items you have reported.
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 32, alignItems: 'center' }}>
              <button onClick={() => setTab('lost')} className={tab === 'lost' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ flex: 1, maxWidth: 180 }}>
                My Lost Items
              </button>
              <button onClick={() => setTab('found')} className={tab === 'found' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ flex: 1, maxWidth: 180 }}>
                My Findings
              </button>
              <Link href="/matches" className="btn btn-secondary" style={{ flex: 1, maxWidth: 180, textAlign: 'center', textDecoration: 'none' }}>
                🤖 AI Matches →
              </Link>
            </div>

            {error && (
              <div style={{ padding: '12px 16px', marginBottom: 20, background: 'var(--danger-subtle)', color: 'var(--danger)', fontSize: 14, fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid var(--danger)' }}>
                Failed to load items. Please try refreshing the page.
              </div>
            )}

            {/* Confirm delete modal */}
            {confirmDelete && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 32, maxWidth: 380, width: '90%', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Delete this item?</h3>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                    This will permanently remove the item and all its matches. This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDelete(confirmDelete)}
                      disabled={deletingId === confirmDelete}
                    >
                      {deletingId === confirmDelete ? 'Deleting…' : 'Yes, Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Grid */}
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
                {[1, 2, 3].map((i) => <ItemSkeleton key={i} />)}
              </div>
            ) : items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  No {tab === 'lost' ? 'lost items' : 'findings'} reported
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                  You haven&apos;t reported any {tab === 'lost' ? 'lost items' : 'found items'} yet.
                </p>
                <Link href={tab === 'lost' ? '/report' : '/report?type=found'} className="btn btn-primary">
                  Report {tab === 'lost' ? 'a Lost Item' : 'a Finding'}
                </Link>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20, marginBottom: 32 }}>
                {items.map((item) => (
                  <div key={item.id} style={{ position: 'relative' }}>
                    <ItemCard item={item} />
                    <button
                      onClick={() => setConfirmDelete(item.id)}
                      title="Delete this item"
                      style={{
                        position: 'absolute', top: 10, right: 10,
                        background: 'var(--danger)', color: 'white',
                        border: 'none', borderRadius: 'var(--radius-sm)',
                        padding: '4px 8px', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', opacity: 0.9,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </AuthGuard>
    </>
  );
}
