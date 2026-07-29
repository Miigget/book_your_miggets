-- F-01 / run-domain-schema: minimal profiles, runs, run_participants + RLS baseline.
-- No map catalog, cron, or service_role usage.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('member', 'admin');
create type public.join_mode as enum ('approval_required', 'auto_join');
create type public.participant_status as enum ('pending', 'confirmed', 'denied');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'member',
  is_verified boolean not null default false,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  map text not null,
  starts_at timestamptz not null,
  max_participants integer not null check (max_participants > 0),
  min_points integer not null default 0 check (min_points >= 0),
  join_mode public.join_mode not null default 'approval_required',
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.run_participants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.participant_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, user_id)
);

create index runs_archived_at_starts_at_idx on public.runs (archived_at, starts_at);
create index runs_organizer_id_idx on public.runs (organizer_id);
create index run_participants_run_id_status_idx on public.run_participants (run_id, status);
create index run_participants_user_id_idx on public.run_participants (user_id);

-- ---------------------------------------------------------------------------
-- Helpers (tight SECURITY DEFINER; EXECUTE not granted to PUBLIC)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'::public.user_role
  );
$$;

create or replace function public.is_not_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_banned = false
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_not_banned() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_not_banned() to authenticated;

-- ---------------------------------------------------------------------------
-- Signup trigger: profile defaults only (never copy role/ban from metadata)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, is_verified, is_banned)
  values (new.id, 'member'::public.user_role, false, false);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent non-admins from changing privileged profile columns via client UPDATE.
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
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_profile_privileged_columns() from public;

create trigger profiles_enforce_privileged_columns
  before update on public.profiles
  for each row execute function public.enforce_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- Grants (RLS still gates rows; no blanket anon writes)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on table public.profiles to authenticated;
grant update on table public.profiles to authenticated;

grant select on table public.runs to anon, authenticated;
grant insert, update, delete on table public.runs to authenticated;

grant select on table public.run_participants to anon, authenticated;
grant insert, update on table public.run_participants to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
    and is_verified = (select p.is_verified from public.profiles p where p.id = (select auth.uid()))
    and is_banned = (select p.is_banned from public.profiles p where p.id = (select auth.uid()))
  );

create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS: runs
-- ---------------------------------------------------------------------------

alter table public.runs enable row level security;

create policy "runs_select_active_anon"
  on public.runs
  for select
  to anon
  using (archived_at is null);

create policy "runs_select_active_authenticated"
  on public.runs
  for select
  to authenticated
  using (archived_at is null);

create policy "runs_select_own_organizer"
  on public.runs
  for select
  to authenticated
  using ((select auth.uid()) = organizer_id);

create policy "runs_select_admin"
  on public.runs
  for select
  to authenticated
  using (public.is_admin());

create policy "runs_insert_own"
  on public.runs
  for insert
  to authenticated
  with check (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
  );

create policy "runs_update_own"
  on public.runs
  for update
  to authenticated
  using (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
  )
  with check (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
  );

create policy "runs_update_admin"
  on public.runs
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "runs_delete_admin"
  on public.runs
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS: run_participants
-- ---------------------------------------------------------------------------

alter table public.run_participants enable row level security;

create policy "run_participants_select_confirmed_anon"
  on public.run_participants
  for select
  to anon
  using (status = 'confirmed'::public.participant_status);

create policy "run_participants_select_confirmed_authenticated"
  on public.run_participants
  for select
  to authenticated
  using (status = 'confirmed'::public.participant_status);

create policy "run_participants_select_own"
  on public.run_participants
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "run_participants_select_organizer"
  on public.run_participants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.runs r
      where r.id = run_id
        and r.organizer_id = (select auth.uid())
    )
  );

create policy "run_participants_select_admin"
  on public.run_participants
  for select
  to authenticated
  using (public.is_admin());

create policy "run_participants_insert_self_pending"
  on public.run_participants
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'::public.participant_status
    and public.is_not_banned()
  );

create policy "run_participants_update_organizer"
  on public.run_participants
  for update
  to authenticated
  using (
    public.is_not_banned()
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and r.organizer_id = (select auth.uid())
    )
  )
  with check (
    public.is_not_banned()
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and r.organizer_id = (select auth.uid())
    )
  );

create policy "run_participants_update_admin"
  on public.run_participants
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
