-- S-01 / create-and-list-runs: maps catalog, nickname, optional map_id + title on runs.

-- ---------------------------------------------------------------------------
-- maps catalog
-- ---------------------------------------------------------------------------

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  difficulty text not null,
  stars text not null,
  points integer not null check (points >= 0),
  length text null,
  creator text not null,
  released_on date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maps_name_unique unique (name)
);

create index maps_name_idx on public.maps (name);
create index maps_difficulty_idx on public.maps (difficulty);

alter table public.maps enable row level security;

grant select on table public.maps to anon, authenticated;
-- Writes only via seed / service_role / postgres (no INSERT/UPDATE/DELETE for anon|authenticated).

create policy "maps_select_anon"
  on public.maps
  for select
  to anon
  using (true);

create policy "maps_select_authenticated"
  on public.maps
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- profiles.nickname (unique when set; public display via view only)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column nickname text null;

create unique index profiles_nickname_lower_uidx
  on public.profiles (lower(nickname))
  where nickname is not null;

-- Expose id + nickname without leaking role/ban via REST on profiles.
create view public.public_profiles
with (security_invoker = false)
as
select id, nickname
from public.profiles;

revoke all on table public.public_profiles from public;
grant select on table public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- runs: drop free-text map; add map_id + title
-- ---------------------------------------------------------------------------

alter table public.runs
  add column map_id uuid null references public.maps (id),
  add column title text null;

alter table public.runs
  drop column map;

create index runs_map_id_idx on public.runs (map_id);
