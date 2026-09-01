-- S-22 / complete-clan-run: one-shot completed_at for in-progress clan_only runs.
-- Do not fold completed_at into is_run_active_row or is_run_in_active_window
-- (audience-active, 5-cap, and comment writes stay open until Archive).
-- Do not GRANT UPDATE on completed_at. Do not UPDATE clans. Do not call archive_run.

-- ---------------------------------------------------------------------------
-- Column (nullable, no default, no backfill)
-- ---------------------------------------------------------------------------

alter table public.runs
  add column completed_at timestamptz;

comment on column public.runs.completed_at is
  'Clan-run complete stamp for later admin verify (S-23). Not archive. Not points.';

-- ---------------------------------------------------------------------------
-- Roster-open helper: audience-active AND not completed. Column args only.
-- ---------------------------------------------------------------------------

create or replace function public.is_run_roster_open_row(
  p_archived_at timestamptz,
  p_extended_until timestamptz,
  p_completed_at timestamptz
)
returns boolean
language sql
stable
as $$
  select public.is_run_active_row(p_archived_at, p_extended_until)
    and p_completed_at is null;
$$;

revoke all on function public.is_run_roster_open_row(timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.is_run_roster_open_row(timestamptz, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- runs UPDATE: freeze edit after complete (keep organizer / banned / verified / clan owner)
-- ---------------------------------------------------------------------------

drop policy if exists "runs_update_own" on public.runs;

create policy "runs_update_own"
  on public.runs
  for update
  to authenticated
  using (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
    and public.is_run_roster_open_row(archived_at, extended_until, completed_at)
  )
  with check (
    (select auth.uid()) = organizer_id
    and public.is_not_banned()
    and public.is_run_roster_open_row(archived_at, extended_until, completed_at)
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

-- ---------------------------------------------------------------------------
-- auto_join_run: completed looks like not_active (same miss as inactive)
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
-- extend_run: refuse completed runs before stamping extended_until
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Participant roster freeze after complete (kick is organizer UPDATE)
-- ---------------------------------------------------------------------------

drop policy if exists "run_participants_insert_self_pending" on public.run_participants;
drop policy if exists "run_participants_update_organizer" on public.run_participants;
drop policy if exists "run_participants_delete_own_pending" on public.run_participants;
drop policy if exists "run_participants_delete_own_confirmed" on public.run_participants;

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
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)
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
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)
    )
  )
  with check (
    public.is_not_banned()
    and exists (
      select 1
      from public.runs r
      where r.id = run_id
        and r.organizer_id = (select auth.uid())
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)
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
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)
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
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)
    )
  );

-- ---------------------------------------------------------------------------
-- complete_clan_run: DEFINER stamp; organizer + current clan owner + clan_only
-- ---------------------------------------------------------------------------

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

  if not public.is_run_active_row(v_run.archived_at, v_run.extended_until) then
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

revoke all on function public.complete_clan_run(uuid) from public, anon;
grant execute on function public.complete_clan_run(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Column grants: keep completed_at / archived_at / extended_until / organizer_id closed
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
