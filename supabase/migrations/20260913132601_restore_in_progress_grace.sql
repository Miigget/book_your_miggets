-- Restore the default 1-hour in-progress window that S-24 dropped.
-- Audience-active ⇔ archived_at is null AND (unelapsed extend OR starts_at
-- still inside 1 hour). Manual archive and one-shot extend stay. Helper still
-- takes column args only — do not SELECT runs from is_run_active_row.
-- Cutover: stamp unextended rows already past the window so they leave the
-- 5-cap. Drop the 2-arg / 3-arg overloads after every call site is retargeted.

-- ---------------------------------------------------------------------------
-- New signatures (overloads). Old 2-arg / 3-arg stay until call sites move.
-- ---------------------------------------------------------------------------

create or replace function public.is_run_active_row(
  p_archived_at timestamptz,
  p_extended_until timestamptz,
  p_starts_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_archived_at is null
    and case
      when p_extended_until is not null then p_extended_until > now()
      else p_starts_at > (now() - interval '1 hour')
    end;
$$;

revoke all on function public.is_run_active_row(timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.is_run_active_row(timestamptz, timestamptz, timestamptz) to anon, authenticated;

create or replace function public.is_run_roster_open_row(
  p_archived_at timestamptz,
  p_extended_until timestamptz,
  p_completed_at timestamptz,
  p_starts_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_run_active_row(p_archived_at, p_extended_until, p_starts_at)
    and p_completed_at is null;
$$;

revoke all on function public.is_run_roster_open_row(timestamptz, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.is_run_roster_open_row(timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy if exists "runs_select_active_anon" on public.runs;
drop policy if exists "runs_select_active_authenticated" on public.runs;
drop policy if exists "runs_delete_organizer" on public.runs;
drop policy if exists "runs_update_own" on public.runs;
drop policy if exists "run_invites_insert_organizer_active" on public.run_invites;
drop policy if exists "run_invites_delete_organizer_active" on public.run_invites;
drop policy if exists "run_maps_insert_organizer_open" on public.run_maps;
drop policy if exists "run_maps_delete_organizer_open" on public.run_maps;
drop policy if exists "run_participants_insert_self_pending" on public.run_participants;
drop policy if exists "run_participants_update_organizer" on public.run_participants;
drop policy if exists "run_participants_delete_own_pending" on public.run_participants;
drop policy if exists "run_participants_delete_own_confirmed" on public.run_participants;

create policy "runs_select_active_anon"
  on public.runs
  for select
  to anon
  using (
    public.is_run_active_row(archived_at, extended_until, starts_at)
    and visibility = 'public'::public.run_visibility
  );

create policy "runs_select_active_authenticated"
  on public.runs
  for select
  to authenticated
  using (
    public.is_run_active_row(archived_at, extended_until, starts_at)
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
      or (
        visibility = 'clan_only'::public.run_visibility
        and public.is_same_clan(organizer_id, (select auth.uid()))
      )
    )
  );

create policy "runs_delete_organizer"
  on public.runs
  for delete
  to authenticated
  using (
    organizer_id = (select auth.uid())
    and public.is_not_banned()
    and public.is_run_active_row(archived_at, extended_until, starts_at)
  );

create policy "runs_update_own"
  on public.runs
  for update
  to authenticated
  using (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
    and public.is_run_roster_open_row(archived_at, extended_until, completed_at, starts_at)
  )
  with check (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
    and public.is_run_roster_open_row(archived_at, extended_until, completed_at, starts_at)
    and (
      visibility = 'public'::public.run_visibility
      or exists (
        select 1
        from public.public_profiles pp
        where pp.id = organizer_id
          and pp.is_verified
      )
    )
    and (
      visibility <> 'clan_only'::public.run_visibility
      or exists (
        select 1
        from public.clans c
        where c.owner_id = organizer_id
      )
    )
  );

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
        and public.is_run_active_row(r.archived_at, r.extended_until, r.starts_at)
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
        and public.is_run_active_row(r.archived_at, r.extended_until, r.starts_at)
    )
  );

create policy "run_maps_insert_organizer_open"
  on public.run_maps
  for insert
  to authenticated
  with check (
    public.is_not_banned()
    and public.is_run_organizer(run_id)
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at, r.starts_at)
    )
  );

create policy "run_maps_delete_organizer_open"
  on public.run_maps
  for delete
  to authenticated
  using (
    public.is_not_banned()
    and public.is_run_organizer(run_id)
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at, r.starts_at)
    )
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
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at, r.starts_at)
    )
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
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at, r.starts_at)
    )
  )
  with check (
    public.is_not_banned()
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and r.organizer_id = (select auth.uid())
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at, r.starts_at)
    )
  );

create policy "run_participants_delete_own_pending"
  on public.run_participants
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status = 'pending'::public.participant_status
    and public.is_not_banned()
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at, r.starts_at)
    )
  );

create policy "run_participants_delete_own_confirmed"
  on public.run_participants
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status = 'confirmed'::public.participant_status
    and public.is_not_banned()
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at, r.starts_at)
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers + RPCs that called the 2-arg / 3-arg overloads
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
      and public.is_run_active_row(r.archived_at, r.extended_until, r.starts_at)
  )
  and public.can_view_run(p_run_id);
$$;

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
  v_starts_at timestamptz;
  v_in_window boolean;
begin
  select r.visibility, r.organizer_id, r.archived_at, r.extended_until, r.starts_at
    into v_visibility, v_organizer, v_archived_at, v_extended_until, v_starts_at
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

  v_in_window := public.is_run_active_row(v_archived_at, v_extended_until, v_starts_at);
  if not v_in_window then
    return false;
  end if;

  if v_visibility = 'public'::public.run_visibility then
    return true;
  end if;

  -- Guests: only public + audience-active. Do not call are_friends / is_same_clan.
  if v_uid is null then
    return false;
  end if;

  if v_visibility = 'friends_only'::public.run_visibility then
    return public.are_friends(v_organizer, v_uid);
  end if;

  if v_visibility = 'invite_only'::public.run_visibility then
    return public.is_run_invitee(p_run_id);
  end if;

  if v_visibility = 'clan_only'::public.run_visibility then
    return public.is_same_clan(v_organizer, v_uid);
  end if;

  return false;
end;
$$;

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
      and public.is_run_active_row(r.archived_at, r.extended_until, r.starts_at)
  ) >= 5 then
    raise exception 'active_run_cap' using errcode = 'P0001';
  end if;

  return new;
end;
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

  -- Audience miss and completed both return not_active (no new oracle).
  if not found
    or not public.is_run_roster_open_row(v_run.archived_at, v_run.extended_until, v_run.completed_at, v_run.starts_at)
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

create or replace function public.create_map_poll(p_run_id uuid, p_map_ids uuid[])
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

  if not public.is_run_roster_open_row(v_run.archived_at, v_run.extended_until, v_run.completed_at, v_run.starts_at) then
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

create or replace function public.close_map_poll(p_run_id uuid)
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

  if not public.is_run_active_row(v_run.archived_at, v_run.extended_until, v_run.starts_at) then
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

create or replace function public.complete_clan_run(p_run_id uuid)
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

  if v_run.visibility is distinct from 'clan_only'::public.run_visibility then
    return 'not_clan_only';
  end if;

  if not exists (
    select 1
    from public.clans c
    where c.owner_id = v_uid
  ) then
    return 'not_owner';
  end if;

  if not public.is_run_active_row(v_run.archived_at, v_run.extended_until, v_run.starts_at) then
    return 'not_active';
  end if;

  if now() < v_run.starts_at then
    return 'not_in_progress';
  end if;

  if v_run.completed_at is not null then
    return 'already_completed';
  end if;

  update public.runs
  set completed_at = now()
  where id = p_run_id
    and completed_at is null;

  return 'completed';
end;
$$;

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

  if not public.is_run_active_row(v_run.archived_at, v_run.extended_until, v_run.starts_at) then
    return 'not_active';
  end if;

  if now() < v_run.starts_at then
    return 'not_in_progress';
  end if;

  if v_run.completed_at is not null then
    return 'already_completed';
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

create or replace function public.transfer_run_ownership(p_run_id uuid, p_new_organizer_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.runs;
  v_target_active integer;
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

  if not public.is_run_active_row(v_run.archived_at, v_run.extended_until, v_run.starts_at) then
    return 'not_active';
  end if;

  if v_run.visibility = 'clan_only'::public.run_visibility then
    return 'clan_only';
  end if;

  if p_new_organizer_id is not distinct from v_run.organizer_id
    or not exists (
      select 1
      from public.run_participants rp
      where rp.run_id = p_run_id
        and rp.user_id = p_new_organizer_id
        and rp.status = 'confirmed'::public.participant_status
    )
  then
    return 'not_confirmed';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_new_organizer_id
      and p.is_banned
  ) then
    return 'target_banned';
  end if;

  if v_run.visibility <> 'public'::public.run_visibility
    and not exists (
      select 1
      from public.public_profiles pp
      where pp.id = p_new_organizer_id
        and pp.is_verified
    )
  then
    return 'not_verified';
  end if;

  -- Namespace 8724 = S-24 organizer audience-active cap. Lock the recipient.
  perform pg_advisory_xact_lock(8724, hashtext(p_new_organizer_id::text));

  select count(*) into v_target_active
  from public.runs r
  where r.organizer_id = p_new_organizer_id
    and public.is_run_active_row(r.archived_at, r.extended_until, r.starts_at);

  if v_target_active >= 5 then
    return 'active_run_cap';
  end if;

  update public.runs
  set organizer_id = p_new_organizer_id
  where id = p_run_id;

  return 'transferred';
end;
$$;

create or replace function public.create_invite_only_run(
  p_title text,
  p_map_id uuid,
  p_map_category text,
  p_starts_at timestamp with time zone,
  p_max_participants integer,
  p_min_points integer,
  p_join_mode join_mode,
  p_invitee_ids uuid[],
  p_auto_join_min integer default null,
  p_map_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
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
      and public.is_run_active_row(r.archived_at, r.extended_until, r.starts_at)
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

-- ---------------------------------------------------------------------------
-- Drop old overloads (fails if a call site was missed)
-- ---------------------------------------------------------------------------

drop function public.is_run_roster_open_row(timestamptz, timestamptz, timestamptz);
drop function public.is_run_active_row(timestamptz, timestamptz);

-- ---------------------------------------------------------------------------
-- Cutover: stamp unextended rows already past the 1-hour window
-- ---------------------------------------------------------------------------

update public.runs
set archived_at = starts_at + interval '1 hour'
where archived_at is null
  and extended_until is null
  and starts_at <= (now() - interval '1 hour');
