-- Structured metadata for brand_knowledge entries. For 'question' kind the
-- research agent stores { "answer_options": ["...", ...] } so the Knowledge
-- survey can render one-click multiple choice. Legacy questions (null) fall
-- back to free text.
alter table public.brand_knowledge add column if not exists metadata jsonb;
