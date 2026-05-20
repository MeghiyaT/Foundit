'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import ClaimModal from '@/components/ClaimModal';
import api from '@/lib/api';
import { useAuth } from '@clerk/nextjs';

interface Conversation {
  id: string;
  item_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  other_user_id: string;
  item_title: string;
  item_image_url?: string;
  item_owner_id?: string;
  item_type?: string;
  other_user_email: string;
  other_user_name?: string;
}

interface ThreadMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

interface ThreadItem {
  id: string;
  title: string;
  type: string;
  status: string;
  user_id: string;
  image_url?: string;
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [threadItem, setThreadItem] = useState<ThreadItem | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [otherUser, setOtherUser] = useState<{ email: string; name?: string } | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [userRole, setUserRole] = useState<'owner' | 'finder'>('finder');
  const { userId, isLoaded: authLoaded } = useAuth();
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      if (!authLoaded || !userId) return;

      setLoading(true);
      try {
        // tokenProvider in api.ts handles auth — no manual header needed
        const { data } = await api.get('/messages/conversations');
        setConversations(data.conversations || []);
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authLoaded, userId]);

  const openThread = async (conv: Conversation) => {
    setSelectedConv(conv);
    setSidebarVisible(false);
    setLoadingThread(true);
    // Set role eagerly from conv.item_owner_id before any async work
    if (conv.item_owner_id && userId) {
      const isPoster = conv.item_owner_id === userId;
      if (conv.item_type === 'found') {
        setUserRole(isPoster ? 'finder' : 'owner');
      } else {
        setUserRole(isPoster ? 'owner' : 'finder');
      }
    }
    try {
      const { data } = await api.get(`/messages/thread/${conv.item_id}/${conv.other_user_id}`);
      setThread(data.messages || []);
      setOtherUser(data.other_user);
      const item = data.item || null;
      setThreadItem(item);
      if (item && userId) {
        const isPoster = item.user_id === userId;
        if (item.type === 'found') {
          setUserRole(isPoster ? 'finder' : 'owner');
        } else {
          setUserRole(isPoster ? 'owner' : 'finder');
        }
      }
    } catch {
      setThread([]);
      setThreadItem(null);
    } finally {
      setLoadingThread(false);
    }
  };

  const handleBackToSidebar = () => {
    setSidebarVisible(true);
    setSelectedConv(null);
    setThread([]);
    setThreadItem(null);
    setUserRole('finder');
  };

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  // Auto-refresh the active thread every 5 seconds
  useEffect(() => {
    if (!selectedConv) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/messages/thread/${selectedConv.item_id}/${selectedConv.other_user_id}`);
        setThread(data.messages || []);
      } catch {
        // Silently ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedConv]);

  const handleSend = async () => {
    if (!newMsg.trim() || !selectedConv) return;
    setSending(true);
    setSendError(false);
    try {
      await api.post('/messages', {
        item_id: selectedConv.item_id,
        receiver_id: selectedConv.other_user_id,
        content: newMsg.trim(),
      });
      setNewMsg('');
      // Reload thread
      const { data } = await api.get(`/messages/thread/${selectedConv.item_id}/${selectedConv.other_user_id}`);
      setThread(data.messages || []);
    } catch {
      setSendError(true);
      setTimeout(() => setSendError(false), 4000);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
  };

  // Can the user initiate a claim from this thread?
  const canClaim = threadItem && threadItem.status !== 'closed';

  const handleClaimComplete = () => {
    setShowClaimModal(false);
    if (selectedConv) openThread(selectedConv);
  };

  const handleDeleteConversation = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't open the thread
    if (!window.confirm(`Delete the conversation about "${conv.item_title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/messages/thread/${conv.item_id}/${conv.other_user_id}`);
      setConversations(prev => prev.filter(c => !(c.item_id === conv.item_id && c.other_user_id === conv.other_user_id)));
      if (selectedConv?.item_id === conv.item_id && selectedConv?.other_user_id === conv.other_user_id) {
        handleBackToSidebar();
      }
    } catch {
      // Silently ignore — could show toast here
    }
  };

  return (
    <>
      <Navbar />
      <AuthGuard>
        <main style={{ flex: 1, background: 'var(--bg-primary)', padding: '40px 0 80px' }}>
          <div className="container-main" style={{ maxWidth: 960 }}>

            <div className="animate-fade-in-up" style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                Messages
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                Talk directly with people about lost & found items.
              </p>
            </div>

            <div className={`card messages-layout${selectedConv ? ' thread-open' : ''}`} style={{
              display: 'grid',
              gridTemplateColumns: '320px 1fr',
              minHeight: 520,
              overflow: 'hidden',
              padding: 0,
            }}>
              {/* Conversations sidebar */}
              <div className="messages-sidebar" style={{ borderRight: '1px solid var(--border)', overflow: 'auto' }}>
                {loading ? (
                  <div style={{ padding: 20 }}>
                    {[1, 2, 3].map(i => (
                      <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8, borderRadius: 'var(--radius-md)' }} />
                    ))}
                  </div>
                ) : conversations.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                      No messages yet. Go to Matches and message someone about a match!
                    </p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={`${conv.item_id}-${conv.other_user_id}`}
                      onClick={() => openThread(conv)}
                      style={{
                        display: 'flex', gap: 12, alignItems: 'center',
                        width: '100%', padding: '14px 16px',
                        border: 'none', borderBottom: '1px solid var(--border)',
                        background: selectedConv?.item_id === conv.item_id && selectedConv?.other_user_id === conv.other_user_id
                          ? 'var(--bg-surface-hover)' : 'transparent',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'background 150ms ease',
                        position: 'relative',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent-subtle)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>
                        💬
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conv.item_title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conv.other_user_name || conv.other_user_email} · {formatTime(conv.created_at)}
                        </div>
                      </div>
                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDeleteConversation(conv, e)}
                        title="Delete conversation"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '4px', color: 'var(--text-tertiary)',
                          opacity: 0.6, flexShrink: 0,
                          display: 'flex', alignItems: 'center',
                          borderRadius: 'var(--radius-sm)',
                          transition: 'opacity 150ms ease, color 150ms ease',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </button>
                  ))
                )}
              </div>

              {/* Thread / Chat area */}
              <div className="messages-thread" style={{ display: 'flex', flexDirection: 'column' }}>
                {!selectedConv ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <div style={{ fontSize: 48, marginBottom: 16 }}>📨</div>
                      <p style={{ fontSize: 15 }}>Select a conversation to start chatting</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Thread header */}
                    <div style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      {/* Back button (visible on mobile) */}
                      <button
                        className="messages-back-btn"
                        onClick={handleBackToSidebar}
                        style={{
                          display: 'none',
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '4px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="15 18 9 12 15 6"/>
                        </svg>
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {selectedConv.item_title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          with {otherUser?.name || otherUser?.email || selectedConv.other_user_email}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Claim Item button */}
                        {canClaim && (
                          <button
                            id="claim-item-btn"
                            className="btn btn-primary"
                            onClick={() => setShowClaimModal(true)}
                            style={{ padding: '7px 16px', fontSize: 13, gap: 6 }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            </svg>
                            {userRole === 'owner' ? 'Initiate Claim' : 'Complete Claim'}
                          </button>
                        )}
                        {threadItem?.status === 'closed' && (
                          <span className="badge badge-closed" style={{ fontSize: 12 }}>
                            ✓ Resolved
                          </span>
                        )}
                        <Link
                          href={`/items/${selectedConv.item_id}`}
                          style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          View item →
                        </Link>
                      </div>
                    </div>

                    {/* Messages area */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {loadingThread ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                          <div className="spinner" style={{ width: 24, height: 24 }} />
                        </div>
                      ) : thread.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No messages in this thread yet.</p>
                        </div>
                      ) : (
                        thread.map((msg) => {
                          const isMe = msg.sender_id === userId;
                          return (
                            <div
                              key={msg.id}
                              style={{
                                display: 'flex',
                                justifyContent: isMe ? 'flex-end' : 'flex-start',
                              }}
                            >
                              <div style={{
                                maxWidth: '75%',
                                padding: '10px 14px',
                                borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                background: isMe ? 'var(--accent)' : 'var(--bg-surface-hover)',
                                color: isMe ? 'white' : 'var(--text-primary)',
                                fontSize: 14, lineHeight: 1.5,
                              }}>
                                <div>{msg.content}</div>
                                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: 'right' }}>
                                  {formatTime(msg.created_at)}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={threadEndRef} />
                    </div>

                    {/* Send error banner */}
                    {sendError && (
                      <div style={{
                        padding: '8px 20px',
                        background: 'var(--danger-subtle)',
                        color: 'var(--danger)',
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: 'center',
                      }}>
                        Failed to send message. Please try again.
                      </div>
                    )}

                    {/* Input */}
                    <div style={{
                      padding: '12px 20px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex', gap: 10,
                    }}>
                      <input
                        className="input"
                        type="text"
                        placeholder="Type a message…"
                        value={newMsg}
                        onChange={(e) => setNewMsg(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        disabled={sending}
                        style={{ flex: 1 }}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={handleSend}
                        disabled={sending || !newMsg.trim()}
                        style={{ padding: '8px 16px' }}
                      >
                        {sending ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </main>

        {/* Claim Modal */}
        {showClaimModal && selectedConv && threadItem && (
          <ClaimModal
            itemId={selectedConv.item_id}
            itemTitle={selectedConv.item_title}
            otherUserId={selectedConv.other_user_id}
            role={userRole}
            onClose={() => setShowClaimModal(false)}
            onComplete={handleClaimComplete}
          />
        )}
      </AuthGuard>
    </>
  );
}