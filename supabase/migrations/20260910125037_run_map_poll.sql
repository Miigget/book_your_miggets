-- S-28 / map-poll: one poll per run, catalog options, change-vote until close.
-- Close writes runs.map_id (XOR-clears map_category) and must not touch run_maps.
-- RPC-only writes. Authenticated SELECT; never anon, never run_is_public.
-- CREATE OR REPLACE invite setter keeps the live 13-arg signature (20260904130749).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.run_map_polls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz null,
  winner_map_id uuid null references public.maps (id) on delete restrict
);

comment on table public.run_map_polls is
  'S-28 one map poll per run. Close locks runs.map_id; never replaces run_maps.';

create table public.run_map_poll_options (
  poll_id uuid not null references public.run_map_polls (id) on delete cascade,
  map_id uuid not null references public.maps (id) on delete restrict,
  position smallint not null,
  primary key (poll_id, map_id),
  constraint run_map_poll_options_poll_id_position_key unique (poll_id, position),
  constraint run_map_poll_options_position_chk check (position >= 1 and position <= 8)
);

create table public.run_map_poll_votes (
  poll_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  map_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  constraint run_map_poll_votes_option_fkey
    foreign key (poll_id, map_id) references public.run_map_poll_options (poll_id, map_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Grants: SELECT authenticated only. Writes via DEFINER RPCs.
-- ---------------------------------------------------------------------------

revoke all on table public.run_map_polls from public, anon, authenticated;
revoke all on table public.run_map_poll_options from public, anon, authenticated;
revoke all on table public.run_map_poll_votes from public, anon, authenticated;

grant select on table public.run_map_polls to authenticated;
grant select on table public.run_map_poll_options to authenticated;
grant select on table public.run_map_poll_votes to authenticated;

alter table public.run_map_polls enable row level security;
alter table public.run_map_poll_options enable row level security;
alter table public.run_map_poll_votes enable row level security;

-- ---------------------------------------------------------------------------
-- SELECT: comment-read parent (confirmed / organizer / admin). No run_is_public.
-- Votes: own row while open; all rows only after closed_at.
-- ---------------------------------------------------------------------------

create policy "run_map_polls_select_confirmed"
  on public.run_map_polls
  for select
  to authenticated
  using (public.is_confirmed_participant(run_id));

create policy "run_map_polls_select_organizer"
  on public.run_map_polls
  for select
  to authenticated
  using (public.is_run_organizer(run_id));

create policy "run_map_polls_select_admin"
  on public.run_map_polls
  for select
  to authenticated
  using (public.is_admin());

create policy "run_map_poll_options_select_authenticated"
  on public.run_map_poll_options
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.run_map_polls p
      where p.id = poll_id
        and (
          public.is_confirmed_participant(p.run_id)
          or public.is_run_organizer(p.run_id)
          or public.is_admin()
        )
    )
  );

create policy "run_map_poll_votes_select_own"
  on public.run_map_poll_votes
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.run_map_polls p
      where p.id = poll_id
        and (
          public.is_confirmed_participant(p.run_id)
          or public.is_run_organizer(p.run_id)
          or public.is_admin()
        )
    )
  );

create policy "run_map_poll_votes_select_closed"
  on public.run_map_poll_votes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.run_map_polls p
      where p.id = poll_id
        and p.closed_at is not null
        and (
          public.is_confirmed_participant(p.run_id)
          or public.is_run_organizer(p.run_id)
          or public.is_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- create_map_poll: organizer + roster-open; 2–8 distinct catalog maps.
-- ---------------------------------------------------------------------------

create function public.create_map_poll(p_run_id uuid, p_map_ids uuid[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.runs;
  v_poll_id uuid;
  v_distinct integer;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select * into v_run
  from public.runs
  where id = p_run_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_uid is distinct from v_run.organizer_id then
    return 'not_found';
  end if;

  if not public.is_not_banned() then
    return 'banned';
  end if;

  if not public.is_run_roster_open_row(v_run.archived_at, v_run.extended_until, v_run.completed_at) then
    return 'not_open';
  end if;

  if exists (
    select 1
    from public.run_map_polls p
    where p.run_id = p_run_id
  ) then
    return 'poll_exists';
  end if;

  if p_map_ids is null
     or cardinality(p_map_ids) < 2
     or cardinality(p_map_ids) > 8
     or exists (select 1 from unnest(p_map_ids) as x(id) where x.id is null)
  then
    return 'invalid_options';
  end if;

  select count(distinct x.id)
    into v_distinct
  from unnest(p_map_ids) as x(id);

  if v_distinct is distinct from cardinality(p_map_ids) then
    return 'invalid_options';
  end if;

  if exists (
    select 1
    from unnest(p_map_ids) as x(id)
    where not exists (select 1 from public.maps m where m.id = x.id)
  ) then
    return 'invalid_options';
  end if;

  insert into public.run_map_polls (run_id)
  values (p_run_id)
  returning id into v_poll_id;

  insert into public.run_map_poll_options (poll_id, map_id, position)
  select v_poll_id, x.map_id, x.ord::smallint
  from unnest(p_map_ids) with ordinality as x(map_id, ord);

  return 'created';
end;
$$;

revoke all on function public.create_map_poll(uuid, uuid[]) from public, anon;
grant execute on function public.create_map_poll(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- vote_map_poll: confirmed + not banned + audience-active; upsert own row.
-- Lock the poll so a vote cannot land after close starts tallying.
-- ---------------------------------------------------------------------------

create function public.vote_map_poll(p_run_id uuid, p_map_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_poll public.run_map_polls;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  if not public.is_not_banned() then
    return 'banned';
  end if;

  if not exists (select 1 from public.runs r where r.id = p_run_id) then
    return 'not_found';
  end if;

  if not public.is_confirmed_participant(p_run_id) then
    return 'not_found';
  end if;

  if not public.is_run_in_active_window(p_run_id) then
    return 'not_found';
  end if;

  select * into v_poll
  from public.run_map_polls
  where run_id = p_run_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_poll.closed_at is not null then
    return 'poll_closed';
  end if;

  if not exists (
    select 1
    from public.run_map_poll_options o
    where o.poll_id = v_poll.id
      and o.map_id = p_map_id
  ) then
    return 'invalid_option';
  end if;

  insert into public.run_map_poll_votes (poll_id, user_id, map_id)
  values (v_poll.id, v_uid, p_map_id)
  on conflict (poll_id, user_id) do update
    set map_id = excluded.map_id,
        updated_at = now();

  return 'voted';
end;
$$;

revoke all on function public.vote_map_poll(uuid, uuid) from public, anon;
grant execute on function public.vote_map_poll(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- close_map_poll: organizer only (admin non-owner → not_found). Allowed after
-- Complete. Write runs.map_id BEFORE stamping closed_at so the freeze trigger
-- does not reject the winner. Zero votes → no_votes (no stamp).
-- ---------------------------------------------------------------------------

create function public.close_map_poll(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.runs;
  v_poll public.run_map_polls;
  v_vote_count integer;
  v_winner uuid;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select * into v_run
  from public.runs
  where id = p_run_id
  for update;

  if not found then
    return 'not_found';
  end if;

  -- Organizer only. Admin who is not organizer → not_found (copy extend_run).
  if v_uid is distinct from v_run.organizer_id then
    return 'not_found';
  end if;

  if not public.is_not_banned() then
    return 'banned';
  end if;

  if not public.is_run_active_row(v_run.archived_at, v_run.extended_until) then
    return 'not_active';
  end if;

  if v_run.verified_at is not null then
    return 'already_verified';
  end if;

  select * into v_poll
  from public.run_map_polls
  where run_id = p_run_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_poll.closed_at is not null then
    return 'already_closed';
  end if;

  select count(*)
    into v_vote_count
  from public.run_map_poll_votes
  where poll_id = v_poll.id;

  if v_vote_count = 0 then
    return 'no_votes';
  end if;

  -- Winner = max count; tie → lowest option position (organizer add-order).
  select o.map_id
    into v_winner
  from public.run_map_poll_options o
  join (
    select v.map_id, count(*) as votes
    from public.run_map_poll_votes v
    where v.poll_id = v_poll.id
    group by v.map_id
  ) t on t.map_id = o.map_id
  where o.poll_id = v_poll.id
  order by t.votes desc, o.position asc
  limit 1;

  -- Lock write while closed_at is still null so enforce_run_update_invariants
  -- does not raise map_id_locked.
  update public.runs
  set map_id = v_winner,
      map_category = null
  where id = p_run_id;

  update public.run_map_polls
  set closed_at = now(),
      winner_map_id = v_winner
  where id = v_poll.id
    and closed_at is null;

  return 'closed';
end;
$$;

revoke all on function public.close_map_poll(uuid) from public, anon;
grant execute on function public.close_map_poll(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Freeze trigger: copy live body from 20260901140012; reject map_id /
-- map_category patches after a closed poll.
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

  if (
       new.map_id is distinct from old.map_id
    or new.map_category is distinct from old.map_category
  )
    and exists (
      select 1
      from public.run_map_polls p
      where p.run_id = new.id
        and p.closed_at is not null
    )
  then
    raise exception 'map_id_locked' using errcode = 'P0001';
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
-- set_run_visibility_and_invites: CREATE OR REPLACE the live 13-arg body
-- (20260904130749). Skip map_id / map_category when a closed poll exists;
-- still apply p_map_ids. Do not add args.
-- ---------------------------------------------------------------------------

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
  v_map_locked boolean;
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

  select exists (
    select 1
    from public.run_map_polls p
    where p.run_id = p_run_id
      and p.closed_at is not null
  ) into v_map_locked;

  update public.runs
  set
    visibility = p_visibility,
    title = p_title,
    map_id = case when v_map_locked then map_id else p_map_id end,
    map_category = case when v_map_locked then map_category else p_map_category end,
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

  -- S-27: NULL = skip (13-arg omit-to-keep). '{}' or a list replaces.
  -- Do not coalesce(p_map_ids, '{}') — NULL must not wipe the junction.
  -- Closed poll skips map_id / map_category above; playlist still replaces.
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
