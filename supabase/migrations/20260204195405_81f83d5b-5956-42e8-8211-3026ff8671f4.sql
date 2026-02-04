-- Add last_crawled_at column to brands table for tracking weekly re-crawls
ALTER TABLE public.brands 
ADD COLUMN IF NOT EXISTS last_crawled_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN public.brands.last_crawled_at IS 'Timestamp of the last successful link crawl for this brand. Used by weekly-link-recrawl automation.';