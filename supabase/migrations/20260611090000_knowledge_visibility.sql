-- Knowledge-layer visibility.
--
-- agent_runs: every autonomous agent execution (learning, QA, refresh,
--   recrawl) logs what it did here, so the user can see the system working
--   on their behalf — and audit it.
-- knowledge_events gains 'error_flagged': the user-initiated "the AI got
--   this wrong" report, which the learning agent distills into lessons.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  user_id uuid,
  agent text not null check (agent in ('learn', 'qa', 'refresh', 'recrawl')),
  trigger text not null default 'manual' check (trigger in ('scheduled', 'after_push', 'pipeline', 'manual')),
  status text not null default 'success' check (status in ('success', 'error')),
  -- Human-readable one-liner ("Learned 2 lessons from 5 corrections")
  headline text,
  -- Structured details (counts, ids, flags) for the expandable view
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_brand_idx on public.agent_runs (brand_id, created_at desc);

alter table public.agent_runs enable row level security;

create policy "Users see agent runs for their brands"
  on public.agent_runs for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.brands b
      where b.id = agent_runs.brand_id and b.user_id = auth.uid()
    )
  );
-- Inserts via service role only.

-- Allow user-flagged errors in the event log.
alter table public.knowledge_events
  drop constraint if exists knowledge_events_event_type_check;
alter table public.knowledge_events
  add constraint knowledge_events_event_type_check check (event_type in (
    'link_corrected', 'alt_text_corrected', 'copy_edited', 'slice_html_edited',
    'footer_edited', 'qa_flag_dismissed', 'qa_flag_confirmed',
    'campaign_approved', 'campaign_pushed', 'error_flagged'
  ));
