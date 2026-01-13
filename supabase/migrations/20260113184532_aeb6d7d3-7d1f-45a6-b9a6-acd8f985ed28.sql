-- Add user_id column to brands table
ALTER TABLE public.brands ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Anyone can view brands" ON public.brands;
DROP POLICY IF EXISTS "Anyone can create brands" ON public.brands;
DROP POLICY IF EXISTS "Anyone can update brands" ON public.brands;
DROP POLICY IF EXISTS "Anyone can delete brands" ON public.brands;

-- Create new user-scoped policies
CREATE POLICY "Users can view own brands" 
ON public.brands FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own brands" 
ON public.brands FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brands" 
ON public.brands FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own brands" 
ON public.brands FOR DELETE 
USING (auth.uid() = user_id);