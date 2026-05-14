'use client';

import { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import MatchCard from '@/components/MatchCard';
import MessageModal from '@/components/MessageModal';
import { useAuth } from '@clerk/nextjs';
import api from '@/lib/api';
import { formatDate, getStatusClass, capitalize } from '@/lib/utils';
import type { Item } from '@/components/ItemCard';

interface Match {
  id: string;
  lost_item_id: string;
  found_item_id: string;
  similarity_score: number;
  status: 'pending' | 'confirmed' | 'rejected';
  matched_item: Item;
}

function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [item, setItem] = useState<Item | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingItem, setLoadingItem] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageReceiverId, setMessageReceiverId] = useState<string | null>(null);
  const [claimReceiverTitle, setClaimReceiverTitle] = useState('');
  const [fetchError, setFetchError] = useState(false);
  const [successBanner, setSuccessBanner] = useState(searchParams.get('success') === '1');
  const { userId } = useAuth();

  useEffect(() => {
    async function fetchItem() {
      try {
        const { data } = await api.get(`/items/${id}`);
        setItem(data);
        // Fetch matches
        setLoadingMatches(true);
        const matchRes = await api.get(`/matches/item/${id}`);
        setMatches(matchRes.data);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          // genuine not found — leave item null
        } else {
          setFetchError(true);
        }
      } finally {
        setLoadingItem(false);
        setLoadingMatches(false);
      }
    }
    if (id) fetchItem();
  }, [id]);

  useEffect(() => {
    if (successBanner) {
      const t = setTimeout(() => setSuccessBanner(false), 5000);
      return () => clearTimeout(t);
    }
  }, [successBanner]);

  function openMessageModal(receiverId: string, title: string) {
    setMessageReceiverId(receiverId);
    setClaimReceiverTitle(title);
    setMessageModalOpen(true);
  }

  if (loadingItem) {
    return (
      <main style={{ flex: 1, padding: '48px 0' }}>
        <div className="container-main" style={{ maxWidth: 800 }}>
          <div className="skeleton" style={{ height: 400, borderRadius: 'var(--radius-lg)', marginBottom: 24 }} />
          <div className="skeleton" style={{ height: 28, width: '50%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 16, width: '80%' }} />
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{fetchError ? '⚠️' : '🕵️'}</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            {fetchError ? 'Something went wrong' : 'Item not found'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            {fetchError
              ? 'We couldn\'t load this item. The server may be unavailable — please try again.'
              : 'This item may have been removed or closed.'}
          </p>
          {fetchError ? (
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
          ) : (
            <Link href="/items" className="btn btn-primary">Browse items</Link>
          )}
        </div>
      </main>
    );
  }

  const isLost = item.type === 'lost';

  return (
    <>
      <main style={{ flex: 1, background: 'var(--bg-primary)', padding: '40px 0 80px' }}>
        <div className="container-main" style={{ maxWidth: 800 }}>

          {/* Success banner */}
          {successBanner && (
            <div style={{
              padding: '14px 18px', marginBottom: 24,
              background: 'var(--success-subtle)',
              border: '1px solid var(--success)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--success)' }}>
                Your report was submitted! Our AI is scanning for matches.
              </span>
            </div>
          )}

          {/* Back link */}
          <Link href="/items" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 24 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            All items
          </Link>

          <div className="animate-fade-in card" style={{ overflow: 'hidden', marginBottom: 24 }}>
            {/* Image */}
            {item.image_url && (
              <div style={{ position: 'relative', aspectRatio: '16/7', background: 'var(--bg-surface-hover)' }}>
                <Image src={item.image_url} alt={item.title} fill sizes="800px" style={{ objectFit: 'cover' }} priority />
                <div style={{ position: 'absolute', top: 16, left: 16 }}>
                  <span className={`badge ${isLost ? 'badge-lost' : 'badge-found'}`} style={{ fontSize: 13, padding: '5px 14px' }}>
                    {isLost ? 'Lost' : 'Found'}
                  </span>
                </div>
                <div style={{ position: 'absolute', top: 16, right: 16 }}>
                  <span className={`badge ${getStatusClass(item.status)}`} style={{ fontSize: 13, padding: '5px 14px' }}>
                    {capitalize(item.status)}
                  </span>
                </div>
              </div>
            )}

            {/* Details */}
            <div style={{ padding: '28px 32px' }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 12 }}>
                {item.title}
              </h1>

              {item.description && (
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
                  {item.description}
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                {[
                  { icon: '📍', label: 'Location', value: item.location },
                  { icon: '🏷️', label: 'Category', value: item.category },
                  { icon: '📅', label: 'Date reported', value: item.date_reported ? formatDate(item.date_reported) : undefined },
                ].filter(f => f.value).map(({ icon, label, value }) => (
                  <div key={label} style={{ background: 'var(--bg-surface-hover)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{icon} {value}</div>
                  </div>
                ))}
              </div>

              {/* Action — Message the person who reported this item */}
              {item.status !== 'closed' && item.user_id && userId !== item.user_id && (
                <button
                  id="contact-finder-btn"
                  className="btn btn-primary"
                  onClick={() => openMessageModal(item.user_id!, item.title)}
                  style={{ padding: '11px 28px', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  {isLost ? 'I found this — contact owner' : 'This is mine — contact finder'}
                </button>
              )}
              {item.status === 'closed' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--success-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontWeight: 600, fontSize: 14 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Item resolved & handed over
                </div>
              )}
            </div>
          </div>

          {/* AI Matches */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
                AI-matched items
              </h2>
              {matches.length > 0 && (
                <span className="badge badge-matched">{matches.length} match{matches.length !== 1 ? 'es' : ''}</span>
              )}
            </div>

            {loadingMatches ? (
              <div style={{ display: 'grid', gap: 16 }}>
                {[1, 2].map((i) => (
                  <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
                    <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 12 }} />
                    <div className="skeleton" style={{ height: 120 }} />
                  </div>
                ))}
              </div>
            ) : matches.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '40px 24px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  No matches found yet. The AI will keep scanning as new items are reported.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    currentItem={item}
                    onClaim={() => {
                      const matchedUserId = match.matched_item?.user_id;
                      const matchedTitle = match.matched_item?.title || item.title;
                      if (matchedUserId) {
                        openMessageModal(matchedUserId, matchedTitle);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {messageModalOpen && messageReceiverId && (
        <MessageModal
          itemId={item.id}
          itemTitle={claimReceiverTitle || item.title}
          receiverId={messageReceiverId}
          onClose={() => setMessageModalOpen(false)}
          onSuccess={() => {
            setMessageModalOpen(false);
          }}
        />
      )}
    </>
  );
}

export default function ItemDetailPage() {
  return (
    <>
      <Navbar />
      <AuthGuard>
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
            <div className="spinner" style={{ width: 40, height: 40 }} />
          </div>
        }>
          <ItemDetail />
        </Suspense>
      </AuthGuard>
    </>
  );
}