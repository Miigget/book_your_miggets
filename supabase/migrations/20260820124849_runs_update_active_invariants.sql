-- S-13 / edit-run: organizer UPDATE of active runs only, plus join-mode and capacity backstops.
-- RLS previously allowed the creating organizer to PATCH any of their rows (including past-grace
-- / archived) and every column. Column grants close archived_at / organizer_id writes from
-- authenticated. The BEFORE UPDATE trigger stamps updated_at and rejects illegal join_mode /
-- capacity changes even if the app is bypassed. Do not call is_run_in_active_window() from a
-- policy on public.runs — that helper SELECTs runs and would recurse.

-- ---------------------------------------------------------------------------
-- RLS UPDATE (own): require the active window on both OLD (USING) and NEW (WITH CHECK)
-- ---------------------------------------------------------------------------

drop policy if exists "runs_update_own" on public.runs;

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
  );

-- ---------------------------------------------------------------------------
-- Column-level UPDATE: authenticated may only patch editable run fields
-- INSERT / DELETE / SELECT grants are unchanged. Trigger may still assign NEW.updated_at.
-- ---------------------------------------------------------------------------

revoke update on table public.runs from authenticated;
grant update (
  title,
  map_id,
  starts_at,
  max_participants,
  min_points,
  join_mode
) on table public.runs to authenticated;

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE: stamp updated_at; lock join_mode after any non-organizer seat;
-- reject capacity drops below the confirmed roster (organizer auto-seat counts)
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

  if new.join_mode is distinct from old.join_mode
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

revoke all on function public.enforce_run_update_invariants() from public;

create trigger runs_enforce_update_invariants
  before update on public.runs
  for each row execute function public.enforce_run_update_invariants();
