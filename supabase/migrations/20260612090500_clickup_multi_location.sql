-- ClickUp multi-location selection per brand.
-- A brand can now point at multiple ClickUp lists and/or one whole folder
-- (the folder is resolved to its lists at query time so lists created later
-- are picked up automatically). The legacy single-list column
-- brands.clickup_list_id is kept for backward compatibility: if both new
-- columns are empty, the legacy value is treated as the selection.

alter table public.brands
  add column if not exists clickup_list_ids text[] not null default '{}',
  add column if not exists clickup_folder_id text;

comment on column public.brands.clickup_list_ids is
  'Explicitly selected ClickUp list IDs (multi-select). Empty + null folder => fall back to legacy clickup_list_id.';
comment on column public.brands.clickup_folder_id is
  'Optional ClickUp folder ID; selecting a folder includes ALL its lists (resolved at query time), including lists created later.';
