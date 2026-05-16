'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import api from '@/lib/api';
import { useUser, useAuth } from '@clerk/nextjs';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  roll_no?: string;
  role: string;
  wallet_address?: string;
}

interface Claim {
  id: string;
  item_id: string;
  item_title?: string;
  status: string;
  reward_amount?: number;
  tx_hash?: string;
  created_at: string;
  expires_at?: string;
}

interface Stats {
  total_items: number;
  open: number;
  matched: number;
  closed: number;
}

function StatPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      flex: '1 1 120px',
      padding: '16px 20px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  );
}

function getClaimStatusColor(status: string) {
  switch (status) {
    case 'pending': return 'var(--warning)';
    case 'approved': return 'var(--accent)';
    case 'completed': return 'var(--success)';
    case 'rejected': return 'var(--danger)';
    case 'expired': return 'var(--text-tertiary)';
    default: return 'var(--text-secondary)';
  }
}

export default function ProfilePage() {
  const { user: clerkUser } = useUser();
  const { userId } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [stats, setStats] = useState<{ lost: number; found: number; resolved: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!userId) return;
    const cachedProfile = typeof window !== 'undefined' ? sessionStorage.getItem('foundit_profile') : null;
    let profilePromise = Promise.resolve();

    if (cachedProfile) {
      const data = JSON.parse(cachedProfile);
      setProfile(data);
      setName(data.name || '');
      setRollNo(data.roll_no || '');
    } else {
      profilePromise = api.post('/auth/verify').then(({ data }) => {
        setProfile(data);
        setName(data.name || '');
        setRollNo(data.roll_no || '');
        if (typeof window !== 'undefined') sessionStorage.setItem('foundit_profile', JSON.stringify(data));
      });
    }

    Promise.all([
      profilePromise,
      api.get(`/items?user_id=${userId}&limit=50`).then(({ data }) => {
        const items = data.items || [];
        setStats({
          lost: items.filter((i: { type: string }) => i.type === 'lost').length,
          found: items.filter((i: { type: string }) => i.type === 'found').length,
          resolved: items.filter((i: { status: string }) => i.status === 'closed').length,
        });
      }),
      api.get('/claims/user/me').then(({ data }) => {
        setClaims(data.claims || []);
      }).catch(() => setClaims([])),
    ]).finally(() => setLoading(false));
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/auth/profile', { name: name || null, roll_no: rollNo || null });
      setProfile(data);
      if (typeof window !== 'undefined') sessionStorage.setItem('foundit_profile', JSON.stringify(data));
      setEditing(false);
      setToast('Profile updated!');
      setTimeout(() => setToast(''), 3000);
    } catch {
      setToast('Failed to save profile.');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const totalRewards = claims
    .filter((c) => c.status === 'completed' && c.reward_amount)
    .reduce((sum, c) => sum + (c.reward_amount || 0), 0);

  return (
    <>
      <Navbar />
      <AuthGuard>
        <main style={{ flex: 1, background: 'var(--bg-primary)', padding: '40px 0 80px' }}>
          <div className="container-main" style={{ maxWidth: 720 }}>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : (
              <>
                {/* Header card */}
                <div className="card animate-fade-in-up" style={{ padding: '28px 32px', marginBottom: 24, display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {/* Avatar */}
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'var(--accent)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, fontWeight: 700, color: 'white',
                  }}>
                    {(profile?.name || clerkUser?.firstName || profile?.email || 'U')[0].toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {profile?.name || clerkUser?.firstName || 'Anonymous'}
                      </h1>
                      {profile?.role === 'admin' && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 10px',
                          background: 'var(--accent)', color: 'white',
                          borderRadius: 'var(--radius-full)', letterSpacing: '0.05em',
                        }}>👑 ADMIN</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>{profile?.email}</div>
                    {profile?.roll_no && (
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Roll No: {profile.roll_no}</div>
                    )}
                    {totalRewards > 0 && (
                      <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--accent-subtle)', borderRadius: 'var(--radius-full)' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>🪙 {totalRewards} FNDT earned</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setEditing(!editing)}
                    className="btn btn-secondary"
                    style={{ fontSize: 13, padding: '8px 16px' }}
                  >
                    {editing ? 'Cancel' : '✏️ Edit Profile'}
                  </button>
                </div>

                {/* Edit form */}
                {editing && (
                  <div className="card animate-fade-in-up" style={{ padding: '24px 32px', marginBottom: 24 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>Edit Profile</h2>
                    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>Full Name</label>
                        <input
                          className="input"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your full name"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>Roll Number</label>
                        <input
                          className="input"
                          value={rollNo}
                          onChange={(e) => setRollNo(e.target.value)}
                          placeholder="e.g. 22BCS045"
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Activity stats */}
                {stats && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                    <StatPill label="Lost Reports" value={stats.lost} color="var(--danger)" />
                    <StatPill label="Found Reports" value={stats.found} color="var(--success)" />
                    <StatPill label="Resolved" value={stats.resolved} color="var(--accent)" />
                    <StatPill label="FNDT Earned" value={`${totalRewards} 🪙`} color="var(--warning)" />
                  </div>
                )}

                {/* Wallet info */}
                {profile?.wallet_address && (
                  <div className="card" style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 2 }}>LINKED WALLET</div>
                      <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                        {profile.wallet_address.slice(0, 8)}…{profile.wallet_address.slice(-6)}
                      </div>
                    </div>
                    <a
                      href={`https://sepolia.etherscan.io/address/${profile.wallet_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
                    >
                      View on Etherscan ↗
                    </a>
                  </div>
                )}

                {/* FNDT Rewards History */}
                {claims.filter((c) => c.status === 'completed').length > 0 && (
                  <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>🪙 FNDT Reward History</h2>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Blockchain-verified handover rewards</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {claims.filter((c) => c.status === 'completed').map((c) => (
                        <div key={c.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 14px',
                          background: 'var(--bg-surface-hover)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)',
                          gap: 12, flexWrap: 'wrap',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 20 }}>🪙</span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {c.reward_amount ?? '?'} FNDT earned
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {formatDate(c.created_at)}
                              </div>
                            </div>
                          </div>
                          {c.tx_hash && c.tx_hash !== 'offchain' ? (
                            <a
                              href={`https://sepolia.etherscan.io/tx/${c.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 11, color: 'var(--accent)', fontWeight: 600,
                                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                                background: 'var(--accent-subtle)', padding: '4px 10px',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              {c.tx_hash.slice(0, 8)}…{c.tx_hash.slice(-6)}
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No tx hash</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick links */}
                <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Quick Links</h2>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link href="/my-items" className="btn btn-secondary" style={{ fontSize: 13 }}>📋 My Items</Link>
                    <Link href="/matches" className="btn btn-secondary" style={{ fontSize: 13 }}>🤖 My Matches</Link>
                    <Link href="/messages" className="btn btn-secondary" style={{ fontSize: 13 }}>💬 Messages</Link>
                    <Link href="/report" className="btn btn-primary" style={{ fontSize: 13 }}>+ Report Item</Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </AuthGuard>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 600, padding: '12px 24px', borderRadius: 'var(--radius-md)',
          fontSize: 14, fontWeight: 600, color: 'white',
          background: toast.includes('Failed') ? 'var(--danger)' : 'var(--success)',
          boxShadow: 'var(--shadow-lg)',
        }}>
          {toast}
        </div>
      )}
    </>
  );
}
