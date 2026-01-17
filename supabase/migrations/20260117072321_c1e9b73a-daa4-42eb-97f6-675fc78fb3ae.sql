-- Add column to store user's queue column width preferences
ALTER TABLE public.profiles 
ADD COLUMN queue_column_widths jsonb DEFAULT NULL;