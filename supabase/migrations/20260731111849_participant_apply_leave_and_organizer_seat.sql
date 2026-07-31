-- S-02 / apply-and-approve-participants: DELETE withdraw/leave + organizer auto-seat.

-- ---------------------------------------------------------------------------
-- Grants: unlock DELETE under RLS
-- ---------------------------------------------------------------------------

grant delete on table public.run_participants to authenticated;

-- ---------------------------------------------------------------------------
-- RLS DELETE: own pending (withdraw); own confirmed when organizer (leave team)
-- Denied rows must not be deletable (would reopen Apply via UNIQUE + fresh insert).
-- ---------------------------------------------------------------------------

create policy "run_participants_delete_own_pending"
  on public.run_participants
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status = 'pending'::public.participant_status
    and public.is_not_banned()
  );

create policy "run_participants_delete_own_confirmed_as_organizer"
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
        and r.organizer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Organizer seat: AFTER INSERT ON runs → confirmed participant row
-- ---------------------------------------------------------------------------

create or replace function public.seat_organizer_on_run_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.run_participants (run_id, user_id, status)
  values (new.id, new.organizer_id, 'confirmed'::public.participant_status)
  on conflict (run_id, user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.seat_organizer_on_run_insert() from public;

create trigger runs_seat_organizer_after_insert
  after insert on public.runs
  for each row execute function public.seat_organizer_on_run_insert();

-- ---------------------------------------------------------------------------
-- Backfill: seat organizers on existing runs missing a participant row
-- ---------------------------------------------------------------------------

insert into public.run_participants (run_id, user_id, status)
select r.id, r.organizer_id, 'confirmed'::public.participant_status
from public.runs r
where not exists (
  select 1
  from public.run_participants rp
  where rp.run_id = r.id
    and rp.user_id = r.organizer_id
);
