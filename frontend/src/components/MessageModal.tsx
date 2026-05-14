'use client';

import { useState } from 'react';
import api from '@/lib/api';

interface Props {
  itemId: string;
  itemTitle: string;
  receiverId: string;
  receiverEmail?: string;
  receiverRole?: 'owner' | 'finder';
  onClose: () => void;
  onSuccess: () => void;
}

export default function MessageModal({ itemId, itemTitle, receiverId, receiverEmail, receiverRole = 'finder', onClose, onSuccess }: Props) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) { setError('Please write a message.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/messages', {
        item_id: itemId,
        receiver_id: receiverId,
        content: message.trim(),
      });
      setSent(true);
      setTimeout(onSuccess, 2000);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Failed to send message. Please try again.'
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
        style={{ width: '100%', maxWidth: 480, padding: 32 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-modal-title"
      >
        {!sent ? (
          <>
            {/* Header icon */}
            <div style={{
              width: 48, height: 48,
              background: 'var(--accent-subtle)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20, color: 'var(--accent)',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>

            <h2
              id="message-modal-title"
              style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}
            >
              {receiverRole === 'owner' ? 'Contact the owner' : 'Contact the finder'}
            </h2>

            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>
              You&apos;re reaching out about <strong style={{ color: 'var(--text-primary)' }}>{itemTitle}</strong>.
            </p>
            {receiverEmail && (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>
                To: {receiverEmail}
              </p>
            )}

            {/* Message textarea */}
            <div style={{ marginBottom: 16 }}>
              <textarea
                id="message-modal-input"
                className="input"
                placeholder="Hi! I think this might be mine. I lost it near the library on Monday…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={1000}
                style={{ resize: 'vertical', minHeight: 100 }}
                autoFocus
                disabled={loading}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {message.length}/1000
                </span>
              </div>
            </div>

            {error && <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
              <button
                id="send-message-btn"
                className="btn btn-primary"
                onClick={handleSend}
                disabled={loading || !message.trim()}
              >
                {loading ? (
                  <><div className="spinner" style={{ width: 16, height: 16 }} /> Sending…</>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                    Send message
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{
              width: 64, height: 64,
              background: 'var(--success-subtle)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', color: 'var(--success)',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Message sent!
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {receiverRole === 'owner' ? 'The owner' : 'The finder'} has been notified. Check your messages for their reply.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
