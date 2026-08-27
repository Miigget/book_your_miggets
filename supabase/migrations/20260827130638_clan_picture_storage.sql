-- S-18 / create-clan-directory Phase 1: optional clans.picture_path + public clan-pictures bucket.
-- Picture is INSERT-only (path stored on the clan row). Do not GRANT UPDATE on public.clans.

-- ---------------------------------------------------------------------------
-- clans.picture_path (nullable object key, not a URL)
-- ---------------------------------------------------------------------------

alter table public.clans
  add column picture_path text null,
  add constraint clans_picture_path_chk check (
    picture_path is null
    or picture_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  );

-- ---------------------------------------------------------------------------
-- Public Storage bucket (1 MiB; jpeg/png/webp). S-20 must not reuse this bucket.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clan-pictures',
  'clan-pictures',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);

-- ---------------------------------------------------------------------------
-- storage.objects RLS (clan-pictures only). No UPDATE — no upsert on this bucket.
-- ---------------------------------------------------------------------------

create policy "clan_pictures_select_anon"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'clan-pictures');

create policy "clan_pictures_select_authenticated"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'clan-pictures');

create policy "clan_pictures_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'clan-pictures'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "clan_pictures_delete_own_folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'clan-pictures'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
