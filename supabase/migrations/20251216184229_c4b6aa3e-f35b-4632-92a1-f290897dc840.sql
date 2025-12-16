-- Add klaviyo_api_key column to brands table for per-brand API key storage
ALTER TABLE public.brands ADD COLUMN klaviyo_api_key text;