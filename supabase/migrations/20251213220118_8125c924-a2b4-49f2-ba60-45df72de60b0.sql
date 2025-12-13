-- Create the update_updated_at_column function first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create campaigns table to store past email designs
CREATE TABLE public.campaigns (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    original_image_url TEXT,
    generated_html TEXT,
    thumbnail_url TEXT,
    blocks JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'pushed_to_klaviyo')),
    klaviyo_template_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (matching brands table pattern)
CREATE POLICY "Anyone can view campaigns" 
ON public.campaigns 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create campaigns" 
ON public.campaigns 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update campaigns" 
ON public.campaigns 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete campaigns" 
ON public.campaigns 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();