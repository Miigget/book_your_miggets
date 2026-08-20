-- S-10 / user-profile: kog points, verified flag, nickname lock, request queue, wider public_profiles.

-- ---------------------------------------------------------------------------
-- profiles: member-editable points + privileged verified flag
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column kog_points integer null,
  add column kog_points_verified boolean not null default false;

alter table public.profiles
  add constraint profiles_kog_points_non_negative_chk
  check (kog_points is null or kog_points >= 0);

-- ---------------------------------------------------------------------------
-- public_profiles: guest-safe identity (keep security_invoker = false)
-- ---------------------------------------------------------------------------

create or replace view public.public_profiles
with (security_invoker = false)
as
select id, nickname, is_verified, kog_points, kog_points_verified
from public.profiles;

revoke all on table public.public_profiles from public;
grant select on table public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- nickname change requests (S-16 fulfills; this slice stores pending rows)
-- ---------------------------------------------------------------------------

create type public.nickname_change_request_status as enum ('pending', 'accepted', 'denied');

create table public.nickname_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  requested_nickname text not null,
  status public.nickname_change_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nickname_change_requests_requested_nickname_nonempty_chk
    check (char_length(btrim(requested_nickname)) > 0)
);

create unique index nickname_change_requests_one_pending_per_user_uidx
  on public.nickname_change_requests (user_id)
  where status = 'pending'::public.nickname_change_request_status;

create index nickname_change_requests_user_id_idx
  on public.nickname_change_requests (user_id);

revoke all on table public.nickname_change_requests from public;
grant select, insert, update on table public.nickname_change_requests to authenticated;

alter table public.nickname_change_requests enable row level security;

create policy "nickname_change_requests_insert_own_pending"
  on public.nickname_change_requests
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'::public.nickname_change_request_status
  );

create policy "nickname_change_requests_select_own"
  on public.nickname_change_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "nickname_change_requests_update_own_pending"
  on public.nickname_change_requests
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status = 'pending'::public.nickname_change_request_status
  )
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'::public.nickname_change_request_status
  );

create policy "nickname_change_requests_select_admin"
  on public.nickname_change_requests
  for select
  to authenticated
  using (public.is_admin());

create policy "nickname_change_requests_update_admin"
  on public.nickname_change_requests
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Privileged-column lock: verified nickname + points-verified flag
-- ---------------------------------------------------------------------------

create or replace function public.enforce_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.is_verified := old.is_verified;
    new.is_banned := old.is_banned;
    if old.is_verified then
      new.nickname := old.nickname;
    end if;
    if new.kog_points is distinct from old.kog_points then
      new.kog_points_verified := false;
    else
      new.kog_points_verified := old.kog_points_verified;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_profile_privileged_columns() from public;
