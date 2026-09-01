-- S-23 / verified-finish-clan-points: one-shot verified_at + DEFINER clan-points award.
-- Do not fold verified_at into is_run_active_row, is_run_in_active_window, or
-- is_run_roster_open_row (audience-active, 5-cap, comments, and roster freeze stay as S-22).
-- Do not GRANT UPDATE on verified_at or clans.points. Do not award from complete_clan_run.
-- Do not call archive_run. Admin actor only (copy archive_run leak family, not Complete).

-- ---------------------------------------------------------------------------
-- Column (nullable, no default, no backfill)
-- ---------------------------------------------------------------------------

alter table public.runs
  add column verified_at timestamptz;

comment on column public.runs.verified_at is
  'Admin verified-finish (S-23); awards clan points; not archive; not Complete.';

-- ---------------------------------------------------------------------------
-- Freeze trigger: GUC bypass for the DEFINER award path only.
-- owner_id / created_at stay frozen. Unset GUC still copies old.points.
-- ---------------------------------------------------------------------------

create or replace function public.clans_freeze_points_and_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  new.updated_at := now();

  if current_setting('app.clan_points_award', true) = '1' then
    if new.points < old.points then
      raise exception 'clan points cannot decrease';
    end if;
  else
    new.points := old.points;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_clan_run_finish: DEFINER stamp then award; EXECUTE authenticated only
-- ---------------------------------------------------------------------------

create or replace function public.verify_clan_run_finish(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_run public.runs;
  v_clan_id uuid;
  v_delta integer;
  v_n integer;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select * into v_run
  from public.runs
  where id = p_run_id;

  if not found then
    return 'not_found';
  end if;

  -- Admin only. Non-admin looks like missing (do not leak restricted runs).
  if not public.is_admin() then
    return 'not_found';
  end if;

  -- Admin path skips banned (copy archive_run).

  if v_run.visibility is distinct from 'clan_only'::public.run_visibility then
    return 'not_clan_only';
  end if;

  if v_run.completed_at is null then
    return 'not_completed';
  end if;

  if v_run.verified_at is not null then
    return 'already_verified';
  end if;

  if v_run.map_id is null then
    return 'no_map';
  end if;

  select m.points into v_delta
  from public.maps m
  where m.id = v_run.map_id;

  if not found then
    return 'no_map';
  end if;

  select c.id into v_clan_id
  from public.clans c
  where c.owner_id = v_run.organizer_id;

  if not found then
    return 'no_clan';
  end if;

  update public.runs
  set verified_at = now()
  where id = p_run_id
    and verified_at is null;

  if not found then
    return 'already_verified';
  end if;

  perform set_config('app.clan_points_award', '1', true);

  update public.clans
  set points = points + v_delta
  where id = v_clan_id;

  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'verify_clan_run_finish: clan award updated % rows, expected 1', v_n;
  end if;

  return 'verified';
end;
$$;

revoke all on function public.verify_clan_run_finish(uuid) from public, anon;
grant execute on function public.verify_clan_run_finish(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Column grants: keep verified_at / completed_at / archived_at / extended_until / organizer_id closed
-- ---------------------------------------------------------------------------

revoke update on table public.runs from authenticated;
grant update (
  title,
  map_id,
  map_category,
  starts_at,
  max_participants,
  min_points,
  join_mode,
  visibility
) on table public.runs to authenticated;
