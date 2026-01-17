-- Drop the existing check constraint
ALTER TABLE public.campaign_queue DROP CONSTRAINT IF EXISTS campaign_queue_status_check;

-- Add the updated check constraint with 'closed' as a valid status
ALTER TABLE public.campaign_queue ADD CONSTRAINT campaign_queue_status_check 
CHECK (status IN ('processing', 'ready_for_review', 'approved', 'failed', 'sent_to_klaviyo', 'closed'));