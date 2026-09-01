-- Parallel-slice integration: S-24 rewrote audience-active RLS from S-15 without
-- clan_only (that axis lived on unshipped S-21). After both land, retarget the
-- S-21 clan_only branches onto is_run_active_row. Do not restore interval '1 hour'.
-- is_same_clan and runs_insert_own (clan owner WITH CHECK) already exist from
-- 20260831123822 and are not dropped by S-24. Do not call can_view_run from
-- policies on runs.

-- ---------------------------------------------------------------------------
-- can_view_run: S-24 privilege + is_run_active_row, then S-21 clan_only
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

-- ---------------------------------------------------------------------------
-- runs SELECT: clan_only + is_same_clan on the authenticated audience-active policy
-- ---------------------------------------------------------------------------

drop policy if exists "runs_select_active_authenticated" on public.runs;

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
      or (
        visibility = 'clan_only'::public.run_visibility
        and public.is_same_clan(organizer_id, (select auth.uid()))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- runs UPDATE: S-24 audience-active + S-21 clan_only owner WITH CHECK
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
    and (
      visibility <> 'clan_only'::public.run_visibility
      or exists (
        select 1
        from public.clans c
        where c.owner_id = organizer_id
      )
    )
  );
