-- Align default guest/authenticated SELECT with FR-013 active window:
-- archived_at is null AND starts_at still inside the 1-hour grace-or-upcoming window.
-- Organizer and admin SELECT policies are unchanged (they may still see past-grace rows).

drop policy if exists "runs_select_active_anon" on public.runs;
drop policy if exists "runs_select_active_authenticated" on public.runs;

create policy "runs_select_active_anon"
  on public.runs
  for select
  to anon
  using (
    archived_at is null
    and starts_at > (now() - interval '1 hour')
  );

create policy "runs_select_active_authenticated"
  on public.runs
  for select
  to authenticated
  using (
    archived_at is null
    and starts_at > (now() - interval '1 hour')
  );
