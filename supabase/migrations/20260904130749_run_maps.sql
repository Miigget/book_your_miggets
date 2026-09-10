-- S-27 / multi-map-runs: ordered session map list (max 8). Keep runs.map_id /
-- map_category. Do not alter verify_clan_run_finish. Do not REVOKE/rewrite the
-- runs UPDATE column list (lifecycle stamps stay closed).
-- DROP of invite RPCs drops EXECUTE; re-GRANT after CREATE. Copy live bodies
-- from 20260901140012 then add p_map_ids.
-- Create default '{}' always writes the junction; setter default NULL skips
-- (omit-to-keep, same class as p_update_auto_join_min). Do not coalesce
-- setter NULL to '{}'.

-- ---------------------------------------------------------------------------
-- run_is_public: visibility only (no audience-active test). Used ONLY in
-- run_maps SELECT so guests can batch-read archived public maps without
-- widening can_view_run or archived /runs/{id}.
-- ---------------------------------------------------------------------------

create function public.run_is_public(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.runs r
    where r.id = p_run_id and r.visibility = 'public'
  );
$$;

revoke all on function public.run_is_public(uuid) from public;
grant execute on function public.run_is_public(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table: unique (run_id, map_id) via PK; unique (run_id, position); cap 8
-- ---------------------------------------------------------------------------

create table public.run_maps (
  run_id uuid not null references public.runs (id) on delete cascade,
  map_id uuid not null references public.maps (id) on delete restrict,
  position smallint not null,
  primary key (run_id, map_id),
  constraint run_maps_run_id_position_key unique (run_id, position),
  constraint run_maps_position_chk check (position >= 1 and position <= 8)
);

comment on table public.run_maps is
  'S-27 session map list (max 8, add-order). runs.map_id remains the synced first/legacy/S-28 lock field.';

-- ---------------------------------------------------------------------------
-- Backfill: existing map_id rows become a one-item set at position 1
-- ---------------------------------------------------------------------------

insert into public.run_maps (run_id, map_id, position)
select r.id, r.map_id, 1::smallint
from public.runs r
where r.map_id is not null;

-- ---------------------------------------------------------------------------
-- Grants: SELECT for viewers; INSERT/DELETE replace-all (no UPDATE)
-- ---------------------------------------------------------------------------

revoke all on table public.run_maps from public;
grant select on table public.run_maps to anon, authenticated;
grant select, insert, delete on table public.run_maps to authenticated;

alter table public.run_maps enable row level security;

-- ---------------------------------------------------------------------------
-- RLS: SELECT = parent visible to invoker OR DEFINER run_is_public.
-- INSERT/DELETE = organizer + roster-open (column-args helper, not uuid).
-- Do not call can_view_run. Do not use DEFINER on writes.
-- ---------------------------------------------------------------------------

create policy "run_maps_select_anon"
  on public.run_maps
  for select
  to anon
  using (
    exists (select 1 from public.runs r where r.id = run_id)
    or public.run_is_public(run_id)
  );

create policy "run_maps_select_authenticated"
  on public.run_maps
  for select
  to authenticated
  using (
    exists (select 1 from public.runs r where r.id = run_id)
    or public.run_is_public(run_id)
  );

create policy "run_maps_insert_organizer_open"
  on public.run_maps
  for insert
  to authenticated
  with check (
    public.is_run_organizer(run_id)
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)
    )
  );

create policy "run_maps_delete_organizer_open"
  on public.run_maps
  for delete
  to authenticated
  using (
    public.is_run_organizer(run_id)
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)
    )
  );

-- ---------------------------------------------------------------------------
-- create_invite_only_run: DROP current 9-arg list (DROP drops EXECUTE).
-- Live body 20260901140012. Append p_map_ids uuid[] default '{}'.
-- Always replace-all from unnest(p_map_ids) WITH ORDINALITY after INSERT.
-- ---------------------------------------------------------------------------

drop function public.create_invite_only_run(
  text, uuid, text, timestamptz, integer, integer, public.join_mode, uuid[], integer
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
  p_auto_join_min integer default null,
  p_map_ids uuid[] default '{}'
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

  -- S-27: create always writes the junction. Default '{}' = empty list.
  if cardinality(p_map_ids) > 8 then
    raise exception 'run_maps_cap' using errcode = 'P0001';
  end if;

  delete from public.run_maps where run_id = v_run_id;

  insert into public.run_maps (run_id, map_id, position)
  select v_run_id, x.map_id, x.ord::smallint
  from unnest(coalesce(p_map_ids, '{}'::uuid[])) with ordinality as x(map_id, ord);

  insert into public.run_invites (run_id, user_id)
  select v_run_id, unnest(v_invitees);

  return v_run_id;
end;
$$;

revoke all on function public.create_invite_only_run(
  text, uuid, text, timestamptz, integer, integer, public.join_mode, uuid[], integer, uuid[]
) from public;
grant execute on function public.create_invite_only_run(
  text, uuid, text, timestamptz, integer, integer, public.join_mode, uuid[], integer, uuid[]
) to authenticated;

-- ---------------------------------------------------------------------------
-- set_run_visibility_and_invites: DROP current 12-arg list (DROP drops EXECUTE).
-- Live body 20260901140012. Append p_map_ids uuid[] default null.
-- NULL skips the junction write; '{}' or a list replaces. No coalesce to '{}'.
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
  public.join_mode,
  boolean,
  integer
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
  p_auto_join_min integer default null,
  p_map_ids uuid[] default null
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

  -- S-27: NULL = skip (12-arg omit-to-keep). '{}' or a list replaces.
  -- Do not coalesce(p_map_ids, '{}') — NULL must not wipe backfill.
  if p_map_ids is not null then
    if cardinality(p_map_ids) > 8 then
      raise exception 'run_maps_cap' using errcode = 'P0001';
    end if;

    delete from public.run_maps where run_id = p_run_id;

    insert into public.run_maps (run_id, map_id, position)
    select p_run_id, x.map_id, x.ord::smallint
    from unnest(p_map_ids) with ordinality as x(map_id, ord);
  end if;
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
  integer,
  uuid[]
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
  integer,
  uuid[]
) to authenticated;
