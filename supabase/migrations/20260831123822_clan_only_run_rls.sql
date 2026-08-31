-- S-21 / clan-runs Phase 1: live clan audience + owner WITH CHECK + dashboard 42P17.
-- is_same_clan DEFINER-reads clan_members only — never runs. Do not call it from
-- clan_members policies. Do not call can_view_run from policies on runs.
-- run_participants_select_organizer must not INVOKER-SELECT runs (42P17 cycle).

-- ---------------------------------------------------------------------------
-- Live clan-membership helper (friends-only analog, minus a is distinct from b)
-- ---------------------------------------------------------------------------

create or replace function public.is_same_clan(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    a is not null
    and b is not null
    and exists (
      select 1
      from public.clan_members ca
      join public.clan_members cb on cb.clan_id = ca.clan_id
      where ca.user_id = a
        and cb.user_id = b
    );
$$;

revoke all on function public.is_same_clan(uuid, uuid) from public, anon;
grant execute on function public.is_same_clan(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- can_view_run: clan_only branch after the guest (uid is null) guard
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

  -- Guests: only public + window. Do not call are_friends / is_same_clan.
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

-- ---------------------------------------------------------------------------
-- runs SELECT: clan_only + is_same_clan on the authenticated active window
-- ---------------------------------------------------------------------------

drop policy if exists "runs_select_active_authenticated" on public.runs;

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
      or (
        visibility = 'clan_only'::public.run_visibility
        and public.is_same_clan(organizer_id, (select auth.uid()))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- runs INSERT/UPDATE: clan_only additionally requires clans.owner_id = organizer
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
    and (
      visibility <> 'clan_only'::public.run_visibility
      or exists (
        select 1
        from public.clans c
        where c.owner_id = organizer_id
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
-- Dashboard organizer head-count: DEFINER helper instead of INVOKER SELECT runs
-- ---------------------------------------------------------------------------

drop policy if exists "run_participants_select_organizer" on public.run_participants;

create policy "run_participants_select_organizer"
  on public.run_participants
  for select
  to authenticated
  using (public.is_run_organizer(run_id));
