'use client';

import { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import ItemCard, { type Item } from '@/components/ItemCard';
import api from '@/lib/api';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import Image from 'next/image';
import { formatSimilarity, formatDate } from '@/lib/utils';

export interface MatchWithItems {
  id: string;
  lost_item_id: string;
  found_item_id: string;
  similarity_score: number;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
  lost_item: Item;
  found_item: Item;
}

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
  const { userId, isLoaded, getToken } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [matches, setMatches] = useState<MatchWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'lost' | 'found' | 'matches'>('lost');

  const fetchItems = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      if (tab === 'matches') {
        const { data } = await api.get('/matches/mine');
        setMatches(data);
      } else {
        const { data } = await api.get(`/items?user_id=${userId}&type=${tab}&limit=50`);
        setItems(data.items || data);
      }
    } catch {
      // Handle error cleanly
    } finally {
      setLoading(false);
    }
  }, [userId, tab, getToken]);

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
              <button
                onClick={() => setTab('matches')}
                className={tab === 'matches' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ flex: 1, maxWidth: 200 }}
              >
                AI Matches
              </button>
            </div>

            {/* Grid */}
            {loading ? (
              <div style={tab === 'matches' ? { display: 'grid', gap: 16 } : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
                {[1, 2, 3].map((i) => tab === 'matches' ? (
                  <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
                    <div className="skeleton" style={{ height: 14, width: '30%', marginBottom: 16 }} />
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div className="skeleton" style={{ width: 80, height: 80, borderRadius: 'var(--radius-md)' }} />
                      <div style={{ flex: 1 }}>
                        <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8 }} />
                        <div className="skeleton" style={{ height: 13, width: '40%' }} />
                      </div>
                    </div>
                  </div>
                ) : <ItemSkeleton key={i} />)}
              </div>
            ) : tab === 'matches' ? (
              matches.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '80px 24px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    No matches yet
                  </h2>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                    Our AI will notify you when it finds a visual match for your items.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 20 }}>
                  {matches.map((match) => {
                    const pct = Math.round(match.similarity_score * 100);
                    const color = pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--accent)';
                    return (
                      <div key={match.id} className="card animate-fade-in" style={{ overflow: 'hidden' }}>
                        {/* Header bar */}
                        <div style={{
                          padding: '12px 20px', borderBottom: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: match.status === 'confirmed' ? 'var(--success-subtle)' : 'var(--bg-surface-hover)',
                        }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>
                            {match.status === 'confirmed' ? '✓ Confirmed match' : `Potential match · ${formatDate(match.created_at)}`}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color }}>
                            {formatSimilarity(match.similarity_score)} similar
                          </span>
                        </div>

                        {/* Items side by side */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr' }}>
                          {[
                            { item: match.lost_item, label: 'LOST' },
                            { item: match.found_item, label: 'FOUND' },
                          ].flatMap(({ item: it, label }, idx) => [
                            <div key={label} style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start', background: idx === 1 ? 'var(--bg-surface-hover)' : 'transparent' }}>
                              {it?.image_url && (
                                <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                                  <Image src={it.image_url} alt={it.title} fill sizes="72px" style={{ objectFit: 'cover' }} />
                                </div>
                              )}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{it?.title}</p>
                                {it?.location && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📍 {it.location}</p>}
                                <Link
                                  href={`/items/${it?.id}`}
                                  style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', marginTop: 6, display: 'inline-block', fontWeight: 500 }}
                                >
                                  View item →
                                </Link>
                              </div>
                            </div>,
                            idx === 0 && <div key="divider" style={{ display: 'flex', alignItems: 'center', padding: '0 16px', color, fontWeight: 700, fontSize: 13 }}>↔</div>,
                          ])}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
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
