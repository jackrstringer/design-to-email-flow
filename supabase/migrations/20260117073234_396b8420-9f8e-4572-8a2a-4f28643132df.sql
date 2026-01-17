-- Add ClickUp integration columns to brands table
ALTER TABLE brands 
ADD COLUMN clickup_api_key TEXT,
ADD COLUMN clickup_workspace_id TEXT,
ADD COLUMN clickup_list_id TEXT;

-- Add copy source tracking to campaign_queue table
ALTER TABLE campaign_queue 
ADD COLUMN copy_source TEXT DEFAULT 'ai',
ADD COLUMN clickup_task_id TEXT,
ADD COLUMN clickup_task_url TEXT;