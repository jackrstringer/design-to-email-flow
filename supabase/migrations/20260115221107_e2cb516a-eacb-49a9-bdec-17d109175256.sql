-- Add selected_segment_preset_id column to campaign_queue table
ALTER TABLE public.campaign_queue
ADD COLUMN selected_segment_preset_id UUID REFERENCES public.segment_presets(id) ON DELETE SET NULL;