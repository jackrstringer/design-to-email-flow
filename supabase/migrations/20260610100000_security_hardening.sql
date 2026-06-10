-- Security hardening:
--   1. Brand API keys (Klaviyo / ClickUp) move from plaintext columns into
--      Supabase Vault (encrypted at rest). Frontend never sees keys again —
--      it only sees boolean "configured" flags.
--   2. Fixed-window rate limiting primitives.
--   3. Klaviyo push log for idempotency (no more duplicate templates from
--      double-clicks or retries).

-- ---------------------------------------------------------------------------
-- 1. Vault-backed brand secrets
-- ---------------------------------------------------------------------------

alter table public.brands
  add column if not exists klaviyo_key_set boolean not null default false,
  add column if not exists clickup_key_set boolean not null default false;

-- Store/replace a brand secret. Callable by the brand owner (or service role).
create or replace function public.set_brand_secret(
  p_brand_id uuid,
  p_kind text,
  p_secret text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_name text;
  v_existing uuid;
begin
  if p_kind not in ('klaviyo', 'clickup') then
    raise exception 'invalid secret kind %', p_kind;
  end if;

  select user_id into v_owner from public.brands where id = p_brand_id;
  if v_owner is null then
    raise exception 'brand not found';
  end if;
  -- auth.uid() is null for service-role connections; only enforce for users.
  if auth.uid() is not null and v_owner <> auth.uid() then
    raise exception 'not authorized for this brand';
  end if;

  v_name := 'brand:' || p_brand_id || ':' || p_kind;
  select id into v_existing from vault.secrets where name = v_name;

  if v_existing is not null then
    perform vault.update_secret(v_existing, p_secret);
  else
    perform vault.create_secret(p_secret, v_name);
  end if;

  if p_kind = 'klaviyo' then
    update public.brands set klaviyo_key_set = true, updated_at = now() where id = p_brand_id;
  else
    update public.brands set clickup_key_set = true, updated_at = now() where id = p_brand_id;
  end if;
end;
$$;

create or replace function public.delete_brand_secret(
  p_brand_id uuid,
  p_kind text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if p_kind not in ('klaviyo', 'clickup') then
    raise exception 'invalid secret kind %', p_kind;
  end if;
  select user_id into v_owner from public.brands where id = p_brand_id;
  if v_owner is null then
    raise exception 'brand not found';
  end if;
  if auth.uid() is not null and v_owner <> auth.uid() then
    raise exception 'not authorized for this brand';
  end if;

  delete from vault.secrets where name = 'brand:' || p_brand_id || ':' || p_kind;

  if p_kind = 'klaviyo' then
    update public.brands set klaviyo_key_set = false, updated_at = now() where id = p_brand_id;
  else
    update public.brands set clickup_key_set = false, updated_at = now() where id = p_brand_id;
  end if;
end;
$$;

-- Decrypt a brand secret. SERVICE ROLE ONLY — never exposed to browsers.
create or replace function public.get_brand_secret(
  p_brand_id uuid,
  p_kind text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  if p_kind not in ('klaviyo', 'clickup') then
    raise exception 'invalid secret kind %', p_kind;
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'brand:' || p_brand_id || ':' || p_kind;
  return v_secret;
end;
$$;

revoke all on function public.set_brand_secret(uuid, text, text) from public, anon;
grant execute on function public.set_brand_secret(uuid, text, text) to authenticated, service_role;

revoke all on function public.delete_brand_secret(uuid, text) from public, anon;
grant execute on function public.delete_brand_secret(uuid, text) to authenticated, service_role;

revoke all on function public.get_brand_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.get_brand_secret(uuid, text) to service_role;

-- Migrate existing plaintext keys into vault, then remove the columns.
do $$
declare
  r record;
begin
  for r in
    select id, klaviyo_api_key, clickup_api_key
    from public.brands
    where klaviyo_api_key is not null or clickup_api_key is not null
  loop
    if r.klaviyo_api_key is not null and length(trim(r.klaviyo_api_key)) > 0 then
      perform vault.create_secret(r.klaviyo_api_key, 'brand:' || r.id || ':klaviyo');
      update public.brands set klaviyo_key_set = true where id = r.id;
    end if;
    if r.clickup_api_key is not null and length(trim(r.clickup_api_key)) > 0 then
      perform vault.create_secret(r.clickup_api_key, 'brand:' || r.id || ':clickup');
      update public.brands set clickup_key_set = true where id = r.id;
    end if;
  end loop;
end;
$$;

alter table public.brands
  drop column if exists klaviyo_api_key,
  drop column if exists clickup_api_key;

-- ---------------------------------------------------------------------------
-- 2. Rate limiting (fixed window)
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limit_counters (
  subject text not null,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (subject, bucket, window_start)
);

alter table public.rate_limit_counters enable row level security;
-- No policies: only service role (bypasses RLS) may touch this table.

create or replace function public.check_rate_limit(
  p_subject text,
  p_bucket text,
  p_max integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_counters as rlc (subject, bucket, window_start, count)
  values (p_subject, p_bucket, v_window, 1)
  on conflict (subject, bucket, window_start)
  do update set count = rlc.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of stale windows (cheap, bounded).
  delete from public.rate_limit_counters
  where bucket = p_bucket and window_start < now() - interval '1 hour';

  return v_count <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Klaviyo push log (idempotency + audit trail)
-- ---------------------------------------------------------------------------

create table if not exists public.klaviyo_push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  brand_id uuid references public.brands(id) on delete set null,
  queue_id uuid,
  idempotency_key text unique,
  mode text not null,
  template_id text,
  campaign_id text,
  campaign_url text,
  created_at timestamptz not null default now()
);

alter table public.klaviyo_push_log enable row level security;

create policy "Users can view their own push log"
  on public.klaviyo_push_log for select
  using (auth.uid() = user_id);
-- Inserts happen via service role only.
