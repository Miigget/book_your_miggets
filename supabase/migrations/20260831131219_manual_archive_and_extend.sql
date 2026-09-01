-- S-24 / manual-archive-and-extend Phase 1: stamp archive, optional extend, drop 1h
-- auto-archive, cap organizers at 5 audience-active runs.
-- Live RLS on this branch is S-15 (20260824101006). Do not copy clan_only / is_same_clan
-- from unshipped S-21 (feature/clan-runs). S-21 must retarget is_run_active_row when it merges.
-- Cutover order: column, backfill, then policies/functions. Do not GRANT UPDATE on
-- archived_at or extended_until. Do not call is_run_in_active_window from policies on runs.

-- ---------------------------------------------------------------------------
-- Column + cutover backfill (before policy rewrite)
-- ---------------------------------------------------------------------------

alter table public.runs
  add column extended_until timestamptz;

comment on column public.runs.extended_until is
  'Optional scheduled audience-exit set by organizer extend. Not a grace on every run. Elapsed value is derived-inactive; no stamp required.';

update public.runs
set archived_at = starts_at + interval '1 hour'
where archived_at is null
  and starts_at <= (now() - interval '1 hour');

-- ---------------------------------------------------------------------------
-- Shared audience-active helper (column args only — never SELECT runs)
-- ---------------------------------------------------------------------------

create or replace function public.is_run_active_row(
  p_archived_at timestamptz,
  p_extended_until timestamptz
)
returns boolean
language sql
stable
as $$
  select p_archived_at is null
    and (p_extended_until is null or p_extended_until > now());
$$;

revoke all on function public.is_run_active_row(timestamptz, timestamptz) from public;
grant execute on function public.is_run_active_row(timestamptz, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- can_view_run: privilege first, then audience-active (S-15 visibility axes)
-- ---------------------------------------------------------------------------

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
  v_extended_until timestamptz;
  v_in_window boolean;
begin
  select r.visibility, r.organizer_id, r.archived_at, r.extended_until
    into v_visibility, v_organizer, v_archived_at, v_extended_until
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

  v_in_window := public.is_run_active_row(v_archived_at, v_extended_until);
  if not v_in_window then
    return false;
  end if;

  if v_visibility = 'public'::public.run_visibility then
    return true;
  end if;

  -- Guests: only public + audience-active. Do not call are_friends.
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

-- ---------------------------------------------------------------------------
-- runs SELECT: audience ANDed into audience-active; confirmed seat unbounded
-- ---------------------------------------------------------------------------

drop policy if exists "runs_select_active_anon" on public.runs;
drop policy if exists "runs_select_active_authenticated" on public.runs;

create policy "runs_select_active_anon"
  on public.runs
  for select
  to anon
  using (
    public.is_run_active_row(archived_at, extended_until)
    and visibility = 'public'::public.run_visibility
  );

create policy "runs_select_active_authenticated"
  on public.runs
  for select
  to authenticated
  using (
    public.is_run_active_row(archived_at, extended_until)
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

-- ---------------------------------------------------------------------------
-- runs UPDATE: organizer + not banned + audience-active (OLD and NEW)
-- ---------------------------------------------------------------------------

drop policy if exists "runs_update_own" on public.runs;

create policy "runs_update_own"
  on public.runs
  for update
  to authenticated
  using (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
    and public.is_run_active_row(archived_at, extended_until)
  )
  with check (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
    and public.is_run_active_row(archived_at, extended_until)
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

-- ---------------------------------------------------------------------------
-- run_invites: organizer + audience-active
-- ---------------------------------------------------------------------------

drop policy if exists "run_invites_insert_organizer_active" on public.run_invites;
drop policy if exists "run_invites_delete_organizer_active" on public.run_invites;

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
        and public.is_run_active_row(r.archived_at, r.extended_until)
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
        and public.is_run_active_row(r.archived_at, r.extended_until)
    )
  );

-- ---------------------------------------------------------------------------
-- is_run_in_active_window + auto_join_run (still DEFINER; still not used from runs policies)
-- ---------------------------------------------------------------------------

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
      and public.is_run_active_row(r.archived_at, r.extended_until)
  )
  and public.can_view_run(p_run_id);
$$;

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

  -- Audience miss returns the same not_active as a missing/inactive run (no new oracle).
  if not found
    or not public.is_run_active_row(v_run.archived_at, v_run.extended_until)
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

-- ---------------------------------------------------------------------------
-- create_invite_only_run: UX pre-check for the 5-cap (trigger serializes)
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

  -- UX pre-check; BEFORE INSERT trigger is the source of truth and serializes.
  if (
    select count(*)
    from public.runs r
    where r.organizer_id = v_uid
      and public.is_run_active_row(r.archived_at, r.extended_until)
  ) >= 5 then
    raise exception 'active_run_cap' using errcode = 'P0001';
  end if;

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

-- ---------------------------------------------------------------------------
-- Organizer cap: lock namespace 8724 is this slice's organizer-cap advisory lock.
-- Later advisory locks must not reuse (8724, hashtext(organizer_id)).
-- Count existing rows only (NEW is not visible yet).
-- ---------------------------------------------------------------------------

create or replace function public.enforce_organizer_active_run_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Namespace 8724 = S-24 organizer audience-active cap. Do not collide.
  perform pg_advisory_xact_lock(8724, hashtext(new.organizer_id::text));

  if (
    select count(*)
    from public.runs r
    where r.organizer_id = new.organizer_id
      and public.is_run_active_row(r.archived_at, r.extended_until)
  ) >= 5 then
    raise exception 'active_run_cap' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_organizer_active_run_cap() from public, anon, authenticated;

create trigger runs_enforce_organizer_active_run_cap
  before insert on public.runs
  for each row execute function public.enforce_organizer_active_run_cap();

-- ---------------------------------------------------------------------------
-- archive_run / extend_run: DEFINER writers; column grants stay closed
-- ---------------------------------------------------------------------------

create or replace function public.archive_run(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.runs;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select * into v_run
  from public.runs
  where id = p_run_id;

  if not found then
    return 'not_found';
  end if;

  -- Do not leak restricted runs: non-organizer non-admin looks like missing.
  if v_uid is distinct from v_run.organizer_id and not public.is_admin() then
    return 'not_found';
  end if;

  -- Organizer path follows is_not_banned(); admin non-owner skips (admin archive still works).
  if v_uid = v_run.organizer_id and not public.is_not_banned() then
    return 'banned';
  end if;

  if v_run.archived_at is not null then
    return 'already_archived';
  end if;

  update public.runs
  set archived_at = now()
  where id = p_run_id
    and archived_at is null;

  return 'archived';
end;
$$;

revoke all on function public.archive_run(uuid) from public, anon;
grant execute on function public.archive_run(uuid) to authenticated;

create or replace function public.extend_run(p_run_id uuid, p_hours integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.runs;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select * into v_run
  from public.runs
  where id = p_run_id;

  if not found then
    return 'not_found';
  end if;

  -- Organizer only. Admin who is not organizer → not_found (do not leak).
  if v_uid is distinct from v_run.organizer_id then
    return 'not_found';
  end if;

  if not public.is_not_banned() then
    return 'banned';
  end if;

  if p_hours is null or p_hours not in (1, 2, 3, 6) then
    return 'invalid_hours';
  end if;

  if not public.is_run_active_row(v_run.archived_at, v_run.extended_until) then
    return 'not_active';
  end if;

  if now() < v_run.starts_at then
    return 'not_in_progress';
  end if;

  if v_run.extended_until is not null then
    return 'already_extended';
  end if;

  update public.runs
  set extended_until = now() + (p_hours * interval '1 hour')
  where id = p_run_id
    and extended_until is null;

  return 'extended';
end;
$$;

revoke all on function public.extend_run(uuid, integer) from public, anon;
grant execute on function public.extend_run(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Column grants: keep archived_at and extended_until off authenticated UPDATE
-- ---------------------------------------------------------------------------

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
-- list_player_public_runs: add extended_until; CREATE OR REPLACE cannot change
-- RETURNS TABLE — drop then create. Query stays unfiltered (no time predicate).
-- ---------------------------------------------------------------------------

drop function if exists public.list_player_public_runs(uuid);

create function public.list_player_public_runs(p_user_id uuid)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  archived_at timestamptz,
  extended_until timestamptz,
  max_participants integer,
  min_points integer,
  join_mode public.join_mode,
  visibility public.run_visibility,
  created_at timestamptz,
  organizer_id uuid,
  map_category text,
  confirmed_count integer,
  organizer_nickname text,
  map_id uuid,
  map_name text,
  map_difficulty text,
  map_stars text,
  map_points integer,
  map_length text,
  map_creator text,
  map_released_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.title,
    r.starts_at,
    r.archived_at,
    r.extended_until,
    r.max_participants,
    r.min_points,
    r.join_mode,
    r.visibility,
    r.created_at,
    r.organizer_id,
    r.map_category,
    (
      select count(*)::integer
      from public.run_participants p
      where p.run_id = r.id
        and p.status = 'confirmed'::public.participant_status
    ) as confirmed_count,
    pr.nickname,
    m.id,
    m.name,
    m.difficulty,
    m.stars,
    m.points,
    m.length,
    m.creator,
    m.released_on
  from public.runs r
  left join public.profiles pr on pr.id = r.organizer_id
  left join public.maps m on m.id = r.map_id
  where r.visibility = 'public'::public.run_visibility
    and (
      r.organizer_id = p_user_id
      or exists (
        select 1
        from public.run_participants p
        where p.run_id = r.id
          and p.user_id = p_user_id
          and p.status = 'confirmed'::public.participant_status
      )
    );
$$;

revoke all on function public.list_player_public_runs(uuid) from public;
grant execute on function public.list_player_public_runs(uuid) to anon, authenticated;
