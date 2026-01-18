-- Note: profiles table already has clickup_api_key and clickup_workspace_id columns based on the types.ts file
-- This migration is a no-op confirmation since columns already exist

-- Ensure the columns exist (safe to run even if they exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'clickup_api_key'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN clickup_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'clickup_workspace_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN clickup_workspace_id TEXT;
  END IF;
END $$;