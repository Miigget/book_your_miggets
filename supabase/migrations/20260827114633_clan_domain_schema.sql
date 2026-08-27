-- F-02 / clan-domain-schema: clans + clan_members, owner seated on insert, guest SELECT, frozen points.
-- No picture, officers, create_clan RPC, or joins to runs / run_participants / run_invites.

-- ---------------------------------------------------------------------------
-- clans
-- ---------------------------------------------------------------------------

create table public.clans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  tag text not null,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clans_name_nonempty_chk
    check (char_length(btrim(name)) > 0),
  constraint clans_name_max_length_chk
    check (char_length(name) <= 100),
  constraint clans_tag_nonempty_chk
    check (char_length(btrim(tag)) > 0),
  constraint clans_tag_max_length_chk
    check (char_length(tag) <= 16),
  constraint clans_points_nonnegative_chk
    check (points >= 0)
);

create unique index clans_tag_lower_btrim_uidx
  on public.clans (lower(btrim(tag)));

create index clans_owner_id_idx on public.clans (owner_id);

-- ---------------------------------------------------------------------------
-- clan_members (user_id PK: at most one clan per player)
-- ---------------------------------------------------------------------------

create table public.clan_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index clan_members_clan_id_idx on public.clan_members (clan_id);

-- ---------------------------------------------------------------------------
-- Owner seat: AFTER INSERT ON clans → membership row.
-- No ON CONFLICT: membership PK must abort a second clan for the same player.
-- ---------------------------------------------------------------------------

create or replace function public.seat_owner_on_clan_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.clan_members (user_id, clan_id)
  values (new.owner_id, new.id);
  return new;
end;
$$;

revoke all on function public.seat_owner_on_clan_insert() from public;

create trigger clans_seat_owner_after_insert
  after insert on public.clans
  for each row execute function public.seat_owner_on_clan_insert();

-- ---------------------------------------------------------------------------
-- Grants (revoke-then-grant; no client INSERT/UPDATE on clan_members; no UPDATE on clans)
-- ---------------------------------------------------------------------------

revoke all on table public.clans from public, anon;
grant select on table public.clans to anon, authenticated;
grant insert, delete on table public.clans to authenticated;

revoke all on table public.clan_members from public, anon;
grant select on table public.clan_members to anon, authenticated;
grant delete on table public.clan_members to authenticated;

alter table public.clans enable row level security;
alter table public.clan_members enable row level security;

-- ---------------------------------------------------------------------------
-- RLS: guest-readable; verified owner INSERT; admin DELETE (child policy for CASCADE)
-- ---------------------------------------------------------------------------

create policy "clans_select_anon"
  on public.clans
  for select
  to anon
  using (true);

create policy "clans_select_authenticated"
  on public.clans
  for select
  to authenticated
  using (true);

create policy "clans_insert_verified_owner"
  on public.clans
  for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and public.is_not_banned()
    and exists (
      select 1
      from public.public_profiles p
      where p.id = owner_id
        and p.is_verified
    )
    and points = 0
  );

create policy "clans_delete_admin"
  on public.clans
  for delete
  to authenticated
  using (public.is_admin());

create policy "clan_members_select_anon"
  on public.clan_members
  for select
  to anon
  using (true);

create policy "clan_members_select_authenticated"
  on public.clan_members
  for select
  to authenticated
  using (true);

create policy "clan_members_delete_admin"
  on public.clan_members
  for delete
  to authenticated
  using (public.is_admin());
