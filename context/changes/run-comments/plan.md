# Run comments and likes Implementation Plan

## Overview

Ship S-12 / US-05 / FR-020: confirmed participants can post comments on a run they were accepted to, like comments, and read a flat chronological thread. Reading is **not** the PRD candidate default (anyone who can view the run). This slice locks read to confirmed participants, admins, and unseated organizers. Posting and liking stay confirmed-participant-only on active runs so guests cannot spam a public `/runs/[id]`.

## Current State Analysis

`/runs/[id]` is a public Astro SSR page (`PROTECTED_ROUTES` does not include it) with two React islands: `RunParticipantActions` (apply/withdraw/decide/leave-team) and `AdminRunControls` (delete run). There are no comment or like tables, services, or routes.

Participation status is `pending | confirmed | denied`. “Accepted” in product language is `status = 'confirmed'`. Organizer identity lives on `runs.organizer_id`, distinct from the roster. A trigger auto-seats the organizer as confirmed on create; `leaveTeamAsOrganizer` deletes that seat while leaving `organizer_id` intact. Unseated organizers still see the pending queue and archived-as-organizer detail.

RLS already has `is_confirmed_participant(p_run_id)`, `is_admin()`, and `is_not_banned()`. Inline `EXISTS` on `run_participants` from `runs` policies caused Postgres `42P17` recursion; the definer helper is the required pattern.

Mutations use cookie-session Supabase, form POST, redirect with `?error=`, and `ParticipantError` / `AdminError`. Participant writes call `loadActiveRunForMutation` (reject archived and past the 1-hour grace). Banned POSTs to `/api/*` (except auth) are blocked in middleware. No test runner — verification is `npm run lint`, `npm run build`, local migration, and UI/RLS smoke.

## Desired End State

A confirmed participant on an **active** run (upcoming or in-progress grace) opens `/runs/[id]`, sees a Comments section, posts plain-text notes (max 1000 characters), and toggles a like. Each comment shows a like count; the confirmed viewer’s control is filled/empty. Author nicknames link to `/players/{uuid}`.

Guests, pending, and denied applicants do **not** see the section at all (no teaser). Admins and unseated organizers can read (and see counts) but cannot post or like unless they are themselves confirmed. After archive, the thread stays readable for the same ACL; compose and like are disabled. Authors cannot edit or delete; an admin can hard-delete a comment (likes cascade) with a confirm dialog. If a confirmed author later leaves the roster, their comments and like rows remain; they cannot post or like until confirmed again.

### Key Discoveries:

- `/runs/[id]` is public; comment ACL cannot be “hide in the island only” — omit the section when the viewer cannot read, and enforce RLS (`src/pages/runs/[id].astro`, `src/middleware.ts`)
- `own` participation is loaded only when `user && !archived` (`[id].astro` ~70–76). Archived `canRead` must use `archivedSource === "participant" | isOrganizer | isAdmin`, not `own`
- Reuse `is_confirmed_participant` for write/read; add `is_run_organizer(p_run_id)` and `is_run_in_active_window(p_run_id)` as the same SECURITY DEFINER shape (`supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql`)
- Author nicknames: embed `public_profiles` the way `PARTICIPANT_SELECT` does (`src/lib/services/participants.ts` ~40–48); React `NicknameLink` already exists
- Like toggle should mirror admin ban/verify: POST hidden `value` `"true"` | `"false"` (`src/pages/api/admin/users/[id]/ban.ts` ~29–34)
- Admin delete-run is `locals.profile.role !== "admin"` → redirect `/`, then service + zero-row check (`src/pages/api/admin/runs/[id]/delete.ts`, `src/lib/services/admin.ts` ~56–68)
- Active window: `archived_at IS NULL` and `starts_at > now() - 1 hour` (`src/lib/run-lifecycle.ts` `activeWindowStartsAfter()`). Duplicate that query in `comments.ts`; do **not** import private `loadActiveRunForMutation` or `ParticipantError`
- `lessons.md`: never put PostgREST/`Error.message` in `?error=` or `?commentError=`
- Comment/like/admin-comment-delete redirects use `?commentError=`; apply/leave/decide and admin delete-run keep `?error=`
- Types: `npm run db:types` after local migrate; do not hand-edit `src/types/database.ts`

## What We're NOT Doing

- Guest/public read of comments (PRD open question #2 candidate default — **rejected** by owner seed)
- Unseated organizer post or like
- Author edit or delete (append-only)
- Soft-delete / “removed by admin” tombstones
- Threading / `parent_id` / @-replies
- Liker nickname lists
- Markdown, links, or any sanitizer beyond React text + `whitespace-pre-wrap`
- Pagination / virtual list (load all comments for the run)
- Comments on archived runs (writes) or unlike after archive
- Confirmed non-organizer “leave team” (still organizer-only); no cascade-delete of comments on leave
- Discord bot comment sync (v2+)
- Friend activity feeds and comments from non-participants
- Realtime / WebSocket / `fetch` JSON APIs
- New `PROTECTED_ROUTES` entries
- Vitest/Jest
- `service_role` on the Worker

## Implementation Approach

Follow apply-and-approve: migration + RLS first, then a comments service and thin form-POST routes (including admin delete), then SSR + one React island on the run page.

1. New tables `run_comments` and `run_comment_likes`, definer helpers, per-operation RLS, grants to `authenticated` only (no `anon`), regenerate types.
2. `src/lib/services/comments.ts` (`CommentError`) plus POST routes for create, like toggle, and admin delete. List is a service used by the page, not a GET API.
3. `[id].astro` loads comments only when the viewer can read; `RunComments` island handles compose, like, and admin delete.

## Critical Implementation Details

**Do not inline `EXISTS` on `run_participants` in comment policies.** That pattern recursed with `runs` SELECT (`42P17`). Call `is_confirmed_participant(run_id)`. Add `is_run_organizer(p_run_id)` and `is_run_in_active_window(p_run_id)` as SECURITY DEFINER SQL helpers: `set search_path = ''`, `revoke all from public`, `grant execute to authenticated`. Active window must match apply: `archived_at is null` and `starts_at > now() - interval '1 hour'`. In `comments.ts`, query that window with `activeWindowStartsAfter()` and throw `CommentError("Run not found or no longer active")`. Do **not** import `loadActiveRunForMutation` or `ParticipantError`; do **not** edit `participants.ts` in this slice.

**Comment mutations use `?commentError=`.** Create, like, and admin-comment-delete redirect domain/infra failures to `/runs/{id}?commentError=`. Leave `?error=` for apply/leave/decide and admin delete-run so `RunParticipantActions` and the archived delete-run `Banner` do not duplicate comment errors.

**Denormalize `run_id` onto `run_comment_likes`.** Enforce `foreign key (comment_id, run_id) references run_comments (id, run_id)` (unique on `run_comments (id, run_id)`). Like INSERT/DELETE policies can then use the same helpers on `run_id` without selecting `run_comments` under RLS.

**Archived `canRead` cannot use `own`.** Today `getOwnParticipation` runs only for non-archived signed-in users. Compute `canReadComments` as confirmed (`own?.status === "confirmed"` **or** `archivedSource === "participant"`) **or** `isOrganizer` **or** `isAdmin`. Omit the entire Comments section when false — do not show a locked teaser on a public page.

---

## Phase 1: Schema and RLS

### Overview

Land comment and like tables with CHECKs, FKs, indexes, and RLS so later phases only talk to an existing contract. Empty tables — no backfill.

### Changes Required:

#### 1. Comments migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_run_comments.sql` (timestamp at implement time)

**Intent**: Persist flat comments and per-user likes with the locked ACL, without granting guests any table access.

**Contract**:

- `run_comments`: `id uuid pk default gen_random_uuid()`, `run_id` → `runs(id) ON DELETE CASCADE`, `author_id` → `profiles(id) ON DELETE CASCADE`, `body text not null`, `created_at timestamptz not null default now()`. CHECKs: `char_length(btrim(body)) > 0` and `char_length(btrim(body)) <= 1000`. Unique `(id, run_id)` for the likes composite FK. Index `(run_id, created_at)`.
- `run_comment_likes`: `comment_id`, `run_id`, `user_id` → `profiles(id) ON DELETE CASCADE`, `created_at`. Primary key `(comment_id, user_id)`. Composite FK `(comment_id, run_id)` → `run_comments (id, run_id)` ON DELETE CASCADE. Index `(run_id)` if not covered.
- Helpers (clone `is_confirmed_participant` shape): `is_run_organizer(uuid)`, `is_run_in_active_window(uuid)`.
- RLS enabled on both tables. **No policies and no GRANTs for `anon`.**
- `run_comments` policies (`to authenticated`, `(select auth.uid())` wrapper):
  - SELECT: confirmed via `is_confirmed_participant(run_id)`; admin via `is_admin()`; organizer via `is_run_organizer(run_id)` — three named policies, existing `{table}_{op}_{qualifier}` style.
  - INSERT: `author_id = auth.uid()` AND `is_confirmed_participant(run_id)` AND `is_not_banned()` AND `is_run_in_active_window(run_id)`.
  - DELETE: `is_admin()` only.
  - No UPDATE policy and no UPDATE grant (append-only).
- `run_comment_likes` policies:
  - SELECT: same three read predicates on `run_id`.
  - INSERT: `user_id = auth.uid()` AND confirmed AND not banned AND active window.
  - DELETE: `user_id = auth.uid()` AND confirmed AND not banned AND active window (unlike). Admin unlike is not required; comment DELETE cascades likes.
- `GRANT SELECT, INSERT, DELETE` on both tables to `authenticated` only.

#### 2. Regenerated types

**File**: `src/types/database.ts` (via `npm run db:types`)

**Intent**: Keep the typed client aligned with the new tables and helpers.

**Contract**: Regeneration only. New `Tables` / `Functions` entries for comments, likes, and the two helpers. No hand-edits.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on local Supabase (`npx supabase db reset` or `migration up`)
- `npm run db:types` regenerates without error; `run_comments` and `run_comment_likes` appear in `src/types/database.ts`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- As `anon`: SELECT on either table returns zero rows (no grant/policy)
- As confirmed participant on an active run: INSERT comment (trimmed 1–1000 chars) and INSERT/DELETE own like succeed; INSERT on an archived run fails
- As unseated organizer: SELECT comments/likes succeeds; INSERT comment or like fails
- As admin: SELECT any comment; DELETE comment removes the row and cascaded likes
- CHECK rejects empty/whitespace-only and bodies longer than 1000 characters

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Service and API

### Overview

Centralize list/post/like/admin-delete behind `CommentError` and expose form-POST endpoints that match apply/ban/delete-run error handling.

### Changes Required:

#### 1. Comments service

**File**: `src/lib/services/comments.ts` (new)

**Intent**: One module for comment reads and writes used by the run page and API routes.

**Contract**:

- `CommentError` — same shape as `ParticipantError`.
- DTO for a listed comment: `id`, `runId`, `authorId`, `nickname`, `body`, `createdAt`, `likeCount`, `likedByMe`.
- `listCommentsForRun(supabase, runId, viewerId | null)`: order `created_at` ascending; embed author nickname via `public_profiles`; attach like counts and `likedByMe` for the viewer (second query or embed — no pagination). If RLS returns empty, return `[]` (do not throw).
- `createComment(supabase, runId, userId, body)`: `btrim`; reject empty / over 1000 with `CommentError`; require confirmed via exported `getOwnParticipation`; require active window by querying `runs` with `.is("archived_at", null).gt("starts_at", activeWindowStartsAfter())` and throwing `CommentError("Run not found or no longer active")` if missing. Do **not** import `loadActiveRunForMutation` or `ParticipantError`. Insert `author_id = userId`. Zero-row insert → domain error, not raw PostgREST.
- `setCommentLiked(supabase, runId, commentId, userId, liked: boolean)`: same confirmed + active gates (same duplicated query + `CommentError`); `liked === true` inserts (treat unique `23505` as idempotent success); `liked === false` deletes own row (already-absent is success). Verify the like’s `run_id` matches `runId`.
- `deleteCommentAsAdmin(supabase, runId, commentId)`: delete + `.select("id")`; zero rows → `CommentError` (RLS miss or missing row).

#### 2. Post comment route

**File**: `src/pages/api/runs/[id]/comments.ts`

**Intent**: Confirmed participants submit a comment via form POST and return to the run page.

**Contract**: `POST` only. Invalid run UUID → redirect `/runs`. Unauthenticated → sign-in with `returnTo=/runs/{id}`. Parse `body` from `formData`. `CommentError` → `/runs/{id}?commentError=`; infra → `console.error` + fixed “Could not post comment” on the same param. Success → `/runs/{id}` (optionally hash later; not required). Copy `apply.ts` structure (`isUuid`, `createClient`, `getUser`) except the error query name.

#### 3. Like toggle route

**File**: `src/pages/api/runs/[id]/comments/[commentId]/like.ts`

**Intent**: Confirmed participants set liked true/false without a JSON client.

**Contract**: `POST`. Invalid run or comment UUID → redirect `/runs` or `/runs/{id}`. Form field `value` must be `"true"` or `"false"` (same as ban). Same auth/error/redirect pattern as comments create. Success → `/runs/{id}`.

#### 4. Admin delete comment route

**File**: `src/pages/api/admin/runs/[id]/comments/[commentId]/delete.ts`

**Intent**: Admins remove a single abusive comment without deleting the run.

**Contract**: `POST`. Invalid UUIDs → redirect `/runs`. No user → sign-in. `locals.profile.role !== "admin"` → redirect `/` (do not advertise). Then `deleteCommentAsAdmin`. Domain vs infra errors like `src/pages/api/admin/runs/[id]/delete.ts`, but redirect with `?commentError=` not `?error=`. Success → `/runs/{id}`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Confirmed participant POST comment on active run → row exists, redirect to `/runs/{id}`
- Guest POST → sign-in with `returnTo` back to the run
- Pending/denied or unseated organizer POST comment or like → user-facing domain error, no row
- Like `value=true` then `value=false` toggles the unique like row; double-submit does not 500
- Archived or past-grace POST comment/like → domain error (“no longer active” or equivalent)
- Admin delete removes comment + likes; non-admin hitting the admin URL is redirected home
- Banned user POST is stopped by middleware with “Your account is banned”
- `?commentError=` never contains PostgREST/Auth raw text

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Run page comments UI

### Overview

Show the thread only to readers in the locked ACL. Confirmed participants on active runs get compose + like. Admins get per-comment delete with confirm. Archived is read-only.

### Changes Required:

#### 1. Run detail loader

**File**: `src/pages/runs/[id].astro`

**Intent**: Fetch comments only when the viewer may read them; pass flags into one island. Do not leak the section to guests.

**Contract**:

- After the run loads, compute `canReadComments` as in Critical Implementation Details.
- If `canReadComments`, call `listCommentsForRun` with `user?.id ?? null`; otherwise skip the query.
- `canPostOrLike = own?.status === "confirmed" && !isArchived && !isBanned`.
- Render a Comments `<section>` (same card chrome as Participants) **only** if `canReadComments`, after Participants and before Admin.
- Read `commentError` from `Astro.url.searchParams.get("commentError")`. Pass it into the comments island. Leave `serverError` (`?error=`) for `RunParticipantActions` and the archived admin delete-run `Banner`.

#### 2. Comments island

**File**: `src/components/runs/RunComments.tsx` (new, `client:load`)

**Intent**: Interactive compose, like toggle, and admin delete using existing form primitives.

**Contract**:

- Props: `runId`, comments DTO list, `canPostOrLike`, `isAdmin`, `commentError`.
- List: chronological; author `NicknameLink`; body as text with `whitespace-pre-wrap` (React children — no `dangerouslySetInnerHTML`); like count for everyone who can see the section.
- Empty: “No comments yet.”
- Compose: `<form method="POST" action={`/api/runs/${runId}/comments`}>` textarea `name="body"` + `SubmitButton` only if `canPostOrLike`.
- Like: form POST to the like route with hidden `value` the **next** state (`"false"` if `likedByMe` else `"true"`). Control only if `canPostOrLike`; otherwise count only.
- Admin: per-comment delete form to the admin route; `window.confirm` before submit, same idea as `AdminRunControls`.
- Reuse `ServerError`, `SubmitButton`, `cn()`, `NicknameLink` from `src/components/NicknameLink.tsx`. Merge classes with `cn()` only.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest or pending/denied member on a public active run: no Comments section
- Confirmed participant on active run: sees list, can post (newlines preserved, HTML not interpreted), can toggle like (count updates after reload)
- Unseated organizer (not confirmed): sees list and counts, no compose, no like control
- Admin who is not confirmed: sees list, can delete with confirm, no compose/like unless also confirmed
- Archived confirmed participant: sees historical comments, no compose/like
- Author leaves the team (organizer leave-team): their old comments remain
- Author nicknames open `/players/{uuid}`
- Empty thread shows “No comments yet” plus compose when allowed
- Failed POST shows `ServerError` on the comments section (including archived admin delete)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None — `package.json` has no test runner. Do not add Vitest in this slice.

### Integration Tests:

- None automated. Phase 1 manual RLS checks (anon / confirmed / organizer / admin / archived / CHECK) are the integration stand-in.

### Manual Testing Steps:

1. Start local Supabase and `npm run dev`. Open an active run as a confirmed participant: post a comment, like it, unlike it, confirm nickname links to `/players/{uuid}`.
2. Open the same run as a guest and as a pending applicant: Comments section is absent.
3. As organizer, leave team; reload: comments still visible (read), compose gone.
4. Wait/archive or use an archived run: thread visible to confirmed/organizer/admin; compose and like gone.
5. As admin, delete one comment (confirm dialog); likes on it disappear; run remains.
6. As banned confirmed user: can still read if they can open the page; POST is blocked.

## Performance Considerations

KoG runs are small rosters; load every comment for the run (index `(run_id, created_at)`). No pagination in S-12. If a thread ever grows large, that is a later slice — do not add offset/cursor now.

## Migration Notes

New empty tables. No data backfill. `ON DELETE CASCADE` from `runs` means existing admin run-delete already removes comments. Rollback is `down` of this migration only (drop tables + helpers); no change to `run_participants` or `runs` columns.

This slice **resolves PRD open question #2 / S-12 Unknown** for implementation: readers are confirmed participants + admins + unseated organizers, not guests on public runs.

## References

- PRD: `context/foundation/prd.md` — FR-020, US-05, Access Control comments, open question #2
- Roadmap: `context/foundation/roadmap.md` — S-12
- Similar implementation: `context/archive/2026-07-31-apply-and-approve-participants/plan.md`
- Admin mutations: `context/archive/2026-08-07-admin-moderation-tools/plan.md`
- Nickname display: `context/archive/2026-08-20-user-profile/plan.md`
- RLS cycle helper: `supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql`
- Error redirects: `context/foundation/lessons.md`
- Progress contract: `.cursor/skills/10x-plan/references/progress-format.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema and RLS

#### Automated

- [x] 1.1 Migration applies cleanly on local Supabase (`npx supabase db reset` or `migration up`)
- [x] 1.2 `npm run db:types` regenerates without error; `run_comments` and `run_comment_likes` appear in `src/types/database.ts`
- [x] 1.3 `npm run lint` passes
- [x] 1.4 `npm run build` passes

#### Manual

- [x] 1.5 As `anon`: SELECT on either table returns zero rows (no grant/policy)
- [x] 1.6 As confirmed participant on an active run: INSERT comment (trimmed 1–1000 chars) and INSERT/DELETE own like succeed; INSERT on an archived run fails
- [x] 1.7 As unseated organizer: SELECT comments/likes succeeds; INSERT comment or like fails
- [x] 1.8 As admin: SELECT any comment; DELETE comment removes the row and cascaded likes
- [x] 1.9 CHECK rejects empty/whitespace-only and bodies longer than 1000 characters

### Phase 2: Service and API

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run build` passes

#### Manual

- [ ] 2.3 Confirmed participant POST comment on active run → row exists, redirect to `/runs/{id}`
- [ ] 2.4 Guest POST → sign-in with `returnTo` back to the run
- [ ] 2.5 Pending/denied or unseated organizer POST comment or like → user-facing domain error, no row
- [ ] 2.6 Like `value=true` then `value=false` toggles the unique like row; double-submit does not 500
- [ ] 2.7 Archived or past-grace POST comment/like → domain error (“no longer active” or equivalent)
- [ ] 2.8 Admin delete removes comment + likes; non-admin hitting the admin URL is redirected home
- [ ] 2.9 Banned user POST is stopped by middleware with “Your account is banned”
- [ ] 2.10 `?commentError=` never contains PostgREST/Auth raw text

### Phase 3: Run page comments UI

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 Guest or pending/denied member on a public active run: no Comments section
- [ ] 3.4 Confirmed participant on active run: sees list, can post (newlines preserved, HTML not interpreted), can toggle like (count updates after reload)
- [ ] 3.5 Unseated organizer (not confirmed): sees list and counts, no compose, no like control
- [ ] 3.6 Admin who is not confirmed: sees list, can delete with confirm, no compose/like unless also confirmed
- [ ] 3.7 Archived confirmed participant: sees historical comments, no compose/like
- [ ] 3.8 Author leaves the team (organizer leave-team): their old comments remain
- [ ] 3.9 Author nicknames open `/players/{uuid}`
- [ ] 3.10 Empty thread shows “No comments yet” plus compose when allowed
- [ ] 3.11 Failed POST shows `ServerError` on the comments section (including archived admin delete)
