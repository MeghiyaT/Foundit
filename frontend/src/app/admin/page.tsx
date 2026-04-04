'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import api from '@/lib/api';
import { formatDate, capitalize, getStatusClass } from '@/lib/utils';
import type { Item } from '@/components/ItemCard';

interface Stats {
  total_items: number;
  open: number;
  matched: number;
  closed: number;
  total_matches: number;
  resolution_rate: number;
}

function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '20px 24px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <div style={{ color, opacity: 0.8 }}>{icon}</div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/admin/stats').then((r) => setStats(r.data)),
      fetchItems(),
    ]).catch(() => setError('Failed to load admin data. Are you an admin?')).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchItems(status = statusFilter) {
    const params = status ? `?status=${status}` : '';
    const { data } = await api.get(`/admin/items${params}`);
    setItems(data.items || []);
  }

  async function closeItem(itemId: string) {
    setActionLoading(itemId);
    await api.post(`/admin/items/${itemId}/close`);
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, status: 'closed' } : i));
    setActionLoading(null);
  }

  async function deleteItem(itemId: string) {
    if (!confirm('Delete this item permanently?')) return;
    setActionLoading(itemId);
    await api.delete(`/admin/items/${itemId}`);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setActionLoading(null);
  }

  return (
    <>
      <Navbar />
      <AuthGuard adminOnly>
        <main style={{ flex: 1, background: 'var(--bg-primary)', padding: '40px 0 80px' }}>
          <div className="container-main">
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                Admin Dashboard
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Security office control panel.</p>
            </div>

            {error && (
              <div style={{ padding: '14px 18px', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: 14, marginBottom: 24 }}>
                {error}
              </div>
            )}

            {/* Stats */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 40 }}>
                <StatCard label="Total items" value={stats.total_items} color="var(--accent)" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>} />
                <StatCard label="Open" value={stats.open} color="var(--text-secondary)" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/></svg>} />
                <StatCard label="Matched" value={stats.matched} color="var(--warning)" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>} />
                <StatCard label="Resolved" value={stats.closed} color="var(--success)" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>} />
                <StatCard label="Resolution rate" value={`${stats.resolution_rate}%`} color="var(--accent)" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>} />
              </div>
            )}

            {/* Items table */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>All Items</h2>
                <select
                  id="admin-status-filter"
                  className="input"
                  style={{ width: 'auto', minWidth: 140 }}
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); fetchItems(e.target.value); }}
                >
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="matched">Matched</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              {loading ? (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface-hover)' }}>
                        {['Item', 'Type', 'Category', 'Location', 'Status', 'Reported', 'Actions'].map((h) => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>No items match the current filter.</td></tr>
                      ) : items.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 ? 'var(--bg-surface-hover)' : 'transparent' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={`badge ${item.type === 'lost' ? 'badge-lost' : 'badge-found'}`}>{capitalize(item.type)}</span>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{item.category || '—'}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{item.location || '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={`badge ${getStatusClass(item.status)}`}>{capitalize(item.status)}</span>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(item.created_at)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {item.status !== 'closed' && (
                                <button
                                  id={`close-item-${item.id}`}
                                  className="btn btn-secondary"
                                  style={{ padding: '5px 12px', fontSize: 12 }}
                                  onClick={() => closeItem(item.id)}
                                  disabled={actionLoading === item.id}
                                >
                                  {actionLoading === item.id ? '…' : 'Close'}
                                </button>
                              )}
                              <button
                                id={`delete-item-${item.id}`}
                                className="btn btn-danger"
                                style={{ padding: '5px 12px', fontSize: 12 }}
                                onClick={() => deleteItem(item.id)}
                                disabled={actionLoading === item.id}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </AuthGuard>
    </>
  );
}
