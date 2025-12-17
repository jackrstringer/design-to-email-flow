-- Add DELETE policy for brands table
CREATE POLICY "Anyone can delete brands" 
ON public.brands 
FOR DELETE 
USING (true);