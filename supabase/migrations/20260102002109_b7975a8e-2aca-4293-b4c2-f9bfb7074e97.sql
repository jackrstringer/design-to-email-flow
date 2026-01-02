-- Add copy_examples column to brands table for storing historical SL/PT examples
ALTER TABLE public.brands 
ADD COLUMN copy_examples jsonb DEFAULT '{"subjectLines": [], "previewTexts": [], "lastScraped": null}'::jsonb;