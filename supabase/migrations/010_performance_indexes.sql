-- Migration 010: Performance Indexes
-- Addresses: Finding #9 (1030ms paginated queries) and Finding #10 (1136ms filtered queries)
-- from the AUDIT_REPORT — adds targeted indexes to speed up common query patterns.

-- Composite index for filtered listings (type + status = most common filter combo)
CREATE INDEX IF NOT EXISTS idx_items_type_status ON items(type, status);

-- Index for category-based filtering
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

-- Composite index for user's items filtered by type (used by /my-items frontend page)
CREATE INDEX IF NOT EXISTS idx_items_user_id_type ON items(user_id, type);

-- Index for ordering by created_at DESC (used on every listing query)
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);

-- Index for title ilike searches (trigram index for partial-match performance)
-- Using a GIN index with gin_trgm_ops for faster ILIKE '%search%' queries
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_items_title_trgm ON items USING gin (title gin_trgm_ops);

-- Index for messages lookup by conversation participants
CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Index for matches lookup
CREATE INDEX IF NOT EXISTS idx_matches_item_id ON matches(item_id);
CREATE INDEX IF NOT EXISTS idx_matches_matched_item_id ON matches(matched_item_id);