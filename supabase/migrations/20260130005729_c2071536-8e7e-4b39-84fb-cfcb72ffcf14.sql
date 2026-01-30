-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create brand_link_index table for storing indexed URLs
CREATE TABLE public.brand_link_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  
  -- What is this link?
  link_type TEXT NOT NULL,  -- 'homepage' | 'collection' | 'product' | 'page'
  title TEXT,
  description TEXT,
  
  -- For semantic search (1536 dimensions for text-embedding-3-small)
  embedding extensions.vector(1536),
  
  -- Hierarchy
  parent_collection_url TEXT,
  
  -- Health tracking
  last_verified_at TIMESTAMPTZ,
  is_healthy BOOLEAN DEFAULT true,
  verification_failures INTEGER DEFAULT 0,
  
  -- Usage tracking
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  
  -- Source tracking
  source TEXT NOT NULL,     -- 'sitemap' | 'crawl' | 'ai_discovered' | 'user_added'
  user_confirmed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(brand_id, url)
);

-- Indexes for efficient querying
CREATE INDEX idx_brand_link_index_brand ON public.brand_link_index(brand_id);
CREATE INDEX idx_brand_link_index_healthy ON public.brand_link_index(brand_id, is_healthy);
CREATE INDEX idx_brand_link_index_type ON public.brand_link_index(brand_id, link_type);

-- Create sitemap_import_jobs table for tracking async imports
CREATE TABLE public.sitemap_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  
  -- Import config
  sitemap_url TEXT NOT NULL,
  
  -- Progress tracking
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'parsing' | 'fetching_titles' | 'generating_embeddings' | 'complete' | 'failed'
  
  -- Stats
  urls_found INTEGER DEFAULT 0,
  urls_processed INTEGER DEFAULT 0,
  urls_failed INTEGER DEFAULT 0,
  product_urls_count INTEGER DEFAULT 0,
  collection_urls_count INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error handling
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sitemap jobs
CREATE INDEX idx_sitemap_jobs_brand ON public.sitemap_import_jobs(brand_id);
CREATE INDEX idx_sitemap_jobs_status ON public.sitemap_import_jobs(status);

-- Add link_preferences column to brands table
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS link_preferences JSONB DEFAULT '{}'::jsonb;

-- Enable RLS on new tables
ALTER TABLE public.brand_link_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitemap_import_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for brand_link_index (users can manage links for their own brands)
CREATE POLICY "Users can view links for own brands" 
  ON public.brand_link_index 
  FOR SELECT 
  USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can create links for own brands" 
  ON public.brand_link_index 
  FOR INSERT 
  WITH CHECK (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update links for own brands" 
  ON public.brand_link_index 
  FOR UPDATE 
  USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete links for own brands" 
  ON public.brand_link_index 
  FOR DELETE 
  USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

-- RLS policies for sitemap_import_jobs (users can manage jobs for their own brands)
CREATE POLICY "Users can view import jobs for own brands" 
  ON public.sitemap_import_jobs 
  FOR SELECT 
  USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can create import jobs for own brands" 
  ON public.sitemap_import_jobs 
  FOR INSERT 
  WITH CHECK (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update import jobs for own brands" 
  ON public.sitemap_import_jobs 
  FOR UPDATE 
  USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete import jobs for own brands" 
  ON public.sitemap_import_jobs 
  FOR DELETE 
  USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

-- Trigger for updating updated_at on brand_link_index
CREATE TRIGGER update_brand_link_index_updated_at
  BEFORE UPDATE ON public.brand_link_index
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updating updated_at on sitemap_import_jobs
CREATE TRIGGER update_sitemap_import_jobs_updated_at
  BEFORE UPDATE ON public.sitemap_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();