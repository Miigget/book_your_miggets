-- S-27 / multi-map-runs follow-up: sibling child-table writes (run_invites,
-- run_comments, runs_update_own) require is_not_banned(). Phase 1 INSERT/DELETE
-- on run_maps used organizer + roster-open only. Add the helper so a banned
-- organizer cannot PostgREST replace-all. Do not change SELECT or grants.
-- Do not GRANT UPDATE on lifecycle stamps or clans.points.

drop policy if exists "run_maps_insert_organizer_open" on public.run_maps;
drop policy if exists "run_maps_delete_organizer_open" on public.run_maps;

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
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)
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
        and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at)
    )
  );
