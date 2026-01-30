-- Drop existing foreign key constraints and recreate with ON DELETE CASCADE

-- campaign_queue → brands
ALTER TABLE public.campaign_queue
  DROP CONSTRAINT IF EXISTS campaign_queue_brand_id_fkey;
ALTER TABLE public.campaign_queue
  ADD CONSTRAINT campaign_queue_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- campaigns → brands
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_brand_id_fkey;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- brand_footers → brands
ALTER TABLE public.brand_footers
  DROP CONSTRAINT IF EXISTS brand_footers_brand_id_fkey;
ALTER TABLE public.brand_footers
  ADD CONSTRAINT brand_footers_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- brand_link_index → brands
ALTER TABLE public.brand_link_index
  DROP CONSTRAINT IF EXISTS brand_link_index_brand_id_fkey;
ALTER TABLE public.brand_link_index
  ADD CONSTRAINT brand_link_index_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- segment_presets → brands
ALTER TABLE public.segment_presets
  DROP CONSTRAINT IF EXISTS segment_presets_brand_id_fkey;
ALTER TABLE public.segment_presets
  ADD CONSTRAINT segment_presets_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- footer_editor_sessions → brands
ALTER TABLE public.footer_editor_sessions
  DROP CONSTRAINT IF EXISTS footer_editor_sessions_brand_id_fkey;
ALTER TABLE public.footer_editor_sessions
  ADD CONSTRAINT footer_editor_sessions_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- sitemap_import_jobs → brands
ALTER TABLE public.sitemap_import_jobs
  DROP CONSTRAINT IF EXISTS sitemap_import_jobs_brand_id_fkey;
ALTER TABLE public.sitemap_import_jobs
  ADD CONSTRAINT sitemap_import_jobs_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;

-- early_generated_copy → brands
ALTER TABLE public.early_generated_copy
  DROP CONSTRAINT IF EXISTS early_generated_copy_brand_id_fkey;
ALTER TABLE public.early_generated_copy
  ADD CONSTRAINT early_generated_copy_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;