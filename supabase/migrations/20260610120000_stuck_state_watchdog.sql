-- Stuck-state watchdog.
--
-- When a processing isolate dies mid-run (gateway timeout, deploy, crash),
-- campaign_queue / footer_processing_jobs rows stay frozen in 'processing'
-- forever and the UI shows an eternal spinner. This marks anything without
-- progress for 10+ minutes as errored so the user can retry.

create or replace function public.reset_stuck_processing_jobs()
returns table (queue_reset integer, footer_reset integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue integer;
  v_footer integer;
begin
  with stuck as (
    update public.campaign_queue
    set status = 'error',
        error_message = 'Processing timed out — the job stopped making progress. Use retry to run it again.',
        updated_at = now()
    where status = 'processing'
      and updated_at < now() - interval '10 minutes'
    returning id
  )
  select count(*) into v_queue from stuck;

  with stuck_footers as (
    update public.footer_processing_jobs
    set status = 'error',
        error_message = 'Processing timed out — the job stopped making progress. Use retry to run it again.',
        updated_at = now()
    where status = 'processing'
      and updated_at < now() - interval '10 minutes'
    returning id
  )
  select count(*) into v_footer from stuck_footers;

  return query select v_queue, v_footer;
end;
$$;

revoke all on function public.reset_stuck_processing_jobs() from public, anon;
grant execute on function public.reset_stuck_processing_jobs() to authenticated, service_role;

-- Schedule every 5 minutes when pg_cron is available (hosted Supabase has it;
-- guarded so local/CI environments without it don't fail the migration).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'reset-stuck-processing-jobs',
    '*/5 * * * *',
    $cron$select public.reset_stuck_processing_jobs();$cron$
  );
exception when others then
  raise notice 'pg_cron unavailable, skipping watchdog schedule: %', sqlerrm;
end;
$$;
