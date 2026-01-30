ALTER TABLE campaign_queue 
ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMPTZ;