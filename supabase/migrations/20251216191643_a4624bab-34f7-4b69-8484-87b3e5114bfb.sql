-- Add new color columns to brands table for full Firecrawl data
ALTER TABLE public.brands 
ADD COLUMN IF NOT EXISTS background_color TEXT,
ADD COLUMN IF NOT EXISTS text_primary_color TEXT,
ADD COLUMN IF NOT EXISTS link_color TEXT;