-- ============================================
-- Foundit — Blockchain Claims Migration
-- Replace OTP-based claims with blockchain-powered handover system
-- ============================================

-- Add new columns to claims table
ALTER TABLE claims ADD COLUMN IF NOT EXISTS finder_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS secret_hash TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'expired', 'rejected'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS reward_amount NUMERIC DEFAULT 0;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS owner_wallet TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS finder_wallet TEXT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_claims_finder ON claims(finder_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_expires ON claims(expires_at);

-- Add wallet_address to users table for blockchain integration
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;
