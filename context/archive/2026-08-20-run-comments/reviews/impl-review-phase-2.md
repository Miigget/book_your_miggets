<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Run comments and likes

- **Plan**: context/changes/run-comments/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: b004669

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

Phase 2 product change is `src/lib/services/comments.ts` plus three form-POST routes. Commit `b004669` also flipped Phase 2 Progress checkboxes in `plan.md` (SHA suffixes ` — b004669` are dirty-tree ritual, same as Phase 1). No Phase 3 files (`src/pages/runs/[id].astro` comments loader, `RunComments` island). Phase 1 migration `supabase/migrations/20260820092809_run_comments.sql` and `src/types/database.ts` untouched. `participants.ts` last product commit remains `3529534` (not this slice).

Dirty working tree is plan Progress SHA suffixes, `crew-decisions.md`, and untracked `impl-review-phase-1.md` — ritual, not a defect.

### Plan vs actual (Phase 2)

| Planned item | Verdict |
|--------------|---------|
| `CommentError` same shape as `ParticipantError` | MATCH — `extends Error`, `this.name = "CommentError"` (`comments.ts` 7–12 vs `participants.ts` 25–30) |
| DTO `id`, `runId`, `authorId`, `nickname`, `body`, `createdAt`, `likeCount`, `likedByMe` | MATCH — `RunComment` (`comments.ts` 14–23); `nickname` is `string \| null` like participant nicknames |
| `listCommentsForRun`: `created_at` asc, embed `public_profiles`, like counts + `likedByMe`, empty RLS → `[]`, no pagination, no GET API | MATCH — `COMMENT_SELECT` + second `run_comment_likes` query (`81–129`); throws only on PostgREST error (same as `listConfirmedParticipants`); not exported as a route |
| `createComment`: trim; empty / >1000 → `CommentError`; confirmed via exported `getOwnParticipation`; active window via `activeWindowStartsAfter()` + `CommentError("Run not found or no longer active")`; insert `author_id = userId`; zero-row → domain error | MATCH (`132–165`, helpers `51–79`) |
| Do **not** import `loadActiveRunForMutation` or `ParticipantError`; do **not** edit `participants.ts` | MATCH — imports are `activeWindowStartsAfter`, `getOwnParticipation`, `AppSupabaseClient` only |
| `setCommentLiked`: same confirmed + active gates; `23505` idempotent like; missing unlike succeeds; verify like `run_id` matches `runId` | MATCH (`167–224`); comment lookup + `comment?.run_id !== runId` → `CommentError("Comment not found")`; insert/delete also pass `run_id` |
| `deleteCommentAsAdmin`: delete + `.select("id")`; zero rows → `CommentError` | MATCH (`226–246`); scoped `.eq("id").eq("run_id")`; infra logged then mapped to `CommentError` like `deleteRunAsAdmin` |
| POST `/api/runs/[id]/comments.ts`: invalid UUID → `/runs`; guest → sign-in `returnTo=/runs/{id}`; `body` from form; `CommentError` → `?commentError=`; infra → `console.error` + “Could not post comment”; copy `apply.ts` except query name | MATCH |
| POST like: invalid run UUID → `/runs`; invalid comment UUID → `/runs/{id}`; `value` `"true"` \| `"false"` (ban pattern); same auth/error/redirect | MATCH |
| POST admin delete: invalid UUIDs → `/runs`; no user → sign-in; non-admin → `/`; `?commentError=` not `?error=` | MATCH — copies `src/pages/api/admin/runs/[id]/delete.ts` including no `returnTo` on sign-in |
| What we're not doing: JSON GET, `PROTECTED_ROUTES`, Vitest, `service_role`, author edit/delete, pagination | MATCH — three `POST` exports only; middleware / `PROTECTED_ROUTES` not in commit |

### Safety & patterns

- Cookie-session `createClient` only. No `service_role`. Banned POSTs still hit existing middleware (`POST` + `/api/` minus `/api/auth/` → `?error=Your account is banned`).
- Post/like gated three times: `getUser`, service (`getOwnParticipation` + active window), RLS (`is_confirmed_participant` / `is_run_in_active_window` / `auth.uid()`). Admin delete: `locals.user` + `role === "admin"` (redirect `/`, do not advertise) + RLS `is_admin()` + scoped `(id, run_id)`.
- `?commentError=` receives `CommentError.message` (fixed domain copy) or fixed infra strings. PostgREST/`Error.message` stays in `console.error`. `lessons.md` holds at the HTTP boundary.
- Like double-submit: unique `23505` returns success. Unlike of an absent row does not throw. Composite FK keeps denormalized `run_id` honest.
- Hard-delete is the planned takedown path; likes cascade from Phase 1 FK. Not an unscoped wipe.
- List is two queries (comments + likes for the run), not N+1. Unbounded list is planned (KoG roster size).
- `CommentError` vs `ParticipantError`; `?commentError=` vs `?error=`; create copies `apply.ts`; like `value` copies `ban.ts`; admin gate copies `delete.ts`.

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 2.1 `npm run lint` | PASS — exit 0; 48 pre-existing `no-console` warnings (4 in Phase 2 files: service delete + three routes, same `console.error` infra pattern as `apply.ts` / `delete.ts`); 0 errors |
| 2.2 `npm run build` | PASS — `astro build` complete |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 2.3 Confirmed participant POST comment on active run | `[x]` | Not re-curled. Code path: trim + confirmed + active + insert; success redirect `/runs/{id}` |
| 2.4 Guest POST → sign-in with `returnTo` | `[x]` | Code: `comments.ts` / `like.ts` redirect `/auth/signin?returnTo=/runs/{id}` after UUID check |
| 2.5 Pending/denied or unseated organizer POST | `[x]` | `requireConfirmedParticipant` → `CommentError`; RLS INSERT also requires confirmed |
| 2.6 Like true then false; double-submit does not 500 | `[x]` | `value` must be `"true"` \| `"false"`; `23505` swallowed; unlike ignores zero rows |
| 2.7 Archived or past-grace POST | `[x]` | `requireActiveRun` uses `archived_at` null + `starts_at > activeWindowStartsAfter()`; throws `CommentError("Run not found or no longer active")` |
| 2.8 Admin delete; non-admin → home | `[x]` | `deleteCommentAsAdmin` scoped delete; non-admin `locals.profile.role !== "admin"` → `/` |
| 2.9 Banned POST stopped by middleware | `[x]` | Middleware unchanged; `/api/runs/.../comments` is under `/api/` and not `/api/auth/` |
| 2.10 `?commentError=` never contains PostgREST/Auth raw text | `[x]` | Routes put `CommentError.message` or fixed copy only; infra logged server-side |

Crew-decisions: implementer curl-verified 2.3–2.10. This review did not replay HTTP against a running app (YOLO human-action skip).

## Findings

None.

## Residual risk

Curl/UI for 2.3–2.10 was not re-executed this review. Route + service contracts match the plan; implementer log stands in. Banned-user message still uses middleware `?error=` (not `?commentError=`) — that is the existing gate the plan named, not a leak of PostgREST text.

Phase 3 footguns (not Phase 2 defects): `listCommentsForRun` throws `Error` with PostgREST text on query failure (same as `listConfirmedParticipants`). Anon has no GRANT, so a guest session would throw rather than `[]`. The page must call list only when `canReadComments` and must not put `err.message` on the page. Comment `body` is stored raw; render as React text (`whitespace-pre-wrap`), not `dangerouslySetInnerHTML` / `set:html` — already in the Phase 3 contract.

## Proceed

YOLO Done path: report saved; no triage (zero findings). `change.md` stays `implementing` (phase-scoped review; full-plan `impl_reviewed` is after all phases). Next stage is implement Phase 3.
