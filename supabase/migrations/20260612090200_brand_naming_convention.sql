-- Per-brand campaign naming convention template, e.g. "{brand} | {date:MM.DD} | {name}".
-- Applied by process-campaign-queue when a queue item resolves its brand.
alter table public.brands add column if not exists naming_convention text;
