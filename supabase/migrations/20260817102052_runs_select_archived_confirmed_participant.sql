-- Grant authenticated confirmed participants SELECT on archived runs (FR-015 / S-07).
-- Does not replace organizer/admin SELECT or the S-04 active-window policies.
-- Archived predicate matches S-04: stamped archived_at OR past the 1-hour grace.

create policy "runs_select_archived_confirmed_participant"
  on public.runs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.run_participants p
      where p.run_id = runs.id
        and p.user_id = (select auth.uid())
        and p.status = 'confirmed'::public.participant_status
    )
    and (
      archived_at is not null
      or starts_at <= (now() - interval '1 hour')
    )
  );
