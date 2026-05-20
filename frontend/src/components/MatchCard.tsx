'use client';

import Link from 'next/link';
import Image from 'next/image';
import { formatSimilarity } from '@/lib/utils';
import type { Item } from '@/components/ItemCard';

interface Match {
  id: string;
  similarity_score: number;
  status: 'pending' | 'confirmed' | 'rejected';
  matched_item: Item;
}

interface Props {
  match: Match;
  currentItem: Item;
  onClaim?: () => void;
}

function SimilarityRing({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--accent)';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '12px 16px',
      background: 'var(--bg-surface-hover)',
      borderRadius: 'var(--radius-md)',
      minWidth: 80,
    }}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="22" cy="22" r="18"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${2 * Math.PI * 18}`}
          strokeDashoffset={`${2 * Math.PI * 18 * (1 - score)}`}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
        <text x="22" y="27" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>
          {pct}%
        </text>
      </svg>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>MATCH</span>
    </div>
  );
}

export default function MatchCard({ match, currentItem, onClaim }: Props) {
  const matched = match.matched_item;
  if (!matched) return null;

  return (
    <div
      className="card animate-fade-in"
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: match.status === 'confirmed' ? 'var(--success)' : match.status === 'rejected' ? 'var(--danger)' : 'var(--warning)',
        }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {match.status === 'confirmed' ? 'Match confirmed' : match.status === 'rejected' ? 'Match rejected' : 'Potential match — AI similarity'}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: match.similarity_score >= 0.9 ? 'var(--success)' : match.similarity_score >= 0.75 ? 'var(--warning)' : 'var(--accent)',
          }}>
            {formatSimilarity(match.similarity_score)} similar
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, minHeight: 140 }}>
        {/* Your item */}
        <div style={{ flex: 1, padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {currentItem.image_url && (
            <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
              <Image src={currentItem.image_url} alt={currentItem.title} fill sizes="72px" style={{ objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>YOUR ITEM</div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{currentItem.title}</p>
            {currentItem.location && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📍 {currentItem.location}</p>
            )}
          </div>
        </div>

        {/* Similarity ring */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
          <SimilarityRing score={match.similarity_score} />
        </div>

        {/* Matched item */}
        <div style={{ flex: 1, padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start', background: 'var(--bg-surface-hover)' }}>
          {matched.image_url && (
            <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
              <Image src={matched.image_url} alt={matched.title} fill sizes="72px" style={{ objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>
              {matched.type === 'found' ? 'FOUND ITEM' : 'LOST ITEM'}
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{matched.title}</p>
            {matched.location && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📍 {matched.location}</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link
          href={`/items/${matched.id}`}
          style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
        >
          View found item →
        </Link>
        {match.status === 'confirmed' && onClaim && currentItem.status !== 'closed' && (
          <button
            id={`claim-match-${match.id}-btn`}
            className="btn btn-primary"
            onClick={onClaim}
            style={{ marginLeft: 'auto', padding: '7px 20px', fontSize: 13 }}
          >
            Claim item
          </button>
        )}
      </div>
    </div>
  );
}
