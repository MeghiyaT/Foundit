import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: 24,
      flexDirection: 'column',
      textAlign: 'center',
    }}>
      {/* Giant 404 */}
      <div style={{
        fontSize: 'clamp(80px, 15vw, 140px)',
        fontWeight: 900,
        color: 'var(--accent)',
        lineHeight: 1,
        letterSpacing: '-0.04em',
        marginBottom: 8,
        opacity: 0.15,
        userSelect: 'none',
      }}>
        404
      </div>

      {/* Search icon */}
      <div style={{
        width: 72, height: 72,
        background: 'var(--accent-subtle)',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '-60px auto 24px',
        position: 'relative',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
      </div>

      <h1 style={{
        fontSize: 'clamp(22px, 4vw, 30px)',
        fontWeight: 700,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        marginBottom: 12,
      }}>
        This page got lost too
      </h1>
      <p style={{
        fontSize: 15,
        color: 'var(--text-secondary)',
        maxWidth: 380,
        lineHeight: 1.7,
        marginBottom: 32,
      }}>
        The page you&apos;re looking for doesn&apos;t exist or was moved.
        Try going back to the homepage or browsing reported items.
      </p>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/" className="btn btn-primary" id="404-home-btn" style={{ padding: '11px 28px', fontSize: 15 }}>
          Go Home
        </Link>
        <Link href="/items" className="btn btn-secondary" id="404-browse-btn" style={{ padding: '11px 28px', fontSize: 15 }}>
          Browse Items
        </Link>
      </div>
    </main>
  );
}
