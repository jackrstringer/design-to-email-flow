-- The knowledge agent can now ask the user questions when it's missing
-- something it needs ('question' kind, answered in the Knowledge tab),
-- and 'research' joins the agent_runs vocabulary for Klaviyo history mining.

alter table public.brand_knowledge
  drop constraint if exists brand_knowledge_kind_check;
alter table public.brand_knowledge
  add constraint brand_knowledge_kind_check check (kind in (
    'voice', 'style', 'product', 'promo', 'link_rule', 'mistake', 'fact', 'question'
  ));

alter table public.agent_runs
  drop constraint if exists agent_runs_agent_check;
alter table public.agent_runs
  add constraint agent_runs_agent_check check (agent in (
    'learn', 'qa', 'refresh', 'recrawl', 'research'
  ));
