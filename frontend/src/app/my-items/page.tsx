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
  const [tab, setTab] = useState<'lost' | 'found'>('lost');

  const fetchItems = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/items?user_id=${userId}&type=${tab}&limit=50`);
      setItems(data.items || data);
    } catch {
      // Handle error cleanly
    } finally {
      setLoading(false);
    }
  }, [userId, tab]);

  useEffect(() => {
    if (isLoaded) {
      fetchItems();
    }
  }, [isLoaded, fetchItems]);

  return (
    <>
      <Navbar />
      <AuthGuard>
        <main style={{ flex: 1, background: 'var(--bg-primary)', padding: '40px 0 80px' }}>
          <div className="container-main">

            {/* Page header */}
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                My Items
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                Track the items you have reported.
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
              <button
                onClick={() => setTab('lost')}
                className={tab === 'lost' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ flex: 1, maxWidth: 200 }}
              >
                My Lost Items
              </button>
              <button
                onClick={() => setTab('found')}
                className={tab === 'found' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ flex: 1, maxWidth: 200 }}
              >
                My Findings
              </button>
            </div>

            {/* Grid */}
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
                {[1, 2, 3].map((i) => <ItemSkeleton key={i} />)}
              </div>
            ) : items.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '80px 24px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  No {tab === 'lost' ? 'lost items' : 'findings'} reported
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                  You haven&apos;t reported any {tab === 'lost' ? 'lost items' : 'found items'} yet.
                </p>
                <Link href={tab === 'lost' ? "/report" : "/report?type=found"} className="btn btn-primary">
                  Report {tab === 'lost' ? 'a Lost Item' : 'a Finding'}
                </Link>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20, marginBottom: 32 }}>
                {items.map((item) => <ItemCard key={item.id} item={item} />)}
              </div>
            )}
            
          </div>
        </main>
      </AuthGuard>
    </>
  );
}
