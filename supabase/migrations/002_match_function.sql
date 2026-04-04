-- ============================================
-- Foundit — pgvector Cosine Similarity Search
-- ============================================

-- Function to find matching items using CLIP embeddings
-- Called via Supabase RPC: supabase.rpc('match_items', { ... })
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
  user_id UUID,
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
