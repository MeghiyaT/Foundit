'use client';

import { useState } from 'react';
import api from '@/lib/api';

interface Props {
  itemId: string;
  itemTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'confirm' | 'otp' | 'success' | 'error';

export default function ClaimModal({ itemId, itemTitle, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('confirm');
  const [claimId, setClaimId] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInitiateClaim = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/claims', { item_id: itemId });
      setClaimId(data.id);
      setStep('otp');
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Failed to initiate claim. Try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError('Enter the 6-digit OTP.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post(`/claims/${claimId}/verify`, { otp });
      setStep('success');
      setTimeout(onSuccess, 1800);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Invalid or expired OTP.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'var(--bg-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="animate-fade-in-up card"
        style={{ width: '100%', maxWidth: 440, padding: 32 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-modal-title"
      >
        {step === 'confirm' && (
          <>
            <div style={{ width: 48, height: 48, background: 'var(--accent-subtle)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, color: 'var(--accent)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h2 id="claim-modal-title" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Claim this item
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              You're claiming <strong style={{ color: 'var(--text-primary)' }}>{itemTitle}</strong>.
              We'll send a one-time verification code to your email to confirm your identity.
            </p>
            {error && <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
              <button
                id="send-otp-btn"
                className="btn btn-primary"
                onClick={handleInitiateClaim}
                disabled={loading}
              >
                {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Sending…</> : 'Send OTP'}
              </button>
            </div>
          </>
        )}

        {step === 'otp' && (
          <>
            <div style={{ width: 48, height: 48, background: 'var(--success-subtle)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, color: 'var(--success)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Enter your OTP
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Check your email for a 6-digit code. It expires in 15 minutes.
            </p>
            <div style={{ marginBottom: 16 }}>
              <input
                id="otp-input"
                className="input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.3em', textAlign: 'center' }}
                autoFocus
              />
            </div>
            {error && <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setStep('confirm'); setError(''); }} disabled={loading}>Back</button>
              <button
                id="verify-otp-btn"
                className="btn btn-primary"
                onClick={handleVerifyOtp}
                disabled={loading || otp.length !== 6}
              >
                {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Verifying…</> : 'Verify & Claim'}
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: 64, height: 64, background: 'var(--success-subtle)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--success)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Claimed!</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Identity verified. Collect your item from the security office.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
