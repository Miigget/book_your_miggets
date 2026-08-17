-- S-07 follow-up: the archived-run SELECT policy queried run_participants under RLS,
-- while run_participants_select_organizer already queried runs — Postgres 42P17
-- "infinite recursion detected in policy for relation run_participants".
-- Same pattern as is_admin(): SECURITY DEFINER helper bypasses RLS on the inner read.
-- https://supabase.com/docs/guides/database/postgres/row-level-security#use-security-definer-functions

create or replace function public.is_confirmed_participant(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.run_participants p
    where p.run_id = p_run_id
      and p.user_id = (select auth.uid())
      and p.status = 'confirmed'::public.participant_status
  );
$$;

revoke all on function public.is_confirmed_participant(uuid) from public;
grant execute on function public.is_confirmed_participant(uuid) to authenticated;

drop policy if exists "runs_select_archived_confirmed_participant" on public.runs;

create policy "runs_select_archived_confirmed_participant"
  on public.runs
  for select
  to authenticated
  using (
    public.is_confirmed_participant(id)
    and (
      archived_at is not null
      or starts_at <= (now() - interval '1 hour')
    )
  );
