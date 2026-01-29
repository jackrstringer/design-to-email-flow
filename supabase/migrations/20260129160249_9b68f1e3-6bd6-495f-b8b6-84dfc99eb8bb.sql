-- Create early_spelling_check table for async spelling check results
CREATE TABLE public.early_spelling_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL UNIQUE,
  image_url TEXT,
  spelling_errors JSONB DEFAULT '[]'::jsonb,
  has_errors BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '1 hour')
);

-- Enable RLS
ALTER TABLE public.early_spelling_check ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as early_generated_copy)
CREATE POLICY "Anyone can insert early spelling check" 
  ON public.early_spelling_check FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Anyone can read early spelling check by session key" 
  ON public.early_spelling_check FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can delete expired spelling check" 
  ON public.early_spelling_check FOR DELETE 
  USING (expires_at < now());