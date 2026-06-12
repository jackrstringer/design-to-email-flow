-- Optional user-chosen accent color per segment set. Rendered as a small dot
-- in pills/tables only — never fills chrome. NULL = neutral dot.
-- NOTE: the live table is public.segment_presets (there is no
-- brand_segment_presets in this schema).
alter table public.segment_presets add column if not exists color text;
