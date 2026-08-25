-- Public player profiles: list a player's public organized + confirmed runs
-- (including archived) without widening can_view_run / archived roster dumps.
-- Restricted runs stay on existing runs SELECT policies. Do not call this from
-- policies on public.runs.

create or replace function public.list_player_public_runs(p_user_id uuid)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  archived_at timestamptz,
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
  where r.visibility = 'public'::public.run_visibility
    and (
      r.organizer_id = p_user_id
      or exists (
        select 1
        from public.run_participants p
        where p.run_id = r.id
          and p.user_id = p_user_id
          and p.status = 'confirmed'::public.participant_status
      )
    );
$$;

revoke all on function public.list_player_public_runs(uuid) from public;
grant execute on function public.list_player_public_runs(uuid) to anon, authenticated;
