<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Comment screenshots Implementation Plan

- **Plan**: `context/changes/comment-screenshots/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-31
- **Review**: #2 (re-review after REVISE; F1–F5 from `reviews/plan-review.md` marked Applied)
- **Verdict**: SOUND
- **Findings**: 0 critical 1 warning 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Prior REVISE findings (verified in plan.md)

Review #1 verdict was REVISE. All five Decision lines were Applied. This pass checked that each fix is actually in the active plan (not only the report):

| ID | Required fix | Present? |
|----|----------------|----------|
| F1 | Own-folder Storage DELETE also requires `is_run_in_active_window`; `is_admin()` unrestricted | Yes — Key Discoveries, Critical Details, Phase 1 DELETE policy, SQL smoke + Progress **1.7**, Desired End State / archive wording |
| F2 | Sibling CHECK: first path UUID = `author_id` | Yes — `run_comments_screenshot_path_author_chk`, SQL smoke + Progress **1.8** |
| F3 | `createComment` mints `screenshotUrl` via `createSignedObjectUrl` after INSERT (null on mint failure) | Yes — Phase 2 Comment service contract |
| F4 | Keep `COMMENT_BODY_MAX` `CommentError` whenever `trimmed.length > 0` | Yes — Phase 2 contract, manual **2.9** |
| F5 | Admin run-delete Storage prefix-purge stays NOT Doing; accept orphans | Yes — What We're NOT Doing, Migration Notes, Desired End State; no phase touches `deleteRunAsAdmin` |

`plan-brief.md` Key Decisions / Scope / Open Risks match those five. None of F1–F5 is missing.

## Grounding

Grounding: 12/12 existing paths ✓, 1/1 new migration expected-absent ✓, 14/14 in-repo symbols ✓, brief↔plan ✓. `docs/reference/contract-surfaces.md` absent — check skipped.

Existing paths listed: `src/lib/storage.ts`, `src/lib/services/comments.ts`, `src/pages/api/runs/[id]/comments.ts`, `src/lib/fetch-form-json.ts`, `src/pages/api/admin/runs/[id]/comments/[commentId]/delete.ts`, `src/components/runs/RunComments.tsx`, `src/pages/runs/[id].astro`, `src/types/database.ts`, `AGENTS.md`, `supabase/migrations/20260820092809_run_comments.sql`, `supabase/migrations/20260827130638_clan_picture_storage.sql`, `src/lib/supabase.ts`.

New file (not on disk, as expected): `supabase/migrations/<timestamp>_comment_screenshots.sql`.

Symbols confirmed: `createComment` / `listCommentsForRun` / `deleteCommentAsAdmin` / `COMMENT_SELECT` / `RunComment` / unexported `COMMENT_BODY_MAX = 1000` (`src/lib/services/comments.ts`); `canPostOrLike` / `canReadComments` (`src/pages/runs/[id].astro:92-112`); `uploadPublicImage` / `assertPublicImage` / `assertPublicImageFile` / `PUBLIC_IMAGE_MAX_BYTES = 1_048_576` (`src/lib/storage.ts:7,32-66`); `fetchFormJson` (`src/lib/fetch-form-json.ts`); `run_comments_body_nonempty_chk` (`20260820092809_run_comments.sql:54`); `is_confirmed_participant` (status `'confirmed'` only, no archive/window check — `20260817125800`); `is_run_organizer` / `is_run_in_active_window` / `GRANT select, insert, delete` no UPDATE (`20260820092809`); `deleteRunAsAdmin` (`src/lib/services/admin.ts:96`) still out of this slice. Clan `formFile` is a **local** helper in `src/pages/api/clans/index.ts:17-23` and again in `src/pages/api/admin/clans/[id].ts` (copy, do not import). `createSignedUrl(path, 3600)` confirmed (Context7 `/supabase/supabase`): private buckets download via RLS-gated `createSignedUrl`; signed URLs are time-limited and shareable.

Brief↔plan: private `comment-screenshots` + 1h signed URL, one nullable `screenshot_path`, screenshot-only, 5 MiB jpeg/png/webp, file input on existing POST, inline `<img>`, 3 phases, ACL must not widen, F1–F5 decisions — match `crew-decisions.md` and plan-brief.

Progress↔Phase: one `## Progress`; Phase 1/2/3 names match; every success-criteria bullet has a `N.M` checkbox (1.1–1.8 with 1.6 manual, 2.1–2.9, 3.1–3.7); phase bodies have no `- [ ]`.

Deep verification (inline, no nested agent — specialist under Crew Lead):

1. **Storage SELECT vs comment readers** — CONFIRMED. `run_comments` SELECT is confirmed (`is_confirmed_participant`, status stays `'confirmed'` after archive) + admin + organizer. `getArchivedRunForParticipant` requires `own?.status === "confirmed"` (`runs.ts:640-641`); page `archivedSource === "participant"` is not a wider reader set. Plan storage SELECT using the same three helpers is the correct mirror.
2. **1 MiB clan assert** — CONFIRMED. `assertPublicImage` / `assertPublicImageFile` hardcode `PUBLIC_IMAGE_MAX_BYTES` (`storage.ts:32-43`); `uploadPublicImage` always calls that assert (`:66`). Clan callers `src/lib/services/clans.ts:357,360` omit a cap. Parameterizing with default 1 MiB is required. See F1 (this review): `createComment` must pass the 5 MiB cap into **upload**, not only `assertPublicImageFile`.
3. **`clan-pictures` leak** — CONFIRMED. Bucket `public = true` + anon SELECT (`20260827130638:16-36`) with an explicit “S-20 must not reuse” comment.
4. **Write order** — CONFIRMED. Clan create already `crypto.randomUUID().toLowerCase()` → upload → INSERT → `removeObject` on failure (`clans.ts:351-377`). Comment INSERT currently omits `id` (DB default). F1 DELETE + `requireActiveRun` before upload still lets create-path rollback work.
5. **Blast radius** — `createComment` only called from `src/pages/api/runs/[id]/comments.ts`. `listCommentsForRun` only from `[id].astro`. `RunComment` consumers: `RunComments.tsx`, `[id].astro`, inline `FormJsonMeta.comment` in `fetch-form-json.ts:9-18` (must gain `screenshotUrl` when the DTO does; compiler will fail the `setItems` append until it does). `storage.ts` also imported by `CreateClanForm.tsx` / `AdminClanControls.tsx` / clan pages — they stay correct if comment callers pass 5 MiB explicitly. `deleteRunAsAdmin` remains out of scope (review #1 F5).
6. **Pattern** — no new abstraction: extend existing storage helper + existing comment POST; island copies `CreateClanForm` file-input client check. Compose today has no `encType` (`RunComments.tsx:194-201`); Phase 3 adding `multipart/form-data` is required for the file field.
7. **F1–F5 application** — CONFIRMED in plan body, Progress, and brief (table above).

Lessons.md: plan still maps Storage/PostgREST `error.message` off `?commentError=` (fixed `CommentError` / “Could not post comment” / `SCREENSHOT_REJECT_MESSAGE`). Manual-verification URLs remain an implement-gate concern (YOLO skips human pause).

## Findings

### F1 — `createComment` upload may keep the 1 MiB default

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Comment service `createComment` vs Parameterize storage helper
- **Detail**: Clan create does `assertPublicImageFile(file)` then `uploadPublicImage({ bucket, path, bytes, mime })` with **no** size argument (`clans.ts:357-365`). Both asserts currently hardcode 1 MiB, so they agree. After parameterization, `uploadPublicImage` still calls `assertPublicImage` and defaults to `PUBLIC_IMAGE_MAX_BYTES`. The helper contract says comment callers pass 5 MiB into `assertPublicImage` / `assertPublicImageFile` / `uploadPublicImage`. The `createComment` bullet only says “`assertPublicImageFile` at 5 MiB / screenshot message; generate `commentId`; upload”. An implementer copying the clan write order and only widening the file assert would reject 1–5 MiB screenshots at upload (the product cap this slice chose). Manual 2.4 would fail for typical in-game PNGs.
- **Fix**: In the `createComment` bullet, require `uploadPublicImage` (or the bytes assert it calls) to receive `COMMENT_SCREENSHOT_MAX_BYTES` and `SCREENSHOT_REJECT_MESSAGE`, not only `assertPublicImageFile`.
- **Decision**: Applied (Crew Lead YOLO — SOUND leftover; `createComment` must pass `COMMENT_SCREENSHOT_MAX_BYTES` into `uploadPublicImage`)

### F2 — `screenshot_path` second UUID is not bound to `run_id`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `run_comments_screenshot_path_author_chk` (review #1 F2 leftover)
- **Detail**: Review #1 F2 bound the first path segment to `author_id`. The CHECK still does not require `split_part(screenshot_path, '/', 2) = run_id::text`. App write order always uses the route’s `runId` as the second segment. A confirmed participant on two runs could PostgREST-INSERT a comment on run B whose path points at `{self}/{runA}/{commentId}.jpg`. Storage SELECT still uses the path’s run_id, so this is not an ACL widen (viewers who cannot SELECT run A get a null signed URL). It is the same class of SQL-vs-app invariant as F2, narrower (own objects only). S-23 in-app proof on run B could show an image from run A if someone bypasses `createComment`.
- **Fix**: Sibling CHECK: `screenshot_path is null or split_part(screenshot_path, '/', 2) = run_id::text`. Optional SQL smoke: INSERT with a valid author segment but the wrong run UUID fails.
- **Decision**: Applied (Crew Lead YOLO — SOUND leftover; sibling CHECK `split_part(..., 2) = run_id::text` + Progress 1.9)
