-- S-26 / team-size-scope: optional auto_join_min band on runs.
-- NULL = unset (existing runs keep today's join_mode). Do not ALTER TYPE join_mode.
-- Overlay: auto_join_run allows join_mode = auto_join OR auto_join_min IS NOT NULL.
-- band_full is not max-full: check max first so min = max stays all auto-join until capacity.
-- DROP of invite RPCs drops EXECUTE; re-GRANT after CREATE. Copy live bodies then edit.

-- ---------------------------------------------------------------------------
-- Column (nullable, no default, no backfill) + CHECK named for mapRunWriteError
-- ---------------------------------------------------------------------------

alter table public.runs
  add column auto_join_min integer;

comment on column public.runs.auto_join_min is
  'Optional auto-join band (S-26); NULL = unset; organizer counts toward N.';

alter table public.runs
  add constraint runs_auto_join_min_chk
  check (
    auto_join_min is null
    or (auto_join_min >= 1 and auto_join_min <= max_participants)
  );

-- ---------------------------------------------------------------------------
-- Column grants: copy the eight-column list and append auto_join_min.
-- Keep verified_at / completed_at / archived_at / extended_until / organizer_id closed.
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
  visibility,
  auto_join_min
) on table public.runs to authenticated;

-- ---------------------------------------------------------------------------
-- create_invite_only_run: DROP old 8-arg list (DROP drops EXECUTE).
-- Live body 20260831131219:313-398 (keep 5-cap UX pre-check). Add p_auto_join_min.
-- ---------------------------------------------------------------------------

drop function public.create_invite_only_run(
  text, uuid, text, timestamptz, integer, integer, public.join_mode, uuid[]
);

create function public.create_invite_only_run(
  p_title text,
  p_map_id uuid,
  p_map_category text,
  p_starts_at timestamptz,
  p_max_participants integer,
  p_min_points integer,
  p_join_mode public.join_mode,
  p_invitee_ids uuid[],
  p_auto_join_min integer default null
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
    visibility,
    auto_join_min
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
    'invite_only'::public.run_visibility,
    p_auto_join_min
  )
  returning id into v_run_id;

  insert into public.run_invites (run_id, user_id)
  select v_run_id, unnest(v_invitees);

  return v_run_id;
end;
$$;

revoke all on function public.create_invite_only_run(
  text, uuid, text, timestamptz, integer, integer, public.join_mode, uuid[], integer
) from public;
grant execute on function public.create_invite_only_run(
  text, uuid, text, timestamptz, integer, integer, public.join_mode, uuid[], integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- set_run_visibility_and_invites: DROP current 10-arg list (DROP drops EXECUTE).
-- Live body 20260824101006:519-599. Do not coalesce auto_join_min (cannot clear to NULL).
-- ---------------------------------------------------------------------------

drop function public.set_run_visibility_and_invites(
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
);

create function public.set_run_visibility_and_invites(
  p_run_id uuid,
  p_visibility public.run_visibility,
  p_invitee_ids uuid[],
  p_title text,
  p_map_id uuid,
  p_map_category text,
  p_starts_at timestamptz,
  p_max_participants integer,
  p_min_points integer,
  p_join_mode public.join_mode default null,
  p_update_auto_join_min boolean default false,
  p_auto_join_min integer default null
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
    join_mode = coalesce(p_join_mode, join_mode),
    auto_join_min = case
      when p_update_auto_join_min then p_auto_join_min
      else auto_join_min
    end
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
  public.join_mode,
  boolean,
  integer
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
  public.join_mode,
  boolean,
  integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- Freeze trigger: copy 20260820124849:51-89 including new.updated_at := now()
-- and change-gated capacity_below_confirmed. Lock auto_join_min with join_mode.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_run_update_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmed_count integer;
begin
  new.updated_at := now();

  if (
       new.join_mode is distinct from old.join_mode
    or new.auto_join_min is distinct from old.auto_join_min
  )
    and exists (
      select 1
      from public.run_participants rp
      where rp.run_id = new.id
        and rp.user_id <> new.organizer_id
    )
  then
    raise exception 'join_mode_locked' using errcode = 'P0001';
  end if;

  -- Only when capacity actually changes: S-02 Accept may already overfill, and an
  -- unrelated title/map save must still succeed on those rows.
  if new.max_participants is distinct from old.max_participants then
    select count(*)
      into v_confirmed_count
    from public.run_participants rp
    where rp.run_id = new.id
      and rp.status = 'confirmed'::public.participant_status;

    if new.max_participants < v_confirmed_count then
      raise exception 'capacity_below_confirmed' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- auto_join_run: live body 20260901083008:78-155; overlay any join_mode when
-- auto_join_min is set. Outcome order: full at max, then band_full at min.
-- ---------------------------------------------------------------------------

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

  -- Audience miss and completed both return not_active (no new oracle).
  if not found
    or not public.is_run_roster_open_row(v_run.archived_at, v_run.extended_until, v_run.completed_at)
    or not public.can_view_run(p_run_id)
  then
    return 'not_active';
  end if;

  if v_run.join_mode <> 'auto_join'::public.join_mode
     and v_run.auto_join_min is null then
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

  if v_run.auto_join_min is not null
     and v_confirmed_count >= v_run.auto_join_min then
    return 'band_full';
  end if;

  insert into public.run_participants (run_id, user_id, status)
  values (p_run_id, v_user_id, 'confirmed'::public.participant_status);

  return 'confirmed';
end;
$$;

revoke all on function public.auto_join_run(uuid) from public;
grant execute on function public.auto_join_run(uuid) to authenticated;
