-- Per-brand custom dictionary for the copy QA layer (subject line / preview
-- text spellcheck). Words here are treated as always-valid spellings —
-- brand names, product names, intentional stylings. The brand's own name and
-- domain are implicitly valid client-side without being stored.
alter table public.brands add column if not exists custom_dictionary text[] not null default '{}';
