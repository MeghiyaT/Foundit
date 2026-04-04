-- ============================================
-- Foundit — Initial Database Schema
-- ============================================

-- Enable pgvector extension for image embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- USERS TABLE
-- Synced from Supabase Auth on first login
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  roll_no TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ITEMS TABLE
-- Core table for lost and found items
-- ============================================
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('lost', 'found')),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  location TEXT,
  image_url TEXT,
  embedding VECTOR(512),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'matched', 'closed')),
  date_reported DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MATCHES TABLE
-- Stores AI-generated matches between items
-- ============================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lost_item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  found_item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  similarity_score FLOAT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CLAIMS TABLE
-- OTP verification for item handover
-- ============================================
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  claimant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  otp_hash TEXT,
  otp_expires_at TIMESTAMPTZ,
  verified BOOLEAN DEFAULT FALSE,
  nft_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_lost ON matches(lost_item_id);
CREATE INDEX IF NOT EXISTS idx_matches_found ON matches(found_item_id);
CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id);
CREATE INDEX IF NOT EXISTS idx_claims_claimant ON claims(claimant_id);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_items_embedding ON items 
  USING hnsw (embedding vector_cosine_ops);
