'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser, useAuth, UserButton, SignInButton } from '@clerk/nextjs';
import api, { setTokenProvider } from '@/lib/api';
import { connectWallet, isMetaMaskInstalled, switchToSepolia } from '@/lib/blockchain';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/items', label: 'Browse' },
  { href: '/my-items', label: 'My Items' },
  { href: '/matches', label: 'Matches' },
  { href: '/report', label: 'Report Item' },
  { href: '/messages', label: 'Messages' },
  { href: '/profile', label: 'Profile' },
  { href: '/admin', label: 'Admin' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('foundit_theme') === 'dark';
    }
    return false;
  });

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : '');
    localStorage.setItem('foundit_theme', next ? 'dark' : 'light');
  };

  // Apply saved theme on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('foundit_theme') : null;
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      setDarkMode(true);
    }
  }, []);
  const [isAdmin, setIsAdmin] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('foundit_isAdmin') === 'true';
    }
    return false;
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && isMetaMaskInstalled()) {
      window.ethereum?.request({ method: 'eth_accounts' })
        .then((accounts: any) => {
          if (accounts && accounts.length > 0) {
            setWalletAddress(accounts[0]);
          }
        })
        .catch(console.error);
    }
  }, []);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleConnectWallet = async () => {
    try {
      if (!isMetaMaskInstalled()) {
        showToast("MetaMask is not installed! Please install it to connect.", "error");
        return;
      }
      let info = await connectWallet();
      if (!info.isCorrectNetwork) {
        await switchToSepolia();
        info = await connectWallet();
      }
      setWalletAddress(info.address);
      showToast("Wallet connected successfully!", "success");
    } catch (e: any) {
      console.error("Wallet connection failed", e);
      if (e?.message) showToast(e.message, "error");
    }
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      setTokenProvider(async () => {
        if (!isSignedIn) return null;
        try { return await getToken(); } catch { return null; }
      });

      if (isSignedIn) {
        api.post('/auth/verify')
          .then(({ data }) => {
            const adminRole = data.role === 'admin';
            setIsAdmin(adminRole);
            if (typeof window !== 'undefined') {
              localStorage.setItem('foundit_isAdmin', String(adminRole));
              sessionStorage.setItem('foundit_profile', JSON.stringify(data));
            }
          })
          .catch(() => {
            setIsAdmin(false);
            if (typeof window !== 'undefined') {
              localStorage.setItem('foundit_isAdmin', 'false');
              sessionStorage.removeItem('foundit_profile');
            }
          });
      } else {
        setIsAdmin(false);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('foundit_isAdmin');
          sessionStorage.removeItem('foundit_profile');
        }
      }
    }
  }, [isLoaded, isSignedIn, getToken]);

  useEffect(() => {
    if (isLoaded && isSignedIn && user?.id) {
      // Fetch conversation count for the badge
      api.get('/messages/conversations')
        .then(({ data }) => {
          if (pathname === '/messages') {
            setUnreadCount(0);
          } else {
            const conversations = data.conversations || [];
            let lastRead = '1970-01-01T00:00:00.000Z';
            if (typeof window !== 'undefined') {
              lastRead = localStorage.getItem('foundit_last_read_time') || lastRead;
            }
            // Use last_message_at (most recent activity) not created_at (conversation start)
            const unread = conversations.filter((c: any) => {
              const msgTime = c.last_message_at || c.created_at;
              return msgTime > lastRead && c.sender_id !== user.id;
            }).length;
            setUnreadCount(unread);
          }
        })
        .catch(() => setUnreadCount(0));
    } else if (isLoaded && !isSignedIn) {
      setUnreadCount(0);
    }
  }, [isLoaded, isSignedIn, pathname, user?.id]);

  useEffect(() => {
    if (pathname === '/messages' && typeof window !== 'undefined') {
      setUnreadCount(0);
      localStorage.setItem('foundit_last_read_time', new Date().toISOString());
    }
  }, [pathname]);

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
            const showBadge = link.href === '/messages' && unreadCount > 0 && !active;
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  position: 'relative',
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
                {showBadge && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 18, height: 18, padding: '0 5px',
                    background: 'var(--accent)', color: 'white',
                    fontSize: 10, fontWeight: 700, borderRadius: 'var(--radius-full)',
                    lineHeight: 1,
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          {/* Dark mode toggle — always visible, even before login */}
          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              padding: '6px 8px', display: 'inline-flex', alignItems: 'center',
              color: 'var(--text-secondary)', transition: 'all 150ms ease',
            }}
          >
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>

          {isSignedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="btn btn-secondary hidden-mobile"
                onClick={handleConnectWallet}
                style={{ padding: '6px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Connect Wallet'}
              </button>
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
        }
      `}
      </style>

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
    </header>
  );
}
