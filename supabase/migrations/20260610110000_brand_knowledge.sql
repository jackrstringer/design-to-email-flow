-- Agentic brand knowledge layer.
--
-- brand_knowledge: durable, per-brand facts the agent has learned — voice and
--   style rules, link conventions, product facts, promo windows, and past
--   mistakes with their corrections. Read by the pre-push QA agent and the
--   slicing/link pipeline; written by the learning agent.
-- knowledge_events: raw event log of user corrections (link fixed, alt text
--   edited, QA flag dismissed...). The learning agent distills these into
--   brand_knowledge entries.

create table if not exists public.brand_knowledge (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid,
  kind text not null check (kind in (
    'voice', 'style', 'product', 'promo', 'link_rule', 'mistake', 'fact'
  )),
  title text not null,
  content text not null,
  source text not null default 'agent' check (source in (
    'agent', 'user_correction', 'campaign_review', 'crawl', 'manual'
  )),
  confidence real not null default 0.8,
  -- Promos and time-bound facts expire; evergreen knowledge has null.
  valid_until timestamptz,
  times_applied integer not null default 0,
  last_applied_at timestamptz,
  superseded_by uuid references public.brand_knowledge(id) on delete set null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_knowledge_brand_idx
  on public.brand_knowledge (brand_id, kind)
  where superseded_by is null;

alter table public.brand_knowledge enable row level security;

create policy "Users manage knowledge for their brands"
  on public.brand_knowledge for all
  using (exists (
    select 1 from public.brands b
    where b.id = brand_knowledge.brand_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.brands b
    where b.id = brand_knowledge.brand_id and b.user_id = auth.uid()
  ));

create table if not exists public.knowledge_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid,
  queue_id uuid,
  event_type text not null check (event_type in (
    'link_corrected', 'alt_text_corrected', 'copy_edited', 'slice_html_edited',
    'footer_edited', 'qa_flag_dismissed', 'qa_flag_confirmed',
    'campaign_approved', 'campaign_pushed'
  )),
  before jsonb,
  after jsonb,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_events_unprocessed_idx
  on public.knowledge_events (brand_id, created_at)
  where processed = false;

alter table public.knowledge_events enable row level security;

create policy "Users manage events for their brands"
  on public.knowledge_events for all
  using (exists (
    select 1 from public.brands b
    where b.id = knowledge_events.brand_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.brands b
    where b.id = knowledge_events.brand_id and b.user_id = auth.uid()
  ));

-- Semantic recall over brand knowledge (mirrors match_brand_links).
create or replace function public.match_brand_knowledge(
  query_embedding extensions.vector(1536),
  p_brand_id uuid,
  match_count integer default 8
) returns table (
  id uuid,
  kind text,
  title text,
  content text,
  confidence real,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    bk.id,
    bk.kind,
    bk.title,
    bk.content,
    bk.confidence,
    1 - (bk.embedding <=> query_embedding) as similarity
  from public.brand_knowledge bk
  where bk.brand_id = p_brand_id
    and bk.superseded_by is null
    and bk.embedding is not null
    and (bk.valid_until is null or bk.valid_until > now())
  order by bk.embedding <=> query_embedding
  limit match_count;
$$;
