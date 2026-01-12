-- Add spelling_errors column to early_generated_copy table
ALTER TABLE public.early_generated_copy
ADD COLUMN IF NOT EXISTS spelling_errors jsonb DEFAULT NULL;