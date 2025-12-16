-- Create brand_footers table for multiple footers per brand
CREATE TABLE public.brand_footers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  html TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  logo_url TEXT,
  logo_public_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one primary footer per brand
CREATE UNIQUE INDEX unique_primary_footer_per_brand 
  ON public.brand_footers (brand_id) WHERE is_primary = true;

-- Enable RLS
ALTER TABLE public.brand_footers ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view brand footers" ON public.brand_footers FOR SELECT USING (true);
CREATE POLICY "Anyone can create brand footers" ON public.brand_footers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update brand footers" ON public.brand_footers FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete brand footers" ON public.brand_footers FOR DELETE USING (true);

-- Add typography and html_formatting_rules to brands table
ALTER TABLE public.brands ADD COLUMN typography JSONB DEFAULT '{}';
ALTER TABLE public.brands ADD COLUMN html_formatting_rules JSONB DEFAULT '[]';

-- Trigger for updated_at
CREATE TRIGGER update_brand_footers_updated_at
  BEFORE UPDATE ON public.brand_footers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();