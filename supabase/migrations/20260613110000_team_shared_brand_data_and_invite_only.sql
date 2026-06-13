-- Team-shared brand data + invite-only sign-up.
--
-- Decision (Jack, 2026-06-13): Sendr is a single trusted agency workspace.
-- Every invited user shares all BRAND-attached data (brands, footers, brand
-- intelligence/knowledge, link index, segment sets). The CAMPAIGN QUEUE stays
-- PER-USER (campaign_queue policies are intentionally left untouched).
--
-- This is safe only because account creation is locked to invite-only (the
-- trigger below) — otherwise open sign-up + shared data would expose client
-- data to anyone. Edge functions use the service role and bypass RLS, so the
-- processing pipeline is unaffected.

-- ── Brand-attached tables → readable/writable by any authenticated user ──────

-- brands
drop policy if exists "Users can view own brands"   on public.brands;
drop policy if exists "Users can create own brands" on public.brands;
drop policy if exists "Users can update own brands" on public.brands;
drop policy if exists "Users can delete own brands" on public.brands;
create policy "Team can view brands"   on public.brands for select to authenticated using (true);
create policy "Team can insert brands" on public.brands for insert to authenticated with check (true);
create policy "Team can update brands" on public.brands for update to authenticated using (true);
create policy "Team can delete brands" on public.brands for delete to authenticated using (true);

-- brand_knowledge (brand intelligence)
drop policy if exists "Users manage knowledge for their brands" on public.brand_knowledge;
create policy "Team manages brand knowledge" on public.brand_knowledge
  for all to authenticated using (true) with check (true);

-- brand_link_index
drop policy if exists "Users can view links for own brands"   on public.brand_link_index;
drop policy if exists "Users can create links for own brands" on public.brand_link_index;
drop policy if exists "Users can update links for own brands" on public.brand_link_index;
drop policy if exists "Users can delete links for own brands" on public.brand_link_index;
create policy "Team manages brand links" on public.brand_link_index
  for all to authenticated using (true) with check (true);

-- sitemap_import_jobs
drop policy if exists "Users can view import jobs for own brands"   on public.sitemap_import_jobs;
drop policy if exists "Users can create import jobs for own brands" on public.sitemap_import_jobs;
drop policy if exists "Users can update import jobs for own brands" on public.sitemap_import_jobs;
drop policy if exists "Users can delete import jobs for own brands" on public.sitemap_import_jobs;
create policy "Team manages import jobs" on public.sitemap_import_jobs
  for all to authenticated using (true) with check (true);

-- brand_footers (was wide-open to ALL roles incl anon — tighten to authenticated)
drop policy if exists "Anyone can view brand footers"   on public.brand_footers;
drop policy if exists "Anyone can create brand footers" on public.brand_footers;
drop policy if exists "Anyone can update brand footers" on public.brand_footers;
drop policy if exists "Anyone can delete brand footers" on public.brand_footers;
create policy "Team manages brand footers" on public.brand_footers
  for all to authenticated using (true) with check (true);

-- segment_presets (was wide-open to ALL roles incl anon — tighten to authenticated)
drop policy if exists "Anyone can view segment presets"   on public.segment_presets;
drop policy if exists "Anyone can create segment presets" on public.segment_presets;
drop policy if exists "Anyone can update segment presets" on public.segment_presets;
drop policy if exists "Anyone can delete segment presets" on public.segment_presets;
create policy "Team manages segment presets" on public.segment_presets
  for all to authenticated using (true) with check (true);

-- NOTE: public.campaign_queue policies are intentionally NOT modified — the
-- queue remains per-user (auth.uid() = user_id).

-- ── Invite-only sign-up enforcement ─────────────────────────────────────────
-- Blocks public self-signup while allowing: the very first account (bootstrap),
-- admin invites (auth.admin.inviteUserByEmail sets invited_at), and any email
-- with a pending team_invites row. Existing users are unaffected (INSERT-only).
create or replace function public.enforce_invite_only()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if (select count(*) from auth.users) = 0 then
    return new; -- bootstrap the first account
  end if;
  if new.invited_at is not null then
    return new; -- created via admin invite (inviteUserByEmail)
  end if;
  if exists (select 1 from public.team_invites where lower(email) = lower(new.email)) then
    return new; -- an admin pre-registered this email
  end if;
  raise exception 'Sign-ups are invite-only. Ask an admin to invite you.';
end;
$$;

drop trigger if exists enforce_invite_only_trigger on auth.users;
create trigger enforce_invite_only_trigger
  before insert on auth.users
  for each row execute function public.enforce_invite_only();
