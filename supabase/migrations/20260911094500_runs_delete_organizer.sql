-- S-30 / owner-delete-run: organizer hard-delete of an audience-active own run.
-- Leave runs_delete_admin unchanged. No new GRANT. No RPC.
-- USING calls is_run_active_row with column args (not is_run_roster_open_row)
-- so completed clan runs stay deletable. Do not SELECT runs from this policy.

create policy "runs_delete_organizer"
  on public.runs
  for delete
  to authenticated
  using (
    organizer_id = (select auth.uid())
    and public.is_not_banned()
    and public.is_run_active_row(archived_at, extended_until)
  );
