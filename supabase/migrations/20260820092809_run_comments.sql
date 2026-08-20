-- S-12 / run-comments: flat comments + likes, confirmed/admin/organizer read, confirmed writes.

-- ---------------------------------------------------------------------------
-- Helpers (same SECURITY DEFINER shape as is_confirmed_participant)
-- ---------------------------------------------------------------------------

create or replace function public.is_run_organizer(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.runs r
    where r.id = p_run_id
      and r.organizer_id = (select auth.uid())
  );
$$;

create or replace function public.is_run_in_active_window(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.runs r
    where r.id = p_run_id
      and r.archived_at is null
      and r.starts_at > (now() - interval '1 hour')
  );
$$;

revoke all on function public.is_run_organizer(uuid) from public;
revoke all on function public.is_run_in_active_window(uuid) from public;
grant execute on function public.is_run_organizer(uuid) to authenticated;
grant execute on function public.is_run_in_active_window(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.run_comments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint run_comments_id_run_id_key unique (id, run_id),
  constraint run_comments_body_nonempty_chk check (char_length(btrim(body)) > 0),
  constraint run_comments_body_max_length_chk check (char_length(btrim(body)) <= 1000)
);

create index run_comments_run_id_created_at_idx on public.run_comments (run_id, created_at);
create index run_comments_author_id_idx on public.run_comments (author_id);

create table public.run_comment_likes (
  comment_id uuid not null,
  run_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id),
  constraint run_comment_likes_comment_run_fkey
    foreign key (comment_id, run_id) references public.run_comments (id, run_id) on delete cascade
);

create index run_comment_likes_run_id_idx on public.run_comment_likes (run_id);
create index run_comment_likes_user_id_idx on public.run_comment_likes (user_id);

-- ---------------------------------------------------------------------------
-- Grants: authenticated only (no anon). Append-only: no UPDATE.
-- ---------------------------------------------------------------------------

revoke all on table public.run_comments from public, anon;
revoke all on table public.run_comment_likes from public, anon;
grant select, insert, delete on table public.run_comments to authenticated;
grant select, insert, delete on table public.run_comment_likes to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: run_comments
-- ---------------------------------------------------------------------------

alter table public.run_comments enable row level security;

create policy "run_comments_select_confirmed"
  on public.run_comments
  for select
  to authenticated
  using (public.is_confirmed_participant(run_id));

create policy "run_comments_select_admin"
  on public.run_comments
  for select
  to authenticated
  using (public.is_admin());

create policy "run_comments_select_organizer"
  on public.run_comments
  for select
  to authenticated
  using (public.is_run_organizer(run_id));

create policy "run_comments_insert_own"
  on public.run_comments
  for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.is_confirmed_participant(run_id)
    and public.is_not_banned()
    and public.is_run_in_active_window(run_id)
  );

create policy "run_comments_delete_admin"
  on public.run_comments
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS: run_comment_likes
-- ---------------------------------------------------------------------------

alter table public.run_comment_likes enable row level security;

create policy "run_comment_likes_select_confirmed"
  on public.run_comment_likes
  for select
  to authenticated
  using (public.is_confirmed_participant(run_id));

create policy "run_comment_likes_select_admin"
  on public.run_comment_likes
  for select
  to authenticated
  using (public.is_admin());

create policy "run_comment_likes_select_organizer"
  on public.run_comment_likes
  for select
  to authenticated
  using (public.is_run_organizer(run_id));

create policy "run_comment_likes_insert_own"
  on public.run_comment_likes
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.is_confirmed_participant(run_id)
    and public.is_not_banned()
    and public.is_run_in_active_window(run_id)
  );

create policy "run_comment_likes_delete_own"
  on public.run_comment_likes
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and public.is_confirmed_participant(run_id)
    and public.is_not_banned()
    and public.is_run_in_active_window(run_id)
  );
