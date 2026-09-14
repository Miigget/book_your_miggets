-- Public clan profile Incoming/Recent + /clans/{id}/history.
-- DEFINER list of clan_only runs whose organizer is a current member of p_clan_id.
-- Do not widen can_view_run or archived /runs/{id}. run_is_clan_only is used ONLY
-- in run_maps SELECT so guests can batch-read maps for showcase cards.

create function public.run_is_clan_only(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.runs r
    where r.id = p_run_id and r.visibility = 'clan_only'::public.run_visibility
  );
$$;

revoke all on function public.run_is_clan_only(uuid) from public;
grant execute on function public.run_is_clan_only(uuid) to anon, authenticated;

drop policy if exists "run_maps_select_anon" on public.run_maps;
drop policy if exists "run_maps_select_authenticated" on public.run_maps;

create policy "run_maps_select_anon"
  on public.run_maps
  for select
  to anon
  using (
    exists (select 1 from public.runs r where r.id = run_id)
    or public.run_is_public(run_id)
    or public.run_is_clan_only(run_id)
  );

create policy "run_maps_select_authenticated"
  on public.run_maps
  for select
  to authenticated
  using (
    exists (select 1 from public.runs r where r.id = run_id)
    or public.run_is_public(run_id)
    or public.run_is_clan_only(run_id)
  );

create function public.list_clan_runs(p_clan_id uuid)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  archived_at timestamptz,
  extended_until timestamptz,
  completed_at timestamptz,
  max_participants integer,
  min_points integer,
  join_mode public.join_mode,
  visibility public.run_visibility,
  created_at timestamptz,
  organizer_id uuid,
  map_category text,
  confirmed_count integer,
  organizer_nickname text,
  map_id uuid,
  map_name text,
  map_difficulty text,
  map_stars text,
  map_points integer,
  map_length text,
  map_creator text,
  map_released_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.title,
    r.starts_at,
    r.archived_at,
    r.extended_until,
    r.completed_at,
    r.max_participants,
    r.min_points,
    r.join_mode,
    r.visibility,
    r.created_at,
    r.organizer_id,
    r.map_category,
    (
      select count(*)::integer
      from public.run_participants p
      where p.run_id = r.id
        and p.status = 'confirmed'::public.participant_status
    ) as confirmed_count,
    pr.nickname,
    m.id,
    m.name,
    m.difficulty,
    m.stars,
    m.points,
    m.length,
    m.creator,
    m.released_on
  from public.runs r
  left join public.profiles pr on pr.id = r.organizer_id
  left join public.maps m on m.id = r.map_id
  where r.visibility = 'clan_only'::public.run_visibility
    and exists (
      select 1
      from public.clan_members cm
      where cm.clan_id = p_clan_id
        and cm.user_id = r.organizer_id
    );
$$;

revoke all on function public.list_clan_runs(uuid) from public;
grant execute on function public.list_clan_runs(uuid) to anon, authenticated;
