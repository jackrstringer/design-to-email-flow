-- Create table for saving audience presets per brand
CREATE TABLE public.segment_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  included_segments JSONB NOT NULL DEFAULT '[]',
  excluded_segments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.segment_presets ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (matching existing pattern)
CREATE POLICY "Anyone can view segment presets" ON public.segment_presets FOR SELECT USING (true);
CREATE POLICY "Anyone can create segment presets" ON public.segment_presets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update segment presets" ON public.segment_presets FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete segment presets" ON public.segment_presets FOR DELETE USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_segment_presets_updated_at
BEFORE UPDATE ON public.segment_presets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();