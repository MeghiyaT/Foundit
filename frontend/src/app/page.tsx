'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { supabase } from '@/lib/supabaseClient';

export default function HomePage() {
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? '');
    });
  }, []);

  return (
    <>
      <Navbar />
      <AuthGuard>
        <main style={{ flex: 1, background: 'var(--bg-primary)' }}>
          {/* Hero banner */}
          <section style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            padding: '48px 0',
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
                    desc: 'CLIP image embeddings compare your item against every found object in the database.',
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
                    title: 'Verify & collect',
                    desc: 'Claim your item, verify identity via OTP email, and pick it up from the security office.',
                    icon: (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
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
      </AuthGuard>
    </>
  );
}
