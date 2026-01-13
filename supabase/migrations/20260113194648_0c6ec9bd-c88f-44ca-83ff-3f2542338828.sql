-- Backfill brands.user_id for any NULL values by assigning to the first profile
UPDATE public.brands 
SET user_id = (SELECT id FROM public.profiles LIMIT 1) 
WHERE user_id IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS brands_user_id_idx ON public.brands(user_id);