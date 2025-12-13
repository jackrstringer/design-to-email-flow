-- Add footer-related columns to brands table
ALTER TABLE public.brands
ADD COLUMN footer_html TEXT,
ADD COLUMN footer_logo_url TEXT,
ADD COLUMN footer_logo_public_id TEXT,
ADD COLUMN social_icons JSONB DEFAULT '{}',
ADD COLUMN footer_configured BOOLEAN DEFAULT false;