'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Step = 'enter-email' | 'check-email' | 'error';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('enter-email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If already logged in, redirect
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/');
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/` },
    });

    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setStep('check-email');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'var(--bg-primary)',
    }}>
      <div
        className="animate-fade-in-up"
        style={{
          width: '100%',
          maxWidth: 420,
        }}
      >
        {/* Logo mark */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56,
            background: 'var(--accent)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Foundit
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 6 }}>
            Smart Lost &amp; Found for your campus
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: 32,
          boxShadow: 'var(--shadow-lg)',
        }}>
          {step === 'enter-email' && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                Sign in to continue
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                We&apos;ll send a magic link to your email. No password needed.
              </p>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label
                    htmlFor="email-input"
                    style={{
                      display: 'block', fontSize: 13, fontWeight: 600,
                      color: 'var(--text-primary)', marginBottom: 6,
                    }}
                  >
                    College email address
                  </label>
                  <input
                    id="email-input"
                    type="email"
                    className="input"
                    placeholder="you@college.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                {error && (
                  <div style={{
                    padding: '10px 14px',
                    background: 'var(--danger-subtle)',
                    border: '1px solid var(--danger)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    color: 'var(--danger)',
                    marginBottom: 16,
                  }}>
                    {error}
                  </div>
                )}

                <button
                  id="send-magic-link-btn"
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !email.trim()}
                  style={{ width: '100%', padding: '11px 20px', fontSize: 15 }}
                >
                  {loading ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                      Sending…
                    </>
                  ) : (
                    'Send magic link'
                  )}
                </button>
              </form>
            </>
          )}

          {step === 'check-email' && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 56, height: 56, background: 'var(--success-subtle)',
                borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 20px',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                Check your inbox
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                We sent a magic link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
                Click the link to sign in — it expires in 1 hour.
              </p>
              <button
                onClick={() => setStep('enter-email')}
                className="btn btn-ghost"
                style={{ marginTop: 24, fontSize: 14 }}
              >
                Use a different email
              </button>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)', marginTop: 24 }}>
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
