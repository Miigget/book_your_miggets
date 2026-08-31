-- S-20 / comment-screenshots Phase 1: optional run_comments.screenshot_path + private
-- comment-screenshots bucket. Attach only at INSERT. Do not GRANT UPDATE on public.run_comments.
-- Do not reuse clan-pictures (that bucket is public).

-- ---------------------------------------------------------------------------
-- run_comments.screenshot_path (nullable object key, not a URL)
-- Path: {author_id}/{run_id}/{comment_id}.{jpg|jpeg|png|webp}
-- ---------------------------------------------------------------------------

alter table public.run_comments
  add column screenshot_path text null,
  add constraint run_comments_screenshot_path_chk check (
    screenshot_path is null
    or screenshot_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  ),
  add constraint run_comments_screenshot_path_author_chk check (
    screenshot_path is null
    or split_part(screenshot_path, '/', 1) = author_id::text
  ),
  add constraint run_comments_screenshot_path_run_chk check (
    screenshot_path is null
    or split_part(screenshot_path, '/', 2) = run_id::text
  );

alter table public.run_comments
  drop constraint run_comments_body_nonempty_chk,
  add constraint run_comments_body_or_screenshot_chk check (
    char_length(btrim(body)) > 0 or screenshot_path is not null
  );

-- ---------------------------------------------------------------------------
-- Parse run_id from object name foldername[2]. Fail closed on junk (null, not a 500).
-- ---------------------------------------------------------------------------

create or replace function public.comment_screenshot_object_run_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
    else null
  end;
$$;

revoke all on function public.comment_screenshot_object_run_id(text) from public;
grant execute on function public.comment_screenshot_object_run_id(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Private Storage bucket (5 MiB; jpeg/png/webp). No anon SELECT.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comment-screenshots',
  'comment-screenshots',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);

-- ---------------------------------------------------------------------------
-- storage.objects RLS (comment-screenshots only). No UPDATE — no upsert on this bucket.
-- SELECT mirrors comment readers (confirmed / organizer / admin). No anon policy.
-- INSERT: own folder + confirmed + not banned + active window.
-- DELETE: own folder + active window, or unrestricted is_admin().
-- Call is_confirmed_participant / is_run_organizer / is_admin — do not inline run_participants.
-- ---------------------------------------------------------------------------

create policy "comment_screenshots_select_authenticated"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comment-screenshots'
    and (
      public.is_admin()
      or public.is_confirmed_participant(public.comment_screenshot_object_run_id(name))
      or public.is_run_organizer(public.comment_screenshot_object_run_id(name))
    )
  );

create policy "comment_screenshots_insert_confirmed"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comment-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.is_confirmed_participant(public.comment_screenshot_object_run_id(name))
    and public.is_not_banned()
    and public.is_run_in_active_window(public.comment_screenshot_object_run_id(name))
  );

create policy "comment_screenshots_delete_own_active_or_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'comment-screenshots'
    and (
      (
        (storage.foldername(name))[1] = (select auth.uid()::text)
        and public.is_run_in_active_window(public.comment_screenshot_object_run_id(name))
      )
      or public.is_admin()
    )
  );
