-- ============================================
-- Foundit — Update match_items function to support TEXT user IDs
-- ============================================

-- First, drop the old function since you cannot change the return type using CREATE OR REPLACE
DROP FUNCTION IF EXISTS match_items;

-- Recreate with user_id as TEXT
CREATE OR REPLACE FUNCTION match_items(
  query_embedding VECTOR(512),
  match_type TEXT,
  match_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  category TEXT,
  image_url TEXT,
  location TEXT,
  date_reported DATE,
  user_id TEXT,  -- Changed from UUID to TEXT to support Clerk IDs
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    items.id,
    items.title,
    items.description,
    items.category,
    items.image_url,
    items.location,
    items.date_reported,
    items.user_id,
    (1 - (items.embedding <=> query_embedding))::FLOAT AS similarity
  FROM items
  WHERE items.type = match_type
    AND items.status = 'open'
    AND items.embedding IS NOT NULL
    AND (1 - (items.embedding <=> query_embedding)) > match_threshold
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
