-- ============================================
-- Foundit — Switch to 384-dim text embeddings (BGE-small)
-- ============================================
-- CLIP image embeddings (512-dim) are not available on HF free inference tier.
-- Switching to BAAI/bge-small-en-v1.5 text embeddings (384-dim) which are
-- hosted on HF's free serverless inference and produce excellent results.

-- Step 1: Clear existing (null) embeddings and drop the old column
ALTER TABLE items DROP COLUMN IF EXISTS embedding;

-- Step 2: Re-add with correct 384 dimensions
ALTER TABLE items ADD COLUMN embedding VECTOR(384);

-- Step 3: Drop and recreate the match function with 384-dim vectors
DROP FUNCTION IF EXISTS match_items;

CREATE OR REPLACE FUNCTION match_items(
  query_embedding VECTOR(384),
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
  user_id TEXT,
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
