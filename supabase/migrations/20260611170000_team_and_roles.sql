-- Team structure v1: roles, invites, and admin-wide visibility for
-- analytics. (Shared org workspaces — members seeing each other's brands —
-- is phase 2; this establishes the admin/member model and team analytics.)

alter table public.profiles
  add column if not exists role text not null default 'member'
  check (role in ('admin', 'member'));

-- Everyone who already has an account predates the team model: make them
-- admins of their own workspace.
update public.profiles set role = 'admin';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  accepted_user_id uuid,
  created_at timestamptz not null default now()
);

alter table public.team_invites enable row level security;

create policy "Admins manage invites"
  on public.team_invites for all
  using (public.is_admin())
  with check (public.is_admin());

-- Admins can see the whole team's profiles and campaign throughput
-- (powers the analytics page).
create policy "Admins read all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Admins read all campaigns"
  on public.campaign_queue for select
  using (public.is_admin());
