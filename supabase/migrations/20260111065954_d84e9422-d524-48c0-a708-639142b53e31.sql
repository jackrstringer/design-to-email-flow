-- Add generated_copy column to campaigns table for pre-generated subject lines and preview texts
ALTER TABLE campaigns ADD COLUMN generated_copy JSONB DEFAULT NULL;