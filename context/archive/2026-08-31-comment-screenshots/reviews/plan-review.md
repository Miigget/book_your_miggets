<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Comment screenshots Implementation Plan

- **Plan**: `context/changes/comment-screenshots/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-31
- **Verdict**: REVISE
- **Findings**: 0 critical 3 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 12/12 existing paths ✓, 1/1 new migration expected-absent ✓, 14/14 in-repo symbols ✓, brief↔plan ✓. `docs/reference/contract-surfaces.md` absent — check skipped.

Existing paths listed: `src/lib/storage.ts`, `src/lib/services/comments.ts`, `src/pages/api/runs/[id]/comments.ts`, `src/lib/fetch-form-json.ts`, `src/pages/api/admin/runs/[id]/comments/[commentId]/delete.ts`, `src/components/runs/RunComments.tsx`, `src/pages/runs/[id].astro`, `src/types/database.ts`, `AGENTS.md`, `supabase/migrations/20260820092809_run_comments.sql`, `supabase/migrations/20260827130638_clan_picture_storage.sql`, `src/lib/supabase.ts`.

New file (not on disk, as expected): `supabase/migrations/<timestamp>_comment_screenshots.sql`.

Symbols confirmed: `createComment` / `listCommentsForRun` / `deleteCommentAsAdmin` / `COMMENT_SELECT` / `RunComment` (`src/lib/services/comments.ts`); `canPostOrLike` / `canReadComments` (`src/pages/runs/[id].astro:92-112`); `uploadPublicImage` / `assertPublicImage` / `assertPublicImageFile` / `PUBLIC_IMAGE_MAX_BYTES = 1_048_576` (`src/lib/storage.ts:7,32-66`); `fetchFormJson` (`src/lib/fetch-form-json.ts`); `run_comments_body_nonempty_chk` (`20260820092809_run_comments.sql:54`); `is_confirmed_participant` (`20260817125800`); `is_run_organizer` / `is_run_in_active_window` / `GRANT select, insert, delete` no UPDATE (`20260820092809`); clan `formFile` is a **local** helper in `src/pages/api/clans/index.ts:17-23` (copy, do not import). `createSignedUrl` / `createSignedUrls` confirmed in `@supabase/supabase-js` 2.x (Context7): batch returns per-path `error` / `signedUrl`.

Brief↔plan: private `comment-screenshots` + 1h signed URL, one nullable `screenshot_path`, screenshot-only, 5 MiB jpeg/png/webp, file input on existing POST, inline `<img>`, 3 phases, ACL must not widen — match `crew-decisions.md` and plan-brief.

Progress↔Phase: one `## Progress`; Phase 1/2/3 names match; every success-criteria bullet has a `N.M` checkbox (1.1–1.6, 2.1–2.8, 3.1–3.7); phase bodies have no `- [ ]`.

Deep verification (inline, no nested agent — specialist under Crew Lead):

1. **Storage SELECT vs comment readers** — CONFIRMED. `run_comments` SELECT is confirmed (`is_confirmed_participant`, status stays `'confirmed'` after archive) + admin + organizer. There is no separate archived-participant comment policy; page-level `archivedSource === "participant"` exists because `getOwnParticipation` is skipped on archived runs (`[id].astro:76-93`), not because RLS differs. Plan storage SELECT using the same three helpers is the correct mirror.
2. **1 MiB clan assert** — CONFIRMED. `assertPublicImage` / `assertPublicImageFile` hardcode `PUBLIC_IMAGE_MAX_BYTES` (`storage.ts:32-43`); `uploadPublicImage` always calls that assert (`:66`). Clan callers `src/lib/services/clans.ts:343,419` omit a cap. Parameterizing with default 1 MiB is required.
3. **`clan-pictures` leak** — CONFIRMED. Bucket `public = true` + anon SELECT (`20260827130638:16-36`) with an explicit “S-20 must not reuse” comment.
4. **Write order** — CONFIRMED. Clan create already `crypto.randomUUID().toLowerCase()` → upload → INSERT → `removeObject` on failure (`clans.ts:337-377`). Comment INSERT currently omits `id` (DB default).
5. **Blast radius** — `createComment` only called from `src/pages/api/runs/[id]/comments.ts`. `listCommentsForRun` only from `[id].astro`. `RunComment` consumers: `RunComments.tsx`, `[id].astro`, `FormJsonMeta.comment` in `fetch-form-json.ts` (all named). `storage.ts` also imported by `CreateClanForm.tsx` / `AdminClanControls.tsx` / clan pages — they use `PUBLIC_IMAGE_MAX_BYTES` / `getPublicUrl` and stay correct if comment callers pass 5 MiB explicitly. `deleteRunAsAdmin` (`src/lib/services/admin.ts:96`) is **not** in the plan (see F5).
6. **Pattern** — no new abstraction: extend existing storage helper + existing comment POST; island copies `CreateClanForm` file-input client check.

Lessons.md: plan already maps Storage/PostgREST `error.message` off `?commentError=` (fixed `CommentError` / “Could not post comment” / `SCREENSHOT_REJECT_MESSAGE`). Manual-verification URLs are a later implement-gate concern (YOLO skips human pause).

## Findings

### F1 — Own-folder Storage DELETE can wipe archived proof

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — storage.objects DELETE policy
- **Detail**: Phase 1 DELETE is own folder **or** `is_admin()`, with no active-window check. That matches clan-pictures and is needed so `createComment` can `removeObject` after a failed INSERT. Comments themselves are append-only (no author DELETE on `run_comments`). After archive, a confirmed author can still `storage.from("comment-screenshots").remove([path])` via the JS client, leaving a screenshot-only (or text+image) comment whose bytes are gone. S-23 `/teamrank` proof on archived runs is then a broken `<img>`. Phase 3.6 (“archived readers still see images”) assumes the object still exists.
- **Fix A ⭐ Recommended**: Own-folder DELETE **and** `is_run_in_active_window(run_id)` (run_id from `comment_screenshot_object_run_id`); keep `is_admin()` unrestricted. Create-path rollback still works because upload happens only after `requireActiveRun`. After archive, only admin can remove objects.
  - Strength: Matches comment INSERT’s active window; no extra app code; S-23 archived proof cannot be self-deleted.
  - Tradeoff: During the active window an author can still vanish bytes (they cannot edit the comment; they can post a second one). Edge: INSERT fails in the last second of the window → rollback DELETE might be denied (orphan, same class as F5).
  - Confidence: HIGH — `is_run_in_active_window` already gates comment INSERT (`20260820092809:115`).
  - Blind spot: Direct Storage upload without INSERT still needs active window for later self-cleanup.
- **Fix B**: Admin-only DELETE. Rollback on INSERT failure becomes best-effort log (object orphans if `removeObject` is denied).
  - Strength: Authors can never wipe proof.
  - Tradeoff: Failed INSERT leaves 5 MiB orphans until an admin cleans them; diverges from the clan `removeObject` pattern the plan copies.
  - Confidence: MEDIUM — Worker cookie client is not `service_role`, so author rollback would fail closed.
  - Blind spot: No in-app admin UI to purge orphan prefixes.
- **Decision**: Applied (Crew Lead YOLO)

### F2 — `screenshot_path` is not bound to `author_id`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `run_comments_screenshot_path_chk`
- **Detail**: The planned CHECK only validates three lowercase UUIDs + ext. `run_comments` INSERT RLS does not require `split_part(screenshot_path, '/', 1) = author_id::text`. A confirmed participant who can already see a signed URL can copy `{otherAuthor}/{runId}/{commentId}.jpg` into their own INSERT (screenshot-only dummy comment). That does not widen who can **read** bytes (readers already can), but it lets them attach someone else’s `/teamrank` object as their own comment. App write order always uses `authorId` as the first segment; SQL should enforce it.
- **Fix**: Add to the screenshot_path CHECK (or a sibling CHECK): `screenshot_path is null or split_part(screenshot_path, '/', 1) = author_id::text`. Keep the regex. Phase 1 SQL smoke: INSERT with a path whose first UUID is not `author_id` fails.
- **Decision**: Applied (Crew Lead YOLO)

### F3 — `createComment` contract omits minting `screenshotUrl`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Comment service `createComment` bullet vs overview / JSON / 2.4
- **Detail**: Phase 2 overview and the JSON contract say list **and create** return a 1-hour signed URL; success criterion 2.4 requires the POST body `screenshotUrl` to be signed (not `/object/public/`). The `createComment` function contract stops at INSERT + rollback `removeObject` and never says to call `createSignedObjectUrl`. `mapComment` today has no URL field. An implementer following only that bullet returns `screenshotUrl: null`; the island appends a comment with no image until reload (Phase 3.3’s “if JSON includes screenshotUrl” hedge). `listCommentsForRun` minting is specified; create is the gap.
- **Fix**: After successful INSERT, mint with `createSignedObjectUrl` (null on mint failure, do not fail the create). Pass into `mapComment`. Keep list minting as specified (`createSignedUrls` when available; per-path otherwise).
- **Decision**: Applied (Crew Lead YOLO)

### F4 — 1000-char body check can disappear when empty-body logic is rewritten

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — `createComment` empty-body rewrite
- **Detail**: Today `createComment` rejects `trimmed.length > COMMENT_BODY_MAX` before insert (`comments.ts:146-148`). The new contract only specifies the neither-body-nor-file empty error. If the implementer replaces the whole preamble, text+screenshot with 1001 chars fails at `run_comments_body_max_length_chk` and the API maps it to generic “Could not post comment” instead of “Comment must be 1000 characters or fewer”.
- **Fix**: Keep the existing `COMMENT_BODY_MAX` `CommentError` on trimmed body whenever `trimmed.length > 0` (including text+screenshot). SQL CHECK stays the backstop.
- **Decision**: Applied (Crew Lead YOLO)

### F5 — Admin run-delete orphans screenshot objects

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Migration Notes / What We're NOT Doing (file not in plan: `src/lib/services/admin.ts` `deleteRunAsAdmin`)
- **Detail**: `runs` DELETE cascades `run_comments` (`20260820092809:49`) but not `storage.objects`. Admin run delete (`deleteRunAsAdmin`) is out of this slice; leftover objects are reachable only by `is_admin()` after participants/organizer rows are gone. Not an ACL widen. MVP volume is small.
- **Fix**: One Migration Notes / NOT Doing bullet: run-level delete does not prefix-purge `comment-screenshots`; accept orphans (do not expand this slice to `deleteRunAsAdmin`).
- **Decision**: Applied (Crew Lead YOLO)
