<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Run comments and likes

- **Plan**: context/changes/run-comments/plan.md
- **Mode**: Deep
- **Date**: 2026-08-20
- **Verdict**: SOUND (after triage: REVISE → SOUND)
- **Findings**: 0 critical 2 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS (was WARNING; F2 fixed) |
| Plan Completeness | PASS (was WARNING; F1 fixed) |

## Grounding

Grounding: 10/10 existing paths ✓, 8/8 symbols ✓, brief↔plan ✓

Existing paths listed: `src/pages/runs/[id].astro`, `src/middleware.ts`, `src/lib/services/participants.ts`, `src/lib/services/admin.ts`, `src/lib/run-lifecycle.ts`, `src/types/database.ts`, `src/components/NicknameLink.tsx`, `src/pages/api/runs/[id]/apply.ts`, `src/pages/api/admin/runs/[id]/delete.ts`, `supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql`. New files in the plan correctly do not exist yet.

Symbols confirmed: `is_confirmed_participant`, `is_admin()`, `is_not_banned()`, `PROTECTED_ROUTES`, `loadActiveRunForMutation`, `PARTICIPANT_SELECT`, `getOwnParticipation`, `archivedSource`. `loadActiveRunForMutation` exists but is module-private (see F1).

Brief↔plan: read ACL, post/like gates, archived read-only, append-only, admin hard-delete, likes UI, phases, and out-of-scope list match. Brief already names shared `?error=` as a risk; Phase 3 still does not resolve it (see F2).

Codebase verification (deep): archived `own` skip, active-window vs `isArchived`, DEFINER helper shape, `public_profiles` embed, and apply/ban/admin-delete patterns all confirm. `/api/admin/*` is not covered by the `/admin` page 404 gate; copying `delete.ts` (`locals.profile.role !== "admin"` → `/`) is the correct pattern.

## Findings

### F1 — `loadActiveRunForMutation` cannot be called as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Comments service
- **Detail**: `createComment` / `setCommentLiked` are told to require confirmed via `getOwnParticipation` **and** `loadActiveRunForMutation`. That helper is `async function` (not exported) in `src/lib/services/participants.ts` and throws `ParticipantError`. Comment POST routes are specified to catch `CommentError` only, then `console.error` + fixed “Could not post comment”. Following the plan literally either fails TypeScript (private import) or maps archived/past-grace writes to the generic infra string, missing Phase 2 criterion 2.7 (“no longer active” or equivalent). `activeWindowStartsAfter()` in `src/lib/run-lifecycle.ts` is already public and is what `loadActiveRunForMutation` uses.
- **Fix A ⭐ Recommended**: In `comments.ts`, query the active window with `activeWindowStartsAfter()` and throw `CommentError` (“Run not found or no longer active”). Confirm the seat with exported `getOwnParticipation`. Do not import `loadActiveRunForMutation` or `ParticipantError`; do not edit `participants.ts`.
  - Strength: Preserves `CommentError` for 2.7; zero extra blast radius; matches apply’s predicate without coupling error classes.
  - Tradeoff: The active-window query is duplicated (~15 lines).
  - Confidence: HIGH — same `.is("archived_at", null).gt("starts_at", activeWindowStartsAfter())` already lives in `loadActiveRunForMutation` and `getActiveRunById`.
  - Blind spot: None significant.
- **Fix B**: Extract a shared helper that returns the run row or `null` (no throw); both `participants.ts` and `comments.ts` map null to their own Error class.
  - Strength: Single predicate; future mutations reuse it.
  - Tradeoff: Extra file touch and a small refactor of apply/leave/decide in this slice.
  - Confidence: HIGH — extraction is mechanical.
  - Blind spot: Easy to over-scope the extract (join_mode / organizer_id vs comments which only need existence).
- **Decision**: FIXED via Fix A

### F2 — Shared `?error=` duplicates on active runs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Run detail loader / Comments island
- **Detail**: `[id].astro` already passes `serverError` into `RunParticipantActions` on active runs (`ServerError` at the top of that island). Phase 3 also requires passing `serverError` into `RunComments` so archived admin-delete failures are visible. For a confirmed participant on an active run both islands mount, so a failed comment/like (or apply) would render the same banner twice. The brief lists this as an open risk; the phase contract does not pick a routing rule. Archived admin delete-run still uses a `Banner` in the admin card; a third copy is possible if comment-delete errors stay on `?error=`.
- **Fix A ⭐ Recommended**: New routes redirect with `?commentError=`; `RunComments` reads that param. Leave `?error=` for apply/leave/decide and admin delete-run (existing archived `Banner`).
  - Strength: No change to current apply UX; comments errors land only on the comments section; archived delete-run banner stays unique.
  - Tradeoff: Second query-param name to keep consistent in three new routes.
  - Confidence: HIGH — isolated to new endpoints; existing `?error=` consumers unchanged.
  - Blind spot: Banned-POST middleware still appends `?error=` (“Your account is banned”) and would show on `RunParticipantActions` only — acceptable, not a comments-section miss.
- **Fix B**: One page-level `Banner` for `?error=` on `[id].astro`; stop passing `serverError` into islands (including comments).
  - Strength: Single banner forever; no new param.
  - Tradeoff: Moves apply/leave errors out of `RunParticipantActions`; touches existing island props.
  - Confidence: MEDIUM — visual placement of apply errors would change.
  - Blind spot: Archived admin card currently has its own `Banner`; would need a rule so it does not double with the page-level one.
- **Decision**: FIXED via Fix A

## Triage

- F1: FIXED via Fix A
- F2: FIXED via Fix A

Verdict after fixes: SOUND
