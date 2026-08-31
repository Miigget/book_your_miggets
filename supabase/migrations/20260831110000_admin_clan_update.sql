-- Admin can UPDATE clan name/tag/picture_path from the app.
-- Points and owner_id stay frozen (S-23 owns points). Storage insert/delete for admins.

-- ---------------------------------------------------------------------------
-- Column-level UPDATE (no points / owner_id / created_at)
-- ---------------------------------------------------------------------------

grant update (name, tag, picture_path, updated_at) on table public.clans to authenticated;

create policy "clans_update_admin"
  on public.clans
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.clans_freeze_points_and_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.points := old.points;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.clans_freeze_points_and_owner() from public;

create trigger clans_freeze_points_and_owner
  before update on public.clans
  for each row execute function public.clans_freeze_points_and_owner();

-- ---------------------------------------------------------------------------
-- Admins may write clan-pictures under the owner's folder (path CHECK still applies)
-- ---------------------------------------------------------------------------

create policy "clan_pictures_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'clan-pictures'
    and public.is_admin()
  );

create policy "clan_pictures_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'clan-pictures'
    and public.is_admin()
  );
