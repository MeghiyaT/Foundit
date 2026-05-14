'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

interface Stats {
  total_items: number;
  open: number;
  matched: number;
  closed: number;
  resolution_rate: number;
}

export default function HomePage() {
  const { isSignedIn } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void isSignedIn;
    api.get('/admin/stats')
      .then(({ data }) => setStats(data))
      .catch(() => setStats(null));
  }, [isSignedIn]);

  const statItems = stats ? [
    { label: 'Items reported', value: stats.total_items, icon: '📦', highlight: false },
    { label: 'Awaiting match', value: stats.open, icon: '🔍', highlight: false },
    { label: 'Matched', value: stats.matched, icon: '🤝', highlight: false },
    { label: 'Resolved', value: stats.closed, icon: '✅', highlight: true },
  ] : [
    { label: 'Items reported', value: '—', icon: '📦', highlight: false },
    { label: 'Awaiting match', value: '—', icon: '🔍', highlight: false },
    { label: 'Matched', value: '—', icon: '🤝', highlight: false },
    { label: 'Resolved', value: '—', icon: '✅', highlight: true },
  ];

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, background: 'var(--bg-primary)' }}>
        {/* Hero banner */}
        <section style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          padding: '48px 0 0',
        }}>
          <div className="container-main">
            <div className="animate-fade-in-up">
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '5px 12px',
                background: 'var(--accent-subtle)',
                borderRadius: 'var(--radius-full)',
                marginBottom: 16,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  AI-Powered Matching
                </span>
              </div>
              <h1 style={{
                fontSize: 'clamp(28px, 4vw, 40px)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                marginBottom: 12,
                maxWidth: 560,
              }}>
                Lost something? <br />
                <span style={{ color: 'var(--accent)' }}>Your campus has it.</span>
              </h1>
              <p style={{
                fontSize: 16,
                color: 'var(--text-secondary)',
                maxWidth: 480,
                lineHeight: 1.7,
                marginBottom: 32,
              }}>
                Post a photo of what you lost. Our AI scans every found item visually—no keyword matching, no manual search.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link href="/report" className="btn btn-primary" id="report-lost-btn" style={{ padding: '11px 24px', fontSize: 15 }}>
                  Report a lost item
                </Link>
                <Link href="/report?type=found" className="btn btn-secondary" id="report-found-btn" style={{ padding: '11px 24px', fontSize: 15 }}>
                  I found something
                </Link>
              </div>
            </div>

            {/* Live stats bar */}
            <div style={{
              display: 'flex', gap: 0, marginTop: 40,
              borderTop: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}>
              {statItems.map(({ label, value, icon, highlight }, i) => (
                <div
                  key={label}
                  style={{
                    flex: '1 1 140px',
                    padding: '20px 24px',
                    borderRight: i < 3 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
                  <div style={{
                    fontSize: 28, fontWeight: 800,
                    color: highlight ? 'var(--success)' : 'var(--text-primary)',
                    letterSpacing: '-0.02em', marginBottom: 2,
                  }}>
                    {value}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: '64px 0', borderBottom: '1px solid var(--border)' }}>
          <div className="container-main">
            <h2 style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 40,
            }}>
              How it works
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 24,
            }}>
              {[
                {
                  step: '01',
                  title: 'Post with a photo',
                  desc: 'Report a lost or found item with an image and location. Takes under a minute.',
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  ),
                  color: 'var(--accent)',
                  colorSubtle: 'var(--accent-subtle)',
                },
                {
                  step: '02',
                  title: 'AI finds matches',
                  desc: 'Text embeddings compare your item against every found object in the database.',
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="m21 21-4.35-4.35"/>
                    </svg>
                  ),
                  color: 'var(--warning)',
                  colorSubtle: 'var(--warning-subtle)',
                },
                {
                  step: '03',
                  title: 'Message & collect',
                  desc: 'Contact the person directly through our messaging system and arrange the handover.',
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  ),
                  color: 'var(--success)',
                  colorSubtle: 'var(--success-subtle)',
                },
              ].map(({ step, title, desc, icon, color, colorSubtle }) => (
                <div
                  key={step}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 24,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{
                    width: 44, height: 44, background: colorSubtle,
                    borderRadius: 12, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color, marginBottom: 16,
                  }}>
                    {icon}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 6 }}>
                    STEP {step}
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    {title}
                  </h3>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quick jump to feed */}
        <section style={{ padding: '64px 0' }}>
          <div className="container-main" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
              Browse reported items
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 28 }}>
              See what&apos;s been lost and found on campus today.
            </p>
            <Link href="/items" className="btn btn-secondary" id="browse-items-btn" style={{ padding: '11px 28px', fontSize: 15 }}>
              View all items →
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
