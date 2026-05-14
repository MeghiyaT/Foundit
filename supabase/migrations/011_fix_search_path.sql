-- ============================================
-- Foundit — Fix match_items search_path regression
-- The function fails with 'relation "items" does not exist' because
-- plpgsql functions run with an empty search_path by default in Supabase.
-- Fix: add SET search_path = public, extensions to the function.
-- ============================================

DROP FUNCTION IF EXISTS match_items(vector, text, float, int);

CREATE OR REPLACE FUNCTION match_items(
  query_embedding VECTOR(384),
  match_type TEXT,
  match_threshold FLOAT DEFAULT 0.72,
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
LANGUAGE plpgsql
-- This is the critical fix: explicitly set the search_path so that
-- 'items' resolves to public.items inside the function body.
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.title,
    i.description,
    i.category,
    i.image_url,
    i.location,
    i.date_reported,
    i.user_id,
    (1 - (i.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.items i
  WHERE i.type = match_type
    AND i.status = 'open'
    AND i.embedding IS NOT NULL
    AND (1 - (i.embedding <=> query_embedding)) > match_threshold
  ORDER BY i.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execution to both anon and authenticated roles
GRANT EXECUTE ON FUNCTION match_items(vector, text, float, int) TO anon, authenticated, service_role;
