'use client';

import Link from 'next/link';
import Image from 'next/image';
import { formatDate, getStatusClass, capitalize } from '@/lib/utils';

export interface Item {
  id: string;
  type: 'lost' | 'found';
  title: string;
  description?: string;
  category?: string;
  location?: string;
  image_url?: string;
  status: 'open' | 'matched' | 'closed';
  date_reported?: string;
  created_at: string;
  user_id?: string;
}

interface Props {
  item: Item;
}

export default function ItemCard({ item }: Props) {
  const isLost = item.type === 'lost';

  return (
    <Link
      href={`/items/${item.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <article
        className="card card-interactive animate-fade-in"
        style={{ overflow: 'hidden', cursor: 'pointer' }}
      >
        {/* Image */}
        <div style={{
          position: 'relative',
          aspectRatio: '4/3',
          background: 'var(--bg-surface-hover)',
          overflow: 'hidden',
        }}>
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.title}
              fill
              style={{ objectFit: 'cover', transition: 'transform 300ms ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-tertiary)',
              gap: 8,
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span style={{ fontSize: 12 }}>No image</span>
            </div>
          )}

          {/* Type badge overlay */}
          <div style={{ position: 'absolute', top: 10, left: 10 }}>
            <span className={`badge ${isLost ? 'badge-lost' : 'badge-found'}`}>
              {isLost ? 'Lost' : 'Found'}
            </span>
          </div>

          {/* Status badge (only if not open) */}
          {item.status !== 'open' && (
            <div style={{ position: 'absolute', top: 10, right: 10 }}>
              <span className={`badge ${getStatusClass(item.status)}`}>
                {capitalize(item.status)}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '16px' }}>
          <h3 style={{
            fontSize: 15, fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {item.title}
          </h3>

          {item.description && (
            <p style={{
              fontSize: 13, color: 'var(--text-secondary)',
              lineHeight: 1.5, marginBottom: 12,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {item.description}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {item.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{item.location}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span style={{ fontSize: 12 }}>{formatDate(item.created_at)}</span>
            </div>
          </div>

          {item.category && (
            <div style={{ marginTop: 10 }}>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: 'var(--text-tertiary)',
                background: 'var(--bg-surface-hover)',
                padding: '3px 8px', borderRadius: 'var(--radius-full)',
                letterSpacing: '0.03em',
              }}>
                {item.category}
              </span>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}
