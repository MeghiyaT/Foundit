'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import {
  isMetaMaskInstalled,
  connectWallet,
  switchToSepolia,
  initiateClaimOnChain,
  completeClaimOnChain,
  computeClaimKey,
  getRewardBalance,
  getEtherscanTxUrl,
  type BlockchainConfig,
  type WalletInfo,
} from '@/lib/blockchain';

interface Props {
  itemId: string;
  itemTitle: string;
  /** The "other" user's ID — if current user is owner, this is the finder. */
  otherUserId: string;
  /** The current user's role in this conversation: 'owner' or 'finder'. */
  role: 'owner' | 'finder';
  onClose: () => void;
  onComplete: () => void;
}

type Step = 'wallet' | 'initiate' | 'waiting' | 'enter_code' | 'blockchain' | 'success';

export default function ClaimModal({ itemId, itemTitle, otherUserId, role, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>('wallet');
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [blockchainConfig, setBlockchainConfig] = useState<BlockchainConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Owner flow state
  const [secretCode, setSecretCode] = useState('');
  const [claimId, setClaimId] = useState('');
  /**
   * On-chain internal key: keccak256(claimId, ownerWallet).
   * Stored after initiateClaim so completeClaim (finder) can look it up.
   */
  const [internalKey, setInternalKey] = useState('');
  const [copied, setCopied] = useState(false);

  // Finder flow state
  const [inputCode, setInputCode] = useState('');
  const [txHash, setTxHash] = useState('');
  const [rewardAmount, setRewardAmount] = useState(0);
  const [tokenBalance, setTokenBalance] = useState('');

  // Fetch blockchain config on mount
  useEffect(() => {
    api.get('/config/blockchain')
      .then(({ data }) => {
        setBlockchainConfig(data);
        if (!data.handover_registry_address || !data.reward_token_address) {
          setError('Blockchain contract addresses are not configured. Please contact the admin.');
        }
      })
      .catch(() => setError('Failed to load blockchain config.'));
  }, []);

  // Auto-detect already-connected wallet and skip the wallet step
  useEffect(() => {
    if (!isMetaMaskInstalled()) return;
    window.ethereum?.request({ method: 'eth_accounts' })
      .then(async (accounts: any) => {
        if (accounts && accounts.length > 0) {
          // Wallet already connected — rebuild wallet info silently
          const info = await connectWallet();
          if (!info.isCorrectNetwork) {
            await switchToSepolia();
            const updated = await connectWallet();
            setWallet(updated);
          } else {
            setWallet(info);
          }
          // Skip the wallet step
          setStep(role === 'owner' ? 'initiate' : 'enter_code');
        }
      })
      .catch(() => {}); // Silently ignore — user will hit "Connect MetaMask" manually
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // Defensive: if role detection is wrong, never let owners see finder-only steps (and vice versa).
  useEffect(() => {
    if (role === 'owner' && (step === 'enter_code' || step === 'blockchain')) {
      setStep('initiate');
      setError('');
    }
    if (role === 'finder' && (step === 'initiate' || step === 'waiting')) {
      setStep('enter_code');
      setError('');
    }
  }, [role, step]);

  // If finder, check for existing approved claims
  useEffect(() => {
    if (role === 'finder') {
      api.get(`/claims/item/${itemId}`)
        .then(({ data }) => {
          const approved = (data.claims || []).find(
            (c: { status: string; finder_id: string }) => c.status === 'approved' && c.finder_id !== null
          );
          if (approved) {
            setClaimId(approved.id);
            setStep('wallet');
          }
        })
        .catch(() => {});
    }
  }, [role, itemId]);

  const handleConnectWallet = async () => {
    setLoading(true);
    setError('');
    try {
      if (!isMetaMaskInstalled()) {
        setError('__NO_METAMASK__');
        setLoading(false);
        return;
      }
      const info = await connectWallet();
      if (!info.isCorrectNetwork) {
        await switchToSepolia();
        const updated = await connectWallet();
        setWallet(updated);
      } else {
        setWallet(info);
      }
      // Move to next step based on role
      if (role === 'owner') {
        setStep('initiate');
      } else {
        setStep('enter_code');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to connect wallet.');
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateClaim = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Create claim on backend — get secret code
      const { data } = await api.post('/claims', {
        item_id: itemId,
        finder_id: otherUserId,
        owner_wallet: wallet?.address || null,
      });
      setSecretCode(data.secret_code);
      setClaimId(data.id);

      const contractsDeployed = !!(blockchainConfig?.handover_registry_address && blockchainConfig?.reward_token_address);
      if (!wallet || !contractsDeployed) {
        throw new Error('MetaMask wallet and contract configuration are strictly required to initiate a claim.');
      }
      try {
        const key = computeClaimKey(data.id, wallet.address);
        setInternalKey(key);
        await initiateClaimOnChain(blockchainConfig!, data.id, itemId, data.secret_code);
      } catch (chainErr) {
        throw new Error('Blockchain transaction failed or was rejected. Claim cannot proceed without blockchain confirmation.');
      }

      setStep('waiting');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || (err as Error).message || 'Failed to initiate claim.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteClaim = async () => {
    if (!inputCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      // 1. Find the approved claim for this item
      let activeClaimId = claimId;
      let activeKey = internalKey;

      if (!activeClaimId) {
        const { data } = await api.get(`/claims/item/${itemId}`);
        const approved = (data.claims || []).find(
          (c: { status: string }) => c.status === 'approved'
        );
        if (!approved) {
          setError('No approved claim found. The owner must initiate and admin must approve first.');
          setLoading(false);
          return;
        }
        activeClaimId = approved.id;
        setClaimId(activeClaimId);

        // Recompute key only if wallet + owner_wallet both available
        if (!activeKey && approved.owner_wallet && wallet) {
          activeKey = computeClaimKey(activeClaimId, approved.owner_wallet);
          setInternalKey(activeKey);
        }
      }

      const contractsDeployed = !!(blockchainConfig?.handover_registry_address && blockchainConfig?.reward_token_address);

      // 2. Blockchain path — STRICTLY REQUIRED
      if (!wallet || !contractsDeployed || !activeKey) {
        throw new Error('Wallet connection and valid claim key are required to complete the claim and receive the FNDT reward.');
      }
      
      setStep('blockchain');
      try {
        const hash = await completeClaimOnChain(
          blockchainConfig!,
          activeKey,
          inputCode.trim(),
        );
        setTxHash(hash);

        const { data } = await api.post(`/claims/${activeClaimId}/complete`, {
          secret_code: inputCode.trim().toUpperCase(),
          tx_hash: hash,
          finder_wallet: wallet.address,
        });
        setRewardAmount(data.reward_amount);

        try {
          const balance = await getRewardBalance(blockchainConfig!, wallet.address);
          setTokenBalance(balance);
        } catch {
          setTokenBalance('');
        }
      } catch (chainErr) {
        throw new Error('Blockchain transaction failed or was rejected. You must confirm the transaction to receive your reward.');
      }

      setStep('success');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || (err as Error).message || 'Failed to complete claim.');
      if (step === 'blockchain') setStep('enter_code');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(secretCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 500,
    background: 'var(--bg-overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  };

  const modalStyle: React.CSSProperties = {
    width: '100%', maxWidth: 520, padding: 32,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)',
  };

  const iconBoxStyle = (color: string, bg: string): React.CSSProperties => ({
    width: 52, height: 52, borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, color, background: bg,
  });

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="animate-fade-in-up" style={modalStyle} role="dialog" aria-modal="true">

        {/* ===== STEP: CONNECT WALLET ===== */}
        {step === 'wallet' && (
          <>
            <div style={iconBoxStyle('var(--accent)', 'var(--accent-subtle)')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Connect Wallet
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
              {role === 'owner'
                ? `You're initiating a claim for "${itemTitle}". Connect your MetaMask wallet to record the handover on the blockchain.`
                : `You're completing a claim for "${itemTitle}". Connect your MetaMask wallet to receive your FNDT reward tokens.`
              }
            </p>
            <div style={{
              padding: '12px 16px', marginBottom: 20,
              background: 'var(--warning-subtle)',
              border: '1px solid rgba(217, 119, 6, 0.2)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13, color: 'var(--warning)', lineHeight: 1.5,
            }}>
              ⚠️ Make sure you're on the <strong>Sepolia Testnet</strong>. We'll switch automatically if needed.
            </div>

            {error === '__NO_METAMASK__' ? (
              <div style={{
                padding: '16px', marginBottom: 16,
                background: 'var(--warning-subtle)', border: '1px solid rgba(217,119,6,0.2)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warning)', marginBottom: 8 }}>
                  🦊 MetaMask Not Detected
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                  MetaMask is required to record the handover on-chain and earn FNDT tokens.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a
                    href="https://metamask.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ fontSize: 13, padding: '8px 16px' }}
                  >
                    Install MetaMask ↗
                  </a>
                </div>
              </div>
            ) : error && <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleConnectWallet} disabled={loading}>
                {loading ? (
                  <><div className="spinner" style={{ width: 16, height: 16 }} /> Connecting…</>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    Connect MetaMask
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ===== STEP: INITIATE CLAIM (Owner) ===== */}
        {role === 'owner' && step === 'initiate' && (
          <>
            <div style={iconBoxStyle('var(--warning)', 'var(--warning-subtle)')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Initiate Handover Claim
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
              This will generate a <strong>secret code</strong> that you must share with the finder <strong>in person</strong>.
            </p>

            {wallet && (
              <div style={{
                padding: '10px 14px', marginBottom: 16,
                background: 'var(--bg-surface-hover)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                Wallet: {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </div>
            )}

            <div style={{
              padding: '14px 16px', marginBottom: 20,
              background: 'rgba(37, 99, 235, 0.06)',
              border: '1px solid rgba(37, 99, 235, 0.15)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 8 }}>
                🔒 ANTI-SCAM PROTOCOL
              </div>
              <ul style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: 16, margin: 0 }}>
                <li>A unique secret code will be generated</li>
                <li>Share it only <strong>in person</strong> during the handover</li>
                <li>The finder enters the code to prove they received the item</li>
                <li>An admin must approve the claim before completion</li>
                <li>The code expires in <strong>1 hour</strong></li>
              </ul>
            </div>

            {error && <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleInitiateClaim} disabled={loading}>
                {loading ? (
                  <><div className="spinner" style={{ width: 16, height: 16 }} /> Processing…</>
                ) : (
                  'Generate Secret Code'
                )}
              </button>
            </div>
          </>
        )}

        {/* ===== STEP: WAITING FOR ADMIN (Owner sees code) ===== */}
        {role === 'owner' && step === 'waiting' && (
          <>
            <div style={iconBoxStyle('var(--success)', 'var(--success-subtle)')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Claim Initiated!
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              Share this code with the finder <strong>in person</strong> when handing over the item.
            </p>

            {/* Secret code display */}
            <div style={{
              padding: '24px', marginBottom: 16,
              background: 'var(--bg-surface-hover)',
              borderRadius: 'var(--radius-lg)',
              textAlign: 'center',
              border: '2px dashed var(--border)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.1em', marginBottom: 12 }}>
                SECRET HANDOVER CODE
              </div>
              <div style={{
                fontSize: 40, fontWeight: 800, color: 'var(--accent)',
                letterSpacing: '0.3em', fontFamily: 'monospace',
                marginBottom: 12,
              }}>
                {secretCode}
              </div>
              <button
                className="btn btn-secondary"
                onClick={copyCode}
                style={{ padding: '6px 16px', fontSize: 12 }}
              >
                {copied ? '✓ Copied!' : '📋 Copy code'}
              </button>
            </div>

            <div style={{
              padding: '12px 16px', marginBottom: 20,
              background: 'var(--warning-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13, color: 'var(--warning)', lineHeight: 1.5,
            }}>
              ⏱️ This code expires in <strong>1 hour</strong>. An admin must approve the claim before the finder can complete it.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}

        {/* ===== STEP: ENTER CODE (Finder) ===== */}
        {role === 'finder' && step === 'enter_code' && (
          <>
            <div style={iconBoxStyle('var(--accent)', 'var(--accent-subtle)')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Enter Handover Code
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
              Enter the secret code the owner shared with you <strong>in person</strong> to complete the handover and receive your FNDT reward.
            </p>

            {wallet && (
              <div style={{
                padding: '10px 14px', marginBottom: 16,
                background: 'var(--bg-surface-hover)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                Wallet: {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                Secret Code
              </label>
              <input
                id="claim-secret-code-input"
                className="input"
                type="text"
                placeholder="e.g., A3B7K9"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{
                  fontSize: 24, fontWeight: 700, textAlign: 'center',
                  letterSpacing: '0.25em', fontFamily: 'monospace',
                  padding: '14px',
                }}
                autoFocus
                disabled={loading}
              />
            </div>

            <div style={{
              padding: '12px 16px', marginBottom: 20,
              background: 'var(--success-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13, color: 'var(--success)', lineHeight: 1.5,
            }}>
              🪙 You will receive <strong>FNDT reward tokens</strong> once the handover is verified on the blockchain.
            </div>

            {error && <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
              <button
                id="complete-claim-btn"
                className="btn btn-primary"
                onClick={handleCompleteClaim}
                disabled={loading || inputCode.length < 6}
              >
                {loading ? (
                  <><div className="spinner" style={{ width: 16, height: 16 }} /> Verifying…</>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    Complete Handover
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ===== STEP: BLOCKCHAIN TX IN PROGRESS ===== */}
        {role === 'finder' && step === 'blockchain' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 72, height: 72,
              background: 'var(--accent-subtle)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Recording on Blockchain…
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
              Confirming your transaction on Sepolia.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Please confirm the transaction in MetaMask and wait for confirmation.
            </p>
          </div>
        )}

        {/* ===== STEP: SUCCESS ===== */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {/* Success animation circle */}
            <div style={{
              width: 80, height: 80,
              background: 'linear-gradient(135deg, var(--success-subtle), rgba(34, 197, 94, 0.2))',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 0 40px rgba(34, 197, 94, 0.15)',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Handover Complete! 🎉
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 24 }}>
              The item has been successfully returned and recorded on the blockchain.
            </p>

            {/* Reward display */}
            {rewardAmount > 0 && (
              <div style={{
                padding: '20px 24px', marginBottom: 20,
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(139, 92, 246, 0.08))',
                border: '1px solid rgba(37, 99, 235, 0.15)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.1em', marginBottom: 8 }}>
                  🪙 REWARD EARNED
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>
                  {rewardAmount} FNDT
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Foundit Reward Tokens
                </div>
                {tokenBalance && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                    Total balance: {parseFloat(tokenBalance).toFixed(1)} FNDT
                  </div>
                )}
              </div>
            )}

            {/* Tx hash */}
            {txHash && (
              <div style={{
                padding: '10px 14px', marginBottom: 20,
                background: 'var(--bg-surface-hover)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12, color: 'var(--text-secondary)',
                wordBreak: 'break-all',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Transaction Hash</div>
                <a
                  href={getEtherscanTxUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'none' }}
                >
                  {txHash.slice(0, 20)}...{txHash.slice(-8)} ↗
                </a>
              </div>
            )}

            <button className="btn btn-primary" onClick={onComplete} style={{ width: '100%', padding: '12px' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
