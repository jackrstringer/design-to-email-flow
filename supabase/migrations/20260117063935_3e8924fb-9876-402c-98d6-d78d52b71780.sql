-- Add description column to segment_presets table
ALTER TABLE public.segment_presets 
ADD COLUMN IF NOT EXISTS description TEXT;