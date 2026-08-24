-- S-15 / restricted-run-visibility: visibility axis, invite snapshot, audience SELECT,
-- sibling leak closes, and invite-only INVOKER writers.
-- can_view_run inlines the FR-013 window and must never call is_run_in_active_window
-- (one-way: window helper → can_view_run). Do not call can_view_run from policies on
-- public.runs (it SELECTs runs). Do not call is_run_invitee from policies on run_invites.

-- ---------------------------------------------------------------------------
-- Enum + column (existing rows default public)
-- ---------------------------------------------------------------------------

create type public.run_visibility as enum ('public', 'friends_only', 'invite_only');

alter table public.runs
  add column visibility public.run_visibility not null default 'public';

-- ---------------------------------------------------------------------------
-- run_invites: snapshot of invite-only audience (unfriend does not drop a row)
-- ---------------------------------------------------------------------------

create table public.run_invites (
  run_id uuid not null references public.runs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (run_id, user_id)
);

create index run_invites_user_id_idx on public.run_invites (user_id);

revoke all on table public.run_invites from public, anon;
grant select, insert, delete on table public.run_invites to authenticated;

alter table public.run_invites enable row level security;

create policy "run_invites_select_organizer"
  on public.run_invites
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

create policy "run_invites_select_invitee"
  on public.run_invites
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "run_invites_select_admin"
  on public.run_invites
  for select
  to authenticated
  using (public.is_admin());

create policy "run_invites_insert_organizer_active"
  on public.run_invites
  for insert
  to authenticated
  with check (
    public.is_not_banned()
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and r.organizer_id = (select auth.uid())
        and r.archived_at is null
        and r.starts_at > (now() - interval '1 hour')
    )
  );

create policy "run_invites_delete_organizer_active"
  on public.run_invites
  for delete
  to authenticated
  using (
    public.is_not_banned()
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and r.organizer_id = (select auth.uid())
        and r.archived_at is null
        and r.starts_at > (now() - interval '1 hour')
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_run_invitee(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.run_invites ri
    where ri.run_id = p_run_id
      and ri.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_run_invitee(uuid) from public;
grant execute on function public.is_run_invitee(uuid) to authenticated;

-- DEFINER-reads runs (and invite/friend helpers). Never used from policies on runs.
-- Never calls is_run_in_active_window. Anon: public + inlined window only.
create or replace function public.can_view_run(p_run_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_visibility public.run_visibility;
  v_organizer uuid;
  v_archived_at timestamptz;
  v_starts_at timestamptz;
  v_in_window boolean;
begin
  select r.visibility, r.organizer_id, r.archived_at, r.starts_at
    into v_visibility, v_organizer, v_archived_at, v_starts_at
  from public.runs r
  where r.id = p_run_id;

  if not found then
    return false;
  end if;

  if public.is_admin() then
    return true;
  end if;

  if v_uid is not null and v_uid = v_organizer then
    return true;
  end if;

  if public.is_confirmed_participant(p_run_id) then
    return true;
  end if;

  v_in_window := v_archived_at is null and v_starts_at > (now() - interval '1 hour');
  if not v_in_window then
    return false;
  end if;

  if v_visibility = 'public'::public.run_visibility then
    return true;
  end if;

  -- Guests: only public + window. Do not call are_friends.
  if v_uid is null then
    return false;
  end if;

  if v_visibility = 'friends_only'::public.run_visibility then
    return public.are_friends(v_organizer, v_uid);
  end if;

  if v_visibility = 'invite_only'::public.run_visibility then
    return public.is_run_invitee(p_run_id);
  end if;

  return false;
end;
$$;

revoke all on function public.can_view_run(uuid) from public;
grant execute on function public.can_view_run(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- runs SELECT: audience ANDed into the active window; confirmed seat unbounded
-- ---------------------------------------------------------------------------

drop policy if exists "runs_select_active_anon" on public.runs;
drop policy if exists "runs_select_active_authenticated" on public.runs;
drop policy if exists "runs_select_archived_confirmed_participant" on public.runs;

create policy "runs_select_active_anon"
  on public.runs
  for select
  to anon
  using (
    archived_at is null
    and starts_at > (now() - interval '1 hour')
    and visibility = 'public'::public.run_visibility
  );

create policy "runs_select_active_authenticated"
  on public.runs
  for select
  to authenticated
  using (
    archived_at is null
    and starts_at > (now() - interval '1 hour')
    and (
      visibility = 'public'::public.run_visibility
      or (
        visibility = 'friends_only'::public.run_visibility
        and public.are_friends(organizer_id, (select auth.uid()))
      )
      or (
        visibility = 'invite_only'::public.run_visibility
        and public.is_run_invitee(id)
      )
    )
  );

create policy "runs_select_confirmed_participant"
  on public.runs
  for select
  to authenticated
  using (public.is_confirmed_participant(id));

-- ---------------------------------------------------------------------------
-- runs INSERT/UPDATE: restricted visibility requires a currently verified organizer
-- ---------------------------------------------------------------------------

drop policy if exists "runs_insert_own" on public.runs;
drop policy if exists "runs_update_own" on public.runs;

create policy "runs_insert_own"
  on public.runs
  for insert
  to authenticated
  with check (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
    and (
      visibility = 'public'::public.run_visibility
      or exists (
        select 1
        from public.public_profiles pp
        where pp.id = organizer_id
          and pp.is_verified
      )
    )
  );

create policy "runs_update_own"
  on public.runs
  for update
  to authenticated
  using (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
    and archived_at is null
    and starts_at > (now() - interval '1 hour')
  )
  with check (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
    and archived_at is null
    and starts_at > (now() - interval '1 hour')
    and (
      visibility = 'public'::public.run_visibility
      or exists (
        select 1
        from public.public_profiles pp
        where pp.id = organizer_id
          and pp.is_verified
      )
    )
  );

revoke update on table public.runs from authenticated;
grant update (
  title,
  map_id,
  map_category,
  starts_at,
  max_participants,
  min_points,
  join_mode,
  visibility
) on table public.runs to authenticated;

-- ---------------------------------------------------------------------------
-- Sibling leaks: confirmed participants dump, pending INSERT, auto_join, window oracle
-- ---------------------------------------------------------------------------

drop policy if exists "run_participants_select_confirmed_anon" on public.run_participants;
drop policy if exists "run_participants_select_confirmed_authenticated" on public.run_participants;
drop policy if exists "run_participants_insert_self_pending" on public.run_participants;

create policy "run_participants_select_confirmed_anon"
  on public.run_participants
  for select
  to anon
  using (
    status = 'confirmed'::public.participant_status
    and public.can_view_run(run_id)
  );

create policy "run_participants_select_confirmed_authenticated"
  on public.run_participants
  for select
  to authenticated
  using (
    status = 'confirmed'::public.participant_status
    and public.can_view_run(run_id)
  );

create policy "run_participants_insert_self_pending"
  on public.run_participants
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'::public.participant_status
    and public.is_not_banned()
    and public.can_view_run(run_id)
  );

create or replace function public.auto_join_run(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_run public.runs;
  v_status public.participant_status;
  v_confirmed_count integer;
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  if not public.is_not_banned() then
    return 'banned';
  end if;

  -- Lock the run row: all concurrent applies to this run serialize here, so the
  -- confirmed-seat count below stays stable for the rest of the transaction.
  select * into v_run
  from public.runs
  where id = p_run_id
  for update;

  -- Mirror the FR-013 active window used by RLS and loadActiveRunForMutation.
  -- Audience miss returns the same not_active as a missing/past-grace run (no new oracle).
  if not found
    or v_run.archived_at is not null
    or v_run.starts_at <= (now() - interval '1 hour')
    or not public.can_view_run(p_run_id)
  then
    return 'not_active';
  end if;

  if v_run.join_mode <> 'auto_join'::public.join_mode then
    return 'not_auto_join';
  end if;

  -- Nickname gate parity with the app layer (whitespace-only counts as unset);
  -- defends direct PostgREST calls that skip the service-level check.
  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and nullif(btrim(nickname), '') is not null
  ) then
    return 'no_nickname';
  end if;

  select status into v_status
  from public.run_participants
  where run_id = p_run_id
    and user_id = v_user_id;

  if found then
    case v_status
      when 'pending'::public.participant_status then return 'already_pending';
      when 'confirmed'::public.participant_status then return 'already_confirmed';
      when 'denied'::public.participant_status then return 'denied';
    end case;
  end if;

  select count(*) into v_confirmed_count
  from public.run_participants
  where run_id = p_run_id
    and status = 'confirmed'::public.participant_status;

  if v_confirmed_count >= v_run.max_participants then
    return 'full';
  end if;

  insert into public.run_participants (run_id, user_id, status)
  values (p_run_id, v_user_id, 'confirmed'::public.participant_status);

  return 'confirmed';
end;
$$;

revoke all on function public.auto_join_run(uuid) from public;
grant execute on function public.auto_join_run(uuid) to authenticated;

create or replace function public.is_run_in_active_window(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.runs r
    where r.id = p_run_id
      and r.archived_at is null
      and r.starts_at > (now() - interval '1 hour')
  )
  and public.can_view_run(p_run_id);
$$;

revoke all on function public.is_run_in_active_window(uuid) from public;
grant execute on function public.is_run_in_active_window(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invite-only writers (SECURITY INVOKER so runs / run_invites RLS still apply).
-- Invite replace is inlined — no Worker-facing sync_run_invites.
-- p_join_mode uses public.join_mode (live column type); null on the setter
-- leaves join_mode unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.create_invite_only_run(
  p_title text,
  p_map_id uuid,
  p_map_category text,
  p_starts_at timestamptz,
  p_max_participants integer,
  p_min_points integer,
  p_join_mode public.join_mode,
  p_invitee_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run_id uuid;
  v_invitees uuid[];
  v_invitee uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct x), '{}')
    into v_invitees
  from unnest(coalesce(p_invitee_ids, '{}'::uuid[])) as x
  where x is not null;

  if cardinality(v_invitees) = 0 then
    raise exception 'invite_list_empty' using errcode = 'P0001';
  end if;

  foreach v_invitee in array v_invitees
  loop
    if v_invitee = v_uid then
      raise exception 'invitee_is_organizer' using errcode = 'P0001';
    end if;
    if not public.are_friends(v_uid, v_invitee) then
      raise exception 'invitee_not_friend' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.runs (
    organizer_id,
    title,
    map_id,
    map_category,
    starts_at,
    max_participants,
    min_points,
    join_mode,
    archived_at,
    visibility
  )
  values (
    v_uid,
    p_title,
    p_map_id,
    p_map_category,
    p_starts_at,
    p_max_participants,
    p_min_points,
    p_join_mode,
    null,
    'invite_only'::public.run_visibility
  )
  returning id into v_run_id;

  insert into public.run_invites (run_id, user_id)
  select v_run_id, unnest(v_invitees);

  return v_run_id;
end;
$$;

revoke all on function public.create_invite_only_run(
  text, uuid, text, timestamptz, integer, integer, public.join_mode, uuid[]
) from public;
grant execute on function public.create_invite_only_run(
  text, uuid, text, timestamptz, integer, integer, public.join_mode, uuid[]
) to authenticated;

create or replace function public.set_run_visibility_and_invites(
  p_run_id uuid,
  p_visibility public.run_visibility,
  p_invitee_ids uuid[],
  p_title text,
  p_map_id uuid,
  p_map_category text,
  p_starts_at timestamptz,
  p_max_participants integer,
  p_min_points integer,
  p_join_mode public.join_mode default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organizer uuid;
  v_invitees uuid[];
  v_existing uuid[];
  v_invitee uuid;
  v_updated integer;
begin
  select coalesce(array_agg(distinct x), '{}')
    into v_invitees
  from unnest(coalesce(p_invitee_ids, '{}'::uuid[])) as x
  where x is not null;

  if p_visibility = 'invite_only'::public.run_visibility
     and cardinality(v_invitees) = 0 then
    raise exception 'invite_list_empty' using errcode = 'P0001';
  end if;

  select organizer_id into v_organizer
  from public.runs
  where id = p_run_id;

  if not found then
    raise exception 'run_not_found' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(ri.user_id), '{}')
    into v_existing
  from public.run_invites ri
  where ri.run_id = p_run_id;

  foreach v_invitee in array v_invitees
  loop
    if v_invitee = v_organizer then
      raise exception 'invitee_is_organizer' using errcode = 'P0001';
    end if;
    if not (v_invitee = any (v_existing))
       and not public.are_friends(v_organizer, v_invitee) then
      raise exception 'invitee_not_friend' using errcode = 'P0001';
    end if;
  end loop;

  update public.runs
  set
    visibility = p_visibility,
    title = p_title,
    map_id = p_map_id,
    map_category = p_map_category,
    starts_at = p_starts_at,
    max_participants = p_max_participants,
    min_points = p_min_points,
    join_mode = coalesce(p_join_mode, join_mode)
  where id = p_run_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'run_not_found' using errcode = 'P0001';
  end if;

  delete from public.run_invites where run_id = p_run_id;

  insert into public.run_invites (run_id, user_id)
  select p_run_id, unnest(v_invitees);
end;
$$;

revoke all on function public.set_run_visibility_and_invites(
  uuid,
  public.run_visibility,
  uuid[],
  text,
  uuid,
  text,
  timestamptz,
  integer,
  integer,
  public.join_mode
) from public;
grant execute on function public.set_run_visibility_and_invites(
  uuid,
  public.run_visibility,
  uuid[],
  text,
  uuid,
  text,
  timestamptz,
  integer,
  integer,
  public.join_mode
) to authenticated;
