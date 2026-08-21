-- Confirmed members can leave a run (not only the organizer).
-- Denied rows stay non-deletable so UNIQUE (run_id, user_id) cannot be reused to re-apply after a kick.

drop policy if exists "run_participants_delete_own_confirmed_as_organizer" on public.run_participants;

create policy "run_participants_delete_own_confirmed"
  on public.run_participants
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status = 'confirmed'::public.participant_status
    and public.is_not_banned()
  );
