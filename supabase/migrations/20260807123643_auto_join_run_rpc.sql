-- S-05 / auto-join-mode: race-safe instant confirmation RPC.
-- Members cannot INSERT confirmed rows (run_participants_insert_self_pending forces
-- 'pending'), and capacity has no SQL enforcement. This SECURITY DEFINER RPC is the
-- single authority for auto-join confirmation: it locks the runs row (FOR UPDATE) to
-- serialize concurrent applies per run, re-validates every gate, and inserts the
-- confirmed row only while a slot remains. It returns a discriminated text outcome
-- (never raises for domain results) so the app layer maps outcomes onto user-facing
-- ParticipantError messages without leaking raw DB errors.

-- ---------------------------------------------------------------------------
-- auto_join_run(p_run_id): lock run row → validate → count confirmed → insert
-- Outcomes: confirmed | full | already_pending | already_confirmed | denied
--           | no_nickname | not_active | not_auto_join | banned | not_authenticated
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

  -- Mirror the FR-013 active window used by RLS (20260807104348) and
  -- loadActiveRunForMutation: not archived, starts_at within the 1-hour grace.
  if not found
    or v_run.archived_at is not null
    or v_run.starts_at <= (now() - interval '1 hour')
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
