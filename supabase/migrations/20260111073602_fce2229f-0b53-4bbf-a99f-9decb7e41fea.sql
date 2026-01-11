-- Table to store early-generated SL/PT before campaign is created
CREATE TABLE public.early_generated_copy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT UNIQUE NOT NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  image_url TEXT,
  subject_lines JSONB,
  preview_texts JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '1 hour')
);

-- Index for cleanup queries
CREATE INDEX idx_early_copy_expires ON public.early_generated_copy(expires_at);
CREATE INDEX idx_early_copy_session ON public.early_generated_copy(session_key);

-- Enable RLS
ALTER TABLE public.early_generated_copy ENABLE ROW LEVEL SECURITY;

-- Public read/write since we're using session keys (no auth required for this temp data)
CREATE POLICY "Anyone can insert early copy"
ON public.early_generated_copy
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can read early copy by session key"
ON public.early_generated_copy
FOR SELECT
USING (true);

CREATE POLICY "Anyone can delete expired copy"
ON public.early_generated_copy
FOR DELETE
USING (expires_at < now());