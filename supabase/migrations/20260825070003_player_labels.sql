-- S-17 / player-labels: admin dictionary + assignments shown on public profiles.

-- ---------------------------------------------------------------------------
-- Dictionary
-- ---------------------------------------------------------------------------

create table public.player_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_labels_name_nonempty_chk
    check (char_length(btrim(name)) > 0),
  constraint player_labels_color_hex_chk
    check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index player_labels_name_lower_uidx
  on public.player_labels (lower(name));

-- ---------------------------------------------------------------------------
-- Assignments (composite PK; CASCADE prune when label or profile is deleted)
-- ---------------------------------------------------------------------------

create table public.player_label_assignments (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label_id uuid not null references public.player_labels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, label_id)
);

create index player_label_assignments_label_id_idx
  on public.player_label_assignments (label_id);

-- ---------------------------------------------------------------------------
-- Grants (revoke-then-grant; public SELECT, admin writes via RLS)
-- ---------------------------------------------------------------------------

revoke all on table public.player_labels from public, anon;
grant select on table public.player_labels to anon, authenticated;
grant insert, update, delete on table public.player_labels to authenticated;

revoke all on table public.player_label_assignments from public, anon;
grant select on table public.player_label_assignments to anon, authenticated;
grant insert, delete on table public.player_label_assignments to authenticated;

alter table public.player_labels enable row level security;
alter table public.player_label_assignments enable row level security;

-- ---------------------------------------------------------------------------
-- RLS: guest-readable; authenticated admin writes only
-- ---------------------------------------------------------------------------

create policy "player_labels_select_anon"
  on public.player_labels
  for select
  to anon
  using (true);

create policy "player_labels_select_authenticated"
  on public.player_labels
  for select
  to authenticated
  using (true);

create policy "player_labels_insert_admin"
  on public.player_labels
  for insert
  to authenticated
  with check (public.is_admin());

create policy "player_labels_update_admin"
  on public.player_labels
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "player_labels_delete_admin"
  on public.player_labels
  for delete
  to authenticated
  using (public.is_admin());

create policy "player_label_assignments_select_anon"
  on public.player_label_assignments
  for select
  to anon
  using (true);

create policy "player_label_assignments_select_authenticated"
  on public.player_label_assignments
  for select
  to authenticated
  using (true);

create policy "player_label_assignments_insert_admin"
  on public.player_label_assignments
  for insert
  to authenticated
  with check (public.is_admin());

create policy "player_label_assignments_delete_admin"
  on public.player_label_assignments
  for delete
  to authenticated
  using (public.is_admin());
