'use client';

import { useState, useEffect, useCallback } from 'react';
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

interface Claim {
  id: string;
  item_id: string;
  claimant_id: string;
  finder_id?: string;
  status: string;
  tx_hash?: string;
  reward_amount?: number;
  created_at: string;
  expires_at?: string;
  items?: { title: string; image_url?: string; type: string };
  claimant?: { email: string; name?: string };
  finder?: { email: string; name?: string };
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

function getClaimStatusColor(status: string): string {
  switch (status) {
    case 'pending': return 'var(--warning)';
    case 'approved': return 'var(--accent)';
    case 'completed': return 'var(--success)';
    case 'rejected': return 'var(--danger)';
    case 'expired': return 'var(--text-tertiary)';
    default: return 'var(--text-secondary)';
  }
}

function getClaimStatusBg(status: string): string {
  switch (status) {
    case 'pending': return 'var(--warning-subtle)';
    case 'approved': return 'var(--accent-subtle)';
    case 'completed': return 'var(--success-subtle)';
    case 'rejected': return 'var(--danger-subtle)';
    case 'expired': return 'var(--bg-surface-hover)';
    default: return 'var(--bg-surface-hover)';
  }
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'items' | 'claims'>('items');
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [claimStatusFilter, setClaimStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const fetchItems = useCallback(async (status = statusFilter) => {
    const params = status ? `?status=${status}` : '';
    const { data } = await api.get(`/admin/items${params}`);
    setItems(data.items || []);
  }, [statusFilter]);

  const fetchClaims = useCallback(async (status = claimStatusFilter) => {
    const params = status ? `?status=${status}` : '';
    const { data } = await api.get(`/admin/claims${params}`);
    setClaims(data.claims || []);
  }, [claimStatusFilter]);

  useEffect(() => {
    Promise.all([
      api.get('/admin/stats').then((r) => setStats(r.data)),
      fetchItems(),
      fetchClaims(),
    ]).catch(() => setError('Failed to load admin data. Are you an admin?')).finally(() => setLoading(false));
  }, [fetchItems, fetchClaims]);

  async function closeItem(itemId: string) {
    setActionLoading(itemId);
    await api.post(`/admin/items/${itemId}/close`);
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, status: 'closed' } : i));
    setActionLoading(null);
  }

  async function deleteItem(itemId: string) {
    setConfirmModal({
      message: 'Delete this item permanently?',
      onConfirm: async () => {
        setConfirmModal(null);
        setActionLoading(itemId);
        await api.delete(`/admin/items/${itemId}`);
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        setActionLoading(null);
        showToast('Item deleted successfully.', 'success');
      },
    });
  }

  async function approveClaim(claimId: string) {
    setActionLoading(claimId);
    try {
      await api.post(`/claims/${claimId}/approve`);
      setClaims((prev) => prev.map((c) => c.id === claimId ? { ...c, status: 'approved' } : c));
      showToast('Claim approved.', 'success');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast(detail || 'Failed to approve claim.', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectClaim(claimId: string) {
    setConfirmModal({
      message: 'Reject this claim? The users will need to initiate a new one.',
      onConfirm: async () => {
        setConfirmModal(null);
        setActionLoading(claimId);
        try {
          await api.post(`/claims/${claimId}/reject`);
          setClaims((prev) => prev.map((c) => c.id === claimId ? { ...c, status: 'rejected' } : c));
          showToast('Claim rejected.', 'success');
        } catch (err: unknown) {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          showToast(detail || 'Failed to reject claim.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  }

  async function cancelClaim(claimId: string) {
    setConfirmModal({
      message: 'Cancel this approved claim? The owner will need to initiate a new one.',
      onConfirm: async () => {
        setConfirmModal(null);
        setActionLoading(claimId);
        try {
          await api.post(`/admin/claims/${claimId}/cancel`);
          setClaims((prev) => prev.map((c) => c.id === claimId ? { ...c, status: 'rejected' } : c));
          showToast('Claim cancelled. Owner can now re-initiate.', 'success');
        } catch (err: unknown) {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          showToast(detail || 'Failed to cancel claim.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  }

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: isActive ? 600 : 500,
    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
    background: isActive ? 'var(--accent-subtle)' : 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  });

  return (
    <>
      <Navbar />
      <AuthGuard>
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

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
              <button style={tabStyle(activeTab === 'items')} onClick={() => setActiveTab('items')}>
                📦 Items
              </button>
              <button style={tabStyle(activeTab === 'claims')} onClick={() => setActiveTab('claims')}>
                🔒 Claims
              </button>
            </div>

            {/* ===== ITEMS TAB ===== */}
            {activeTab === 'items' && (
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
            )}

            {/* ===== CLAIMS TAB ===== */}
            {activeTab === 'claims' && (
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>All Claims</h2>
                  <select
                    id="admin-claim-status-filter"
                    className="input"
                    style={{ width: 'auto', minWidth: 140 }}
                    value={claimStatusFilter}
                    onChange={(e) => { setClaimStatusFilter(e.target.value); fetchClaims(e.target.value); }}
                  >
                    <option value="">All statuses</option>
                    <option value="pending">⏳ Pending</option>
                    <option value="approved">✅ Approved</option>
                    <option value="completed">🎉 Completed</option>
                    <option value="rejected">❌ Rejected</option>
                    <option value="expired">⏰ Expired</option>
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
                          {['Item', 'Owner', 'Finder', 'Status', 'Reward', 'Blockchain', 'Date', 'Actions'].map((h) => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {claims.length === 0 ? (
                          <tr><td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>No claims found.</td></tr>
                        ) : claims.map((claim, idx) => (
                          <tr key={claim.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 ? 'var(--bg-surface-hover)' : 'transparent' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-primary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {claim.items?.title || 'Unknown'}
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                              {claim.claimant?.name || claim.claimant?.email
                                ? (claim.claimant.name || claim.claimant.email)
                                : claim.claimant_id?.split('@')[0] || '—'}
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                              {claim.finder?.name || claim.finder?.email || '—'}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '3px 10px', fontSize: 12, fontWeight: 600,
                                borderRadius: 'var(--radius-full)',
                                background: getClaimStatusBg(claim.status),
                                color: getClaimStatusColor(claim.status),
                              }}>
                                {capitalize(claim.status)}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {claim.reward_amount ? `${claim.reward_amount} FNDT` : '—'}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              {claim.tx_hash ? (
                                <a
                                  href={`https://sepolia.etherscan.io/tx/${claim.tx_hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
                                >
                                  {claim.tx_hash.slice(0, 10)}… ↗
                                </a>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 13 }}>
                              {formatDate(claim.created_at)}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {claim.status === 'pending' && (
                                  <>
                                    <button
                                      id={`approve-claim-${claim.id}`}
                                      className="btn btn-primary"
                                      style={{ padding: '5px 12px', fontSize: 12 }}
                                      onClick={() => approveClaim(claim.id)}
                                      disabled={actionLoading === claim.id}
                                    >
                                      {actionLoading === claim.id ? '…' : '✓ Approve'}
                                    </button>
                                    <button
                                      id={`reject-claim-${claim.id}`}
                                      className="btn btn-danger"
                                      style={{ padding: '5px 12px', fontSize: 12 }}
                                      onClick={() => rejectClaim(claim.id)}
                                      disabled={actionLoading === claim.id}
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                                {claim.status === 'approved' && (
                                  <>
                                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginRight: 6 }}>Awaiting handover…</span>
                                    <button
                                      id={`cancel-claim-${claim.id}`}
                                      className="btn btn-danger"
                                      style={{ padding: '5px 12px', fontSize: 12 }}
                                      onClick={() => cancelClaim(claim.id)}
                                      disabled={actionLoading === claim.id}
                                    >
                                      {actionLoading === claim.id ? '…' : 'Cancel'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </AuthGuard>

      {/* Toast notification */}
      {toast && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 600,
            padding: '12px 24px',
            borderRadius: 'var(--radius-md)',
            fontSize: 14,
            fontWeight: 600,
            color: 'white',
            background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
            boxShadow: 'var(--shadow-lg)',
            animation: 'fadeInUp 0.2s ease',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 550,
            background: 'var(--bg-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="card animate-fade-in-up"
            style={{ maxWidth: 400, width: '100%', padding: 28 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={{ fontSize: 40, marginBottom: 12, textAlign: 'center' }}>⚠️</div>
            <p style={{ fontSize: 15, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmModal.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
