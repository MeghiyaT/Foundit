'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser, useAuth, UserButton, SignInButton } from '@clerk/nextjs';
import api from '@/lib/api';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/items', label: 'Browse' },
  { href: '/my-items', label: 'My Items' },
  { href: '/report', label: 'Report Item' },
  { href: '/messages', label: 'Messages' },
  { href: '/admin', label: 'Admin' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      api.post('/auth/verify')
        .then(({ data }) => setIsAdmin(data.role === 'admin'))
        .catch(() => setIsAdmin(false));
    } else {
      setIsAdmin(false);
    }
  }, [isSignedIn]);

  const visibleNavLinks = NAV_LINKS.filter(link => link.href !== '/admin' || isAdmin);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: scrolled ? 'var(--bg-surface)' : 'var(--bg-primary)',
        borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
        boxShadow: scrolled ? 'var(--shadow-sm)' : 'none',
        transition: 'background 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
      }}
    >
      <div className="container-main" style={{ display: 'flex', alignItems: 'center', height: 64, gap: 32 }}>
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <span style={{
            width: 32, height: 32,
            background: 'var(--accent)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Foundit
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav style={{ display: 'flex', gap: 4, flex: 1 }} className="hidden-mobile">
          {visibleNavLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  background: active ? 'var(--accent-subtle)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-hover)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                  }
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          {isSignedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {(user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress) && (
                <span className="hidden-mobile" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {user.fullName || user.username || user.primaryEmailAddress?.emailAddress}
                </span>
              )}
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: { width: 36, height: 36 },
                  },
                }}
              />
            </div>
          ) : (
            <SignInButton mode="modal">
              <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: 14 }}>
                Sign in
              </button>
            </SignInButton>
          )}

          {/* Mobile hamburger */}
          <button
            id="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            className="show-mobile"
            style={{
              display: 'none',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 8, color: 'var(--text-primary)',
            }}
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen
                ? <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>
                : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="show-mobile animate-slide-down"
          style={{
            borderTop: '1px solid var(--border)',
            padding: '8px 0',
            background: 'var(--bg-surface)',
          }}
        >
          {visibleNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                display: 'block', padding: '12px 24px',
                fontSize: 15, fontWeight: 500,
                color: pathname === link.href ? 'var(--accent)' : 'var(--text-primary)',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}

      <style>{`
        @media (min-width: 640px) {
          .hidden-mobile { display: flex !important; }
          .show-mobile { display: none !important; }
        }
        @media (max-width: 639px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: block !important; }
          #mobile-menu-btn { display: block !important; }
        }
      `}
      </style>
    </header>
  );
}
