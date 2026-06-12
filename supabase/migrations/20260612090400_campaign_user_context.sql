-- User-provided campaign context from the Figma plugin (copy notes, links,
-- landing page, offer details). Flows into slicing, copy generation, and QA.
alter table public.campaign_queue add column if not exists user_context text;
