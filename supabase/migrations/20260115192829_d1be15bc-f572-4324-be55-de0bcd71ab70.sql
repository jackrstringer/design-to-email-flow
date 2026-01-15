-- Add is_default column to segment_presets
ALTER TABLE public.segment_presets 
ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;

-- Ensure only one default per brand (partial unique index)
CREATE UNIQUE INDEX segment_presets_brand_default_unique 
ON public.segment_presets (brand_id) 
WHERE is_default = true;