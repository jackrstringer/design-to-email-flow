-- Create brands table for storing brand information
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  website_url TEXT,
  dark_logo_url TEXT,
  dark_logo_public_id TEXT,
  light_logo_url TEXT,
  light_logo_public_id TEXT,
  primary_color TEXT NOT NULL DEFAULT '#3b82f6',
  secondary_color TEXT NOT NULL DEFAULT '#64748b',
  accent_color TEXT,
  social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  all_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- Create policies - brands are shared across all users (no auth required for MVP)
CREATE POLICY "Anyone can view brands" 
ON public.brands 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create brands" 
ON public.brands 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update brands" 
ON public.brands 
FOR UPDATE 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_brands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_brands_updated_at
BEFORE UPDATE ON public.brands
FOR EACH ROW
EXECUTE FUNCTION public.update_brands_updated_at();

-- Create index for domain lookups
CREATE INDEX idx_brands_domain ON public.brands(domain);