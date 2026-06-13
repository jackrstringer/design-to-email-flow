-- Add created_by column to segment_presets so we can filter by creator.
-- Nullable: existing rows retain null (= unknown creator) and appear under "All"
-- but not under "My Segments".
alter table public.segment_presets
  add column if not exists created_by uuid references auth.users(id);
