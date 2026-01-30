-- Create the match_brand_links function for vector similarity search
-- This enables fast semantic matching of slice descriptions against indexed brand links

CREATE OR REPLACE FUNCTION public.match_brand_links(
  query_embedding extensions.vector(1536),
  match_brand_id UUID,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  url TEXT,
  title TEXT,
  link_type TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    brand_link_index.id,
    brand_link_index.url,
    brand_link_index.title,
    brand_link_index.link_type,
    1 - (brand_link_index.embedding <=> query_embedding) AS similarity
  FROM brand_link_index
  WHERE brand_link_index.brand_id = match_brand_id
    AND brand_link_index.is_healthy = true
    AND brand_link_index.embedding IS NOT NULL
  ORDER BY brand_link_index.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;