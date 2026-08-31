# Comment screenshots Implementation Plan

## Overview

Ship S-20 / FR-001 / FR-027: a confirmed participant can attach one JPEG/PNG/WebP screenshot on a run comment they post, including screenshot-only proof comments for later S-23 `/teamrank` + finish-line. Who can post or read comments does not change. Bytes live in a **private** Supabase Storage bucket; readers get 1-hour signed URLs. Abuse (NSFW, off-topic) stays accepted; this slice only caps type and size so the Worker and Storage stay healthy.

## Current State Analysis

Run comments already ship (S-12, `supabase/migrations/20260820092809_run_comments.sql`):

- **Write:** confirmed participant + active window + not banned. App gate `canPostOrLike = own?.status === "confirmed" && !isArchived && !isBanned` (`src/pages/runs/[id].astro`). `createComment` requires trimmed nonempty body 1–1000 chars. RLS `run_comments_insert_own` matches. Unseated organizers and admins **cannot** post unless they are also confirmed.
- **Read:** confirmed / archived participant / unseated organizer / admin. Guests and pending/denied applicants never see the Comments section. Restricted runs still 404.
- **Append-only:** `GRANT select, insert, delete` — no UPDATE. Authors cannot edit. Admins hard-delete (`deleteCommentAsAdmin`); likes cascade.
- **Body CHECK:** `run_comments_body_nonempty_chk` (`char_length(btrim(body)) > 0`) plus max 1000.

S-18 already added `src/lib/storage.ts`: MIME jpeg/png/webp, **1 MiB** `PUBLIC_IMAGE_MAX_BYTES`, `uploadPublicImage` / `publicObjectUrl` / `removeObject`, clan path `{ownerId}/{clanId}.{ext}`. Public bucket `clan-pictures` (`supabase/migrations/20260827130638_clan_picture_storage.sql`) has anon SELECT and an explicit comment: **S-20 must not reuse this bucket.** Cookie SSR client uses the publishable `SUPABASE_KEY` (`src/lib/supabase.ts`); production has no service-role Worker path (local quick-login only).

Compose is `POST /api/runs/{id}/comments` + `fetchFormJson` (`FormData` + `Accept: application/json`). Clan create already proved multipart on Cloudflare Workers (`CreateClanForm` `encType="multipart/form-data"`). Worker request bodies allow 100 MB on Free/Pro — 5 MiB is not a platform problem. No test runner.

## Desired End State

On an **active** run, a confirmed (not banned) participant posts a comment with optional screenshot, or a screenshot with no text. The thread shows the image inline for the existing comment readers. Guests and pending applicants still do not see the section and cannot fetch the bytes via a public Storage URL. After archive, readers still see images; compose stays off; authors cannot remove screenshot objects (only admin can). Admin comment-delete removes the row and best-effort the object. Clan pictures stay 1 MiB on the public bucket. Admin run-delete does not prefix-purge the bucket (orphans accepted).

### Key Discoveries:

- Poster set is **confirmed only** (RLS + `createComment` + `canPostOrLike`). FR-027’s parenthetical list is the **read** ACL; do not add organizer/admin INSERT for screenshots (`src/lib/services/comments.ts`, `20260820092809_run_comments.sql`).
- `clan-pictures` is world-readable. Comment screenshots on friends-only / invite-only runs would leak `/teamrank` proof if they used `getPublicUrl` (`20260827130638_clan_picture_storage.sql:16-17`).
- `uploadPublicImage` always `assertPublicImage` at 1 MiB (`src/lib/storage.ts:32-36, 62-66`). A 5 MiB comment upload must pass `maxBytes` into that assert or clan create and comments will fight.
- Comments are append-only: attach only at INSERT. Generate the comment UUID, upload `{authorId}/{runId}/{commentId}.{ext}`, then INSERT with that `id` (same write order as clan pictures).
- `createSignedUrl(path, 3600)` is the documented private-bucket download path. The caller’s JWT must pass `storage.objects` SELECT (same people as comment SELECT). Signed URLs then work in `<img>` without cookies until expiry.
- `run_comments_body_nonempty_chk` blocks screenshot-only rows until it is replaced with “body nonempty **or** `screenshot_path` present.”
- `screenshot_path` first segment must equal `author_id` (sibling CHECK). Storage own-folder DELETE must also require `is_run_in_active_window` so archived `/teamrank` proof cannot be self-wiped; `is_admin()` DELETE stays unrestricted.
- `listCommentsForRun` is SSR-only (no GET API). Mint signed URLs there and on create JSON so the island never receives a public object URL.
- `lessons.md`: never put Storage/PostgREST `error.message` on `?commentError=`.

## What We're NOT Doing

- Widening comment read or write (guests, pending, denied, unseated organizer/admin post)
- A separate screenshot table, type, or route
- Reusing `clan-pictures` or `getPublicUrl` for comment bytes
- Worker proxy streaming, thumbnails, image transforms, lightbox
- Clipboard paste / drag-drop
- Author edit/delete, attaching a screenshot to an existing comment (would need UPDATE)
- Moderation queue, NSFW scanning, virus scan
- Raising clan picture cap (stays 1 MiB)
- GIF / BMP / video
- Pagination, realtime, Vitest/Jest, `service_role` on the Worker
- S-23 verified-finish / clan points (this slice is only the proof attachment path)
- Admin run-delete (`deleteRunAsAdmin`) prefix-purge of `comment-screenshots`; `runs` DELETE cascades `run_comments` but not Storage — accept orphans; do not expand this slice to `deleteRunAsAdmin`

## Implementation Approach

Additive migration (column + CHECK + private bucket + storage RLS) → regenerate types → parameterize the existing storage helper (maxBytes + signed URL; clan defaults unchanged) → multipart `createComment` on the existing POST → `RunComments` file input and inline `<img>`.

Postgres RLS remains the authz boundary. The island only renders what `canReadComments` / `canPostOrLike` already allow.

## Critical Implementation Details

**Write order matches clan pictures.** Generate `commentId`, upload to `{authorId}/{runId}/{commentId}.{ext}` when a file is present, then `INSERT` into `run_comments` with that `id` and `screenshot_path`. If INSERT fails, `removeObject`. Own-folder Storage DELETE also requires `is_run_in_active_window(run_id)` (run_id from `comment_screenshot_object_run_id`); `is_admin()` DELETE is unrestricted. Create-path rollback still works because upload happens only after `requireActiveRun`. After archive, only admin can remove objects. Do not `GRANT UPDATE` on `run_comments`.

**Private bucket + signed URLs, never public URLs.** `comment-screenshots.public = false`. No anon SELECT policy. List/create mint `createSignedUrl(..., 3600)` with the viewer’s cookie client. `<img src>` must be a signed URL (`/object/sign/` or `token=`), not `/object/public/`.

**Parameterize size, do not fork the assert.** `uploadPublicImage` / `assertPublicImage` must take optional `maxBytes` (default `PUBLIC_IMAGE_MAX_BYTES` = 1 MiB) so comments can pass 5 MiB without raising the clan cap. Map in-process and bucket-limit failures to a **fixed** screenshot string, not Storage `error.message`.

**Guard uuid casts in storage RLS.** Object names are `{uuid}/{uuid}/{uuid}.ext`. Parse `run_id` from `foldername(name)[2]` via a helper that returns null on junk so a malformed key is denied instead of 500ing Storage. Call existing `is_confirmed_participant` / `is_run_organizer` / `is_admin` — do not inline `run_participants` (`42P17`).

---

## Phase 1: Schema, private bucket, and storage RLS

### Overview

Add `screenshot_path` (path regex + author_id CHECK + run_id CHECK) and relax the nonempty-body CHECK so screenshot-only rows are legal in SQL. Create a private `comment-screenshots` bucket with comment-reader SELECT, confirmed-writer INSERT, own-folder DELETE only while `is_run_in_active_window`, and unrestricted `is_admin()` DELETE. No app behavior change yet.

### Changes Required:

#### 1. Migration — column, CHECKs, bucket, storage RLS

**File**: `supabase/migrations/<timestamp>_comment_screenshots.sql` (via `npx supabase migration new comment_screenshots`)

**Intent**: Persist one object key per comment and store the bytes where only comment readers can SELECT, without opening comment UPDATE or the public clan bucket.

**Contract**:
- `alter table public.run_comments add column screenshot_path text null` with two CHECKs: null **or** three lowercase UUIDs and an allowed extension, **and** first path segment equals `author_id`. Non-obvious constraints:

```sql
constraint run_comments_screenshot_path_chk check (
  screenshot_path is null
  or screenshot_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
);
constraint run_comments_screenshot_path_author_chk check (
  screenshot_path is null
  or split_part(screenshot_path, '/', 1) = author_id::text
);
constraint run_comments_screenshot_path_run_chk check (
  screenshot_path is null
  or split_part(screenshot_path, '/', 2) = run_id::text
);
```

Keep the three-UUID+ext regex on `run_comments_screenshot_path_chk`. Sibling CHECKs bind the first path segment to `author_id` and the second to `run_id` so a confirmed participant cannot INSERT another author's object key, or an object from a different run, as their own comment.

- Drop `run_comments_body_nonempty_chk`. Add `run_comments_body_or_screenshot_chk`: `char_length(btrim(body)) > 0 or screenshot_path is not null`. Keep `run_comments_body_max_length_chk` (`<= 1000`). `body` stays `NOT NULL` (screenshot-only uses `''`).
- **Do not** `GRANT UPDATE` on `run_comments`. **Do not** add an UPDATE policy.
- Insert bucket `comment-screenshots`: `public = false`, `file_size_limit = 5242880` (5 MiB), `allowed_mime_types = {image/jpeg, image/png, image/webp}`.
- Helper `public.comment_screenshot_object_run_id(p_name text) returns uuid`: `STABLE`, `SECURITY DEFINER`, `search_path = ''`, parse `(storage.foldername(p_name))[2]` only if it matches a uuid regex, else null. `revoke all from public`; `grant execute to authenticated`.
- `storage.objects` RLS (`bucket_id = 'comment-screenshots'` only):
  - SELECT to `authenticated` when `is_admin()` **or** `is_confirmed_participant(comment_screenshot_object_run_id(name))` **or** `is_run_organizer(comment_screenshot_object_run_id(name))`. **No** anon SELECT policy.
  - INSERT to `authenticated` when `(storage.foldername(name))[1] = (select auth.uid()::text)` **and** `is_confirmed_participant(run_id)` **and** `is_not_banned()` **and** `is_run_in_active_window(run_id)` (run_id from the helper).
  - DELETE to `authenticated` when **own folder and** `is_run_in_active_window(run_id)` (run_id from `comment_screenshot_object_run_id`) **or** `is_admin()` (unrestricted). Create-path rollback `removeObject` still works because upload happens only after `requireActiveRun`. After archive, only admin can remove objects.
  - No UPDATE policy on this bucket.
- Do not touch `clan-pictures` policies or `run_comments` INSERT/SELECT/DELETE comment-table policies (those already encode the poster/reader set).

#### 2. Regenerated types

**File**: `src/types/database.ts` (only via `npm run db:types`)

**Intent**: Typed client includes `screenshot_path` without hand-edits.

**Contract**: `run_comments.Row` / `Insert` gain `screenshot_path: string | null` (Insert optional). Do not hand-edit this file.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` exits 0
- `npm run db:types` — `run_comments` includes `screenshot_path`; file is not hand-edited
- SQL smoke (local JWT `anon` / `authenticated`): bucket exists, `public = false`, 5 MiB, jpeg/png/webp; anon cannot SELECT objects in this bucket; confirmed participant INSERT into `{uid}/{runId}/{commentId}.jpg` on an active run succeeds; pending and anon INSERT/SELECT fail; organizer and admin SELECT succeed; INSERT `run_comments` with `body = ''` and a valid `screenshot_path` succeeds; INSERT with empty body and null path fails; text-only INSERT still succeeds; `has_table_privilege(..., 'UPDATE')` on `run_comments` stays false for `authenticated`; no `storage.objects` UPDATE policy names this bucket
- SQL smoke (storage DELETE): author DELETE of an own-folder object on an **archived** run fails; author DELETE during the **active** window (create-path rollback) succeeds; `is_admin()` DELETE succeeds on both active and archived runs
- SQL smoke (`screenshot_path` author bind): INSERT `run_comments` with a path whose first UUID is not `author_id` fails (sibling CHECK)
- SQL smoke (`screenshot_path` run bind): INSERT `run_comments` with a valid author segment but a second UUID that is not `run_id` fails (sibling CHECK)
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification:

- Local Studio: `run_comments.screenshot_path` nullable; `storage.buckets` shows `comment-screenshots` private, 5 MiB, jpeg/png/webp

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Storage helper, comment service, and multipart POST

### Overview

Confirmed participants can attach a screenshot through the existing comment POST (curl/multipart). List/create return 1-hour signed URLs. Clan picture 1 MiB behavior is unchanged. The island still looks like text-only until Phase 3.

### Changes Required:

#### 1. Parameterize storage helper

**File**: `src/lib/storage.ts`

**Intent**: One upload/remove path for public clan pictures and private comment screenshots, with a per-call size cap and a signed-URL helper, without raising the clan 1 MiB default.

**Contract**:
- Keep `CLAN_PICTURES_BUCKET`, `PUBLIC_IMAGE_MIME_TYPES`, `PUBLIC_IMAGE_MAX_BYTES = 1_048_576`, `PICTURE_REJECT_MESSAGE`, `clanPictureObjectPath`, `publicObjectUrl`, `removeObject`.
- Add `COMMENT_SCREENSHOTS_BUCKET = "comment-screenshots"`, `COMMENT_SCREENSHOT_MAX_BYTES = 5_242_880`, `SCREENSHOT_REJECT_MESSAGE = "Screenshot must be a JPEG, PNG, or WebP under 5 MB."`, `commentScreenshotObjectPath(authorId, runId, commentId, ext)` → `{authorId}/{runId}/{commentId}.{ext}` (lowercase UUIDs, `jpg`/`png`/`webp`).
- `assertPublicImage` / `assertPublicImageFile` / `uploadPublicImage` take optional `maxBytes` (default `PUBLIC_IMAGE_MAX_BYTES`) and optional `rejectMessage` (default `PICTURE_REJECT_MESSAGE`). Comment callers pass the 5 MiB constant and screenshot reject string. Clan callers omit them.
- `createSignedObjectUrl(supabase, bucket, path, expiresIn = 3600)` wraps `storage.from(bucket).createSignedUrl`. On failure: `console.error`, return `null` — do not throw Storage `error.message` to the user.
- Never call `getPublicUrl` for `COMMENT_SCREENSHOTS_BUCKET`.

#### 2. Comment service

**File**: `src/lib/services/comments.ts`

**Intent**: Attach at most one screenshot at comment create, mint signed URLs for readers, and clean storage on admin delete — without changing who can post or list.

**Contract**:
- `RunComment` gains `screenshotUrl: string | null` (signed URL or null). Do **not** put `screenshot_path` on the DTO.
- `COMMENT_SELECT` includes `screenshot_path`. `listCommentsForRun` mints signed URLs for rows that have a path (batch `createSignedUrls` if the client exposes it; otherwise per-path `createSignedUrl`). Mint failure → that row’s `screenshotUrl` is null; do not fail the whole list.
- `createComment(..., body, file?: File | null)`: trim body. If no trimmed text **and** no file → `CommentError("Comment cannot be empty")`. If `trimmed.length > 0` (including text+screenshot), keep the existing `COMMENT_BODY_MAX` `CommentError("Comment must be 1000 characters or fewer")`; SQL `run_comments_body_max_length_chk` stays the backstop. If file: `assertPublicImageFile` at 5 MiB / screenshot message; generate `commentId`; `uploadPublicImage` (or the bytes assert it calls) MUST receive `COMMENT_SCREENSHOT_MAX_BYTES` and `SCREENSHOT_REJECT_MESSAGE` — not only `assertPublicImageFile` (clan copy would keep the 1 MiB default); INSERT with `id`, `body` (`''` when screenshot-only), `screenshot_path`. Map `StorageImageError` to `CommentError` with `SCREENSHOT_REJECT_MESSAGE`. On INSERT failure after upload, `removeObject`. After successful INSERT, mint `screenshotUrl` via `createSignedObjectUrl` (null on mint failure; do not fail the create) and pass it into `mapComment`. List minting stays as specified (`createSignedUrls` when available; per-path otherwise). Still `requireConfirmedParticipant` + `requireActiveRun` **before** upload. Text-only path stays an INSERT without a storage call.
- `deleteCommentAsAdmin`: `select screenshot_path` then delete the row (existing zero-row → `CommentError`). Then `removeObject` if a path was present. Remove failure: log only; the comment is already gone.
- Do not add organizer/admin write shortcuts. Do not import `ParticipantError`.

#### 3. Comment POST + JSON DTO

**Files**: `src/pages/api/runs/[id]/comments.ts`; `src/lib/fetch-form-json.ts`

**Intent**: The existing create route accepts an optional `screenshot` file the same way `/api/clans` reads `picture`.

**Contract**: `formFile` for `screenshot` (size > 0). Pass into `createComment`. JSON success body `comment` includes `screenshotUrl`. Failures stay `?commentError=` / JSON `error` with **fixed** strings (`CommentError` or “Could not post comment”). `StorageImageError` must not leak as infra text. Like route unchanged.

#### 4. Admin delete cleanup

**File**: `src/pages/api/admin/runs/[id]/comments/[commentId]/delete.ts` — no HTTP change if the service owns remove. Keep `?commentError=`.

**Intent**: Admin hard-delete still one POST; storage cleanup is inside `deleteCommentAsAdmin`.

**Contract**: Unchanged status codes and redirects. Service performs path read + row delete + `removeObject`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0
- `npm run build` exits 0
- `PUBLIC_IMAGE_MAX_BYTES` remains `1_048_576`; `COMMENT_SCREENSHOT_MAX_BYTES` is `5_242_880`; clan callers of `uploadPublicImage` do not pass a higher cap

#### Manual Verification:

- Confirmed participant: screenshot-only, text+screenshot, and text-only POST all succeed; returned `screenshotUrl` is signed (not `/object/public/`)
- Empty body without file, file over 5 MiB, and wrong MIME fail with the fixed screenshot/empty strings on `?commentError=` (never Storage `error.message`)
- Text (including text+screenshot) over 1000 chars fails with `CommentError("Comment must be 1000 characters or fewer")`, not a generic PostgREST dump
- Guest, pending applicant, and unseated organizer/admin (not confirmed) cannot post a screenshot
- Admin comment delete removes the row; the object is gone or remove failure is only logged
- Clan picture upload still rejects files over 1 MiB with the existing picture string

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: RunComments island and AGENTS.md

### Overview

Confirmed participants attach a file from the compose form; readers see the image inline. Guests still never see the section. Document the private-bucket rule next to the existing comment ACL.

### Changes Required:

#### 1. Compose + thread UI

**File**: `src/components/runs/RunComments.tsx`

**Intent**: Same island, same POST, plus one file field and inline proof images — no new routes or clipboard UX.

**Contract**:
- Compose `form` sets `encType="multipart/form-data"`. File input `name="screenshot"`, `accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"`, client check against `COMMENT_SCREENSHOT_MAX_BYTES` / `PUBLIC_IMAGE_MIME_TYPES` (same pattern as `CreateClanForm`). Hint: JPEG, PNG, or WebP. Max 5 MB.
- Client reject uses `SCREENSHOT_REJECT_MESSAGE` and does not submit.
- Thread: if `screenshotUrl`, render `<img src={screenshotUrl} alt="Comment screenshot" />` under the body, `max-w-full` via `cn()`. If `body` is empty, do not render an empty body paragraph.
- `fetchFormJson` already sends `FormData`; after post, append the returned comment (including `screenshotUrl`) the same way as today.
- Do not add paste/drop, lightbox, or a second request.

#### 2. Page gate (only if needed)

**File**: `src/pages/runs/[id].astro`

**Intent**: Keep `canReadComments` / `canPostOrLike` exactly as they are.

**Contract**: No ACL widening. Touch this file only if the island needs an extra prop that is already in scope (it should not). Do not load comments for guests/pending.

#### 3. AGENTS.md comment ACL sentence

**File**: `AGENTS.md`

**Intent**: Future slices must not put comment screenshots on the public clan bucket or widen ACL.

**Contract**: In the existing comment-ACL / restricted-run hard-rule bullets, add that screenshots attach to `run_comments` via private Storage + signed URLs; do not reuse `clan-pictures`; do not widen who can post or read.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification:

- Compose shows a file input; client blocks oversize/wrong MIME; successful post shows the image in the list without reload if JSON includes `screenshotUrl`
- Screenshot-only comments show the image and no empty body paragraph; text+screenshot shows both
- Guest and pending applicant still do not see the Comments section; a restricted run still 404s for outsiders (no public image URL to guess from the page)
- Archived readers (confirmed / organizer / admin) still see images; compose and like stay hidden
- Unseated organizer/admin can see images when they can already read, and still have no compose unless confirmed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

None. There is no test runner (`AGENTS.md` / `package.json`).

### Integration Tests:

None. Prove schema with `npx supabase db reset` + SQL smoke (Phase 1). Prove write path with local multipart POST against `npm run dev` (Phase 2). Prove UI in the browser (Phase 3).

### Manual Testing Steps:

1. Sign in as a confirmed participant on an active public run. Post text-only (regression), then a JPEG/WebP/PNG under 5 MiB with and without text. Confirm the image renders inline for that user, an unseated organizer, and an admin.
2. As a guest and as a pending applicant: Comments section absent; Storage anon/JWT SELECT of the object key fails; `/object/public/comment-screenshots/...` is not used.
3. Oversize file and `text/plain`: fixed screenshot string on the comments banner, not a PostgREST dump.
4. Archive the run: images remain for the same readers; compose is gone; the author cannot `storage.remove` the object (only admin can).
5. Admin deletes the screenshot comment: row gone, object gone (Studio).
6. Create-clan picture still rejects >1 MiB.

## Performance Considerations

5 MiB is well under the Workers 100 MB request-body limit and the 128 MB isolate; reject in-process before `storage.upload`. Comment threads are unpaginated (S-12); minting one signed URL per screenshot is acceptable. Prefer `createSignedUrls` when listing several paths. No thumbnails — inline `max-w-full` only.

## Migration Notes

Existing comments get `screenshot_path = null`; the new OR CHECK still accepts their nonempty bodies. Rollback is drop column + drop bucket policies/bucket (objects would orphan if not deleted first). Production schema applies on the next `v*` tag (`cd_trigger: tag`), not on merge to `main`.

Admin run-delete (`deleteRunAsAdmin`) does **not** prefix-purge `comment-screenshots`. `runs` DELETE cascades `run_comments` but not `storage.objects`; leftover objects are reachable only by `is_admin()` after participant/organizer rows are gone. Accept orphans; do not expand this slice to `deleteRunAsAdmin`. A last-second active-window close between failed INSERT and rollback DELETE can leave the same class of orphan.

## References

- PRD: `context/foundation/prd-v2.md` FR-001, FR-027, US-01, US-02
- Roadmap: `context/foundation/roadmap.md` S-20
- Shipped comments: `context/archive/2026-08-20-run-comments/`
- Shipped storage helper: `context/archive/2026-08-27-create-clan-directory/`; `src/lib/storage.ts`; `supabase/migrations/20260827130638_clan_picture_storage.sql`
- Comment ACL: `src/lib/services/comments.ts`; `src/pages/runs/[id].astro`; `AGENTS.md`
- Errors: `context/foundation/lessons.md` (`?commentError=` / no raw infra messages)
- Supabase Storage: private buckets + `createSignedUrl` (`/supabase/supabase` docs)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, private bucket, and storage RLS

#### Automated

- [x] 1.1 npx supabase db reset exits 0
- [x] 1.2 npm run db:types — run_comments includes screenshot_path; file is not hand-edited
- [x] 1.3 SQL smoke: private comment-screenshots bucket 5 MiB jpeg/png/webp; no anon SELECT; confirmed INSERT own-folder on active run; pending/anon cannot INSERT or SELECT; organizer/admin SELECT; screenshot-only row allowed; neither-body-nor-path rejected; text-only still works; authenticated has no UPDATE on run_comments; no storage.objects UPDATE policy for this bucket
- [x] 1.4 npm run lint exits 0
- [x] 1.5 npm run build exits 0
- [x] 1.7 SQL smoke: author DELETE on archived run fails; author DELETE during active window for rollback still works; admin DELETE always works
- [x] 1.8 SQL smoke: INSERT with screenshot_path whose first UUID is not author_id fails
- [x] 1.9 SQL smoke: INSERT with screenshot_path whose second UUID is not run_id fails

#### Manual

- [x] 1.6 Local Studio: run_comments.screenshot_path nullable; storage.buckets shows comment-screenshots private, 5 MiB, jpeg/png/webp

Note: YOLO skipped human Studio confirm for 1.6 (residual risk). Bucket + column were verified via SQL (`storage.buckets` + `information_schema` equivalent in smoke 1.3); no human opened Studio.

### Phase 2: Storage helper, comment service, and multipart POST

#### Automated

- [ ] 2.1 npm run lint exits 0
- [ ] 2.2 npm run build exits 0
- [ ] 2.3 PUBLIC_IMAGE_MAX_BYTES remains 1_048_576; COMMENT_SCREENSHOT_MAX_BYTES is 5_242_880; clan callers of uploadPublicImage do not pass a higher cap

#### Manual

- [ ] 2.4 Confirmed participant: screenshot-only, text+screenshot, and text-only POST all succeed; returned screenshotUrl is signed (not /object/public/)
- [ ] 2.5 Empty body without file, file over 5 MiB, and wrong MIME fail with the fixed screenshot/empty strings on ?commentError= (never Storage error.message)
- [ ] 2.6 Guest, pending applicant, and unseated organizer/admin (not confirmed) cannot post a screenshot
- [ ] 2.7 Admin comment delete removes the row; the object is gone or remove failure is only logged
- [ ] 2.8 Clan picture upload still rejects files over 1 MiB with the existing picture string
- [ ] 2.9 Text (including text+screenshot) over 1000 chars fails with "Comment must be 1000 characters or fewer", not a generic PostgREST dump

### Phase 3: RunComments island and AGENTS.md

#### Automated

- [ ] 3.1 npm run lint exits 0
- [ ] 3.2 npm run build exits 0

#### Manual

- [ ] 3.3 Compose shows a file input; client blocks oversize/wrong MIME; successful post shows the image in the list without reload if JSON includes screenshotUrl
- [ ] 3.4 Screenshot-only comments show the image and no empty body paragraph; text+screenshot shows both
- [ ] 3.5 Guest and pending applicant still do not see the Comments section; a restricted run still 404s for outsiders (no public image URL to guess from the page)
- [ ] 3.6 Archived readers (confirmed / organizer / admin) still see images; compose and like stay hidden
- [ ] 3.7 Unseated organizer/admin can see images when they can already read, and still have no compose unless confirmed
