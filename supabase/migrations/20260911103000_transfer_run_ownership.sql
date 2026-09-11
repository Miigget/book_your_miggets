-- S-29 / transfer-run-ownership: organizer passes ownership of an audience-active
-- public / friends_only / invite_only run to another confirmed participant.
-- Do not GRANT UPDATE on organizer_id. Do not use is_run_roster_open_row
-- (Complete must not freeze transfer). Clan-only is refused this slice.

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

  if not public.is_run_active_row(v_run.archived_at, v_run.extended_until) then
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
    and public.is_run_active_row(r.archived_at, r.extended_until);

  if v_target_active >= 5 then
    return 'active_run_cap';
  end if;

  update public.runs
  set organizer_id = p_new_organizer_id
  where id = p_run_id;

  return 'transferred';
end;
$$;

revoke all on function public.transfer_run_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_run_ownership(uuid, uuid) to authenticated;
