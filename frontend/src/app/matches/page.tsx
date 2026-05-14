'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import api from '@/lib/api';
import { formatDate, formatSimilarity } from '@/lib/utils';
import { useAuth } from '@clerk/nextjs';
import type { Item } from '@/components/ItemCard';

interface MatchWithItems {
  id: string;
  lost_item_id: string;
  found_item_id: string;
  similarity_score: number;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
  lost_item: Item;
  found_item: Item;
}

function MatchSkeleton() {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div className="skeleton" style={{ height: 44 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr' }}>
        <div style={{ padding: 20 }}>
          <div className="skeleton" style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 12, width: '50%' }} />
        </div>
        <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center' }}>
          <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%' }} />
        </div>
        <div style={{ padding: 20 }}>
          <div className="skeleton" style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 12, width: '50%' }} />
        </div>
      </div>
    </div>
  );
}

function SimilarityRing({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--accent)';
  const circumference = 2 * Math.PI * 18;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '12px 16px', background: 'var(--bg-surface-hover)',
      borderRadius: 'var(--radius-md)', minWidth: 80,
    }}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="22" cy="22" r="18" fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score)}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
        <text x="22" y="27" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{pct}%</text>
      </svg>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>MATCH</span>
    </div>
  );
}

export default function MatchesPage() {
  const { userId, isLoaded } = useAuth();
  const [matches, setMatches] = useState<MatchWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('all');

  const fetchMatches = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get('/matches/mine');
      setMatches(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isLoaded) fetchMatches();
  }, [isLoaded, fetchMatches]);

  const filtered = statusFilter === 'all'
    ? matches
    : matches.filter((m) => m.status === statusFilter);

  const pendingCount = matches.filter((m) => m.status === 'pending').length;
  const confirmedCount = matches.filter((m) => m.status === 'confirmed').length;

  return (
    <>
      <Navbar />
      <AuthGuard>
        <main style={{ flex: 1, background: 'var(--bg-primary)', padding: '40px 0 80px' }}>
          <div className="container-main">

            {/* Page header */}
            <div className="animate-fade-in-up" style={{ marginBottom: 32 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '4px 12px', marginBottom: 12,
                background: 'var(--accent-subtle)', borderRadius: 'var(--radius-full)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' }}>
                  AI-POWERED
                </span>
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                My Matches
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                Items our AI has automatically paired for you based on visual and text similarity.
              </p>
            </div>

            {/* Summary stats */}
            {!loading && !error && matches.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
                {[
                  { label: 'Total Matches', value: matches.length, color: 'var(--accent)', bg: 'var(--accent-subtle)' },
                  { label: 'Pending Review', value: pendingCount, color: 'var(--warning)', bg: 'var(--warning-subtle)' },
                  { label: 'Confirmed', value: confirmedCount, color: 'var(--success)', bg: 'var(--success-subtle)' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} style={{
                    flex: '1 1 140px', padding: '14px 18px',
                    background: bg, borderRadius: 'var(--radius-md)',
                    border: `1px solid ${color}22`,
                  }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color, marginBottom: 2 }}>{value}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color, opacity: 0.8 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
              {(['all', 'pending', 'confirmed', 'rejected'] as const).map((s) => (
                <button
                  key={s}
                  id={`matches-filter-${s}`}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    padding: '8px 16px', border: 'none', cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
                    transition: 'all 150ms ease',
                    background: statusFilter === s ? 'var(--accent)' : 'var(--bg-surface)',
                    color: statusFilter === s ? 'white' : 'var(--text-secondary)',
                    boxShadow: statusFilter === s ? 'none' : 'var(--shadow-sm)',
                  }}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: '14px 18px', marginBottom: 24,
                background: 'var(--danger-subtle)', border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: 14,
              }}>
                Failed to load matches. <button onClick={fetchMatches} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{ display: 'grid', gap: 20 }}>
                {[1, 2, 3].map((i) => <MatchSkeleton key={i} />)}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && filtered.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '80px 24px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  {statusFilter === 'all' ? 'No matches yet' : `No ${statusFilter} matches`}
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 360, margin: '0 auto 24px' }}>
                  {statusFilter === 'all'
                    ? 'Our AI will automatically pair your reported items with potential matches as more items are posted.'
                    : `You have no ${statusFilter} matches. Try changing the filter above.`}
                </p>
                <Link href="/report" className="btn btn-primary">Report an Item</Link>
              </div>
            )}

            {/* Match cards */}
            {!loading && !error && filtered.length > 0 && (
              <div style={{ display: 'grid', gap: 20 }}>
                {filtered.map((match) => {
                  const pct = Math.round(match.similarity_score * 100);
                  const color = pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--accent)';
                  const statusColor = match.status === 'confirmed' ? 'var(--success)'
                    : match.status === 'rejected' ? 'var(--danger)' : 'var(--warning)';
                  const statusBg = match.status === 'confirmed' ? 'var(--success-subtle)'
                    : match.status === 'rejected' ? 'var(--danger-subtle)' : 'var(--warning-subtle)';

                  return (
                    <div
                      key={match.id}
                      id={`match-card-${match.id}`}
                      className="card animate-fade-in"
                      style={{ overflow: 'hidden', padding: 0 }}
                    >
                      {/* Header */}
                      <div style={{
                        padding: '12px 20px', borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--bg-surface-hover)',
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>
                          {match.status === 'confirmed' ? '✓ Confirmed match'
                            : match.status === 'rejected' ? '✗ Match rejected'
                              : `Potential match · ${formatDate(match.created_at)}`}
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: statusColor,
                          padding: '3px 10px', borderRadius: 'var(--radius-full)',
                          background: statusBg,
                        }}>
                          {match.status.charAt(0).toUpperCase() + match.status.slice(1)}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 800, color }}>
                          {formatSimilarity(match.similarity_score)} similar
                        </span>
                      </div>

                      {/* Items comparison */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr' }}>
                        {/* Lost item */}
                        <div style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          {match.lost_item?.image_url && (
                            <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                              <Image src={match.lost_item.image_url} alt={match.lost_item.title} fill sizes="72px" style={{ objectFit: 'cover' }} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', letterSpacing: '0.1em', marginBottom: 4 }}>LOST</div>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{match.lost_item?.title}</p>
                            {match.lost_item?.location && (
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>📍 {match.lost_item.location}</p>
                            )}
                            <Link
                              href={`/items/${match.lost_item?.id}`}
                              style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
                            >
                              View item →
                            </Link>
                          </div>
                        </div>

                        {/* Similarity ring */}
                        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                          <SimilarityRing score={match.similarity_score} />
                        </div>

                        {/* Found item */}
                        <div style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start', background: 'var(--bg-surface-hover)' }}>
                          {match.found_item?.image_url && (
                            <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                              <Image src={match.found_item.image_url} alt={match.found_item.title} fill sizes="72px" style={{ objectFit: 'cover' }} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', letterSpacing: '0.1em', marginBottom: 4 }}>FOUND</div>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{match.found_item?.title}</p>
                            {match.found_item?.location && (
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>📍 {match.found_item.location}</p>
                            )}
                            <Link
                              href={`/items/${match.found_item?.id}`}
                              style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
                            >
                              View item →
                            </Link>
                          </div>
                        </div>
                      </div>

                      {/* Footer CTA */}
                      <div style={{
                        padding: '12px 20px', borderTop: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: 'var(--bg-surface-hover)',
                      }}>
                        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                          Matched {formatDate(match.created_at)}
                        </span>
                        {match.status === 'pending' && (
                          <Link
                            href="/messages"
                            className="btn btn-primary"
                            id={`match-message-${match.id}`}
                            style={{ marginLeft: 'auto', padding: '7px 18px', fontSize: 13 }}
                          >
                            💬 Message them
                          </Link>
                        )}
                        {match.status === 'confirmed' && (
                          <Link
                            href="/messages"
                            className="btn btn-primary"
                            id={`match-claim-${match.id}`}
                            style={{ marginLeft: 'auto', padding: '7px 18px', fontSize: 13 }}
                          >
                            🏆 Initiate Claim
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </AuthGuard>
    </>
  );
}
