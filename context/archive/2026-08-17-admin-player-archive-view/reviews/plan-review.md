<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Admin player archive view Implementation Plan

- **Plan**: context/changes/admin-player-archive-view/plan.md
- **Mode**: Deep
- **Date**: 2026-08-17
- **Verdict**: SOUND
- **Findings**: 0 critical 0 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 6/6 existing modify paths ✓ (`src/pages/admin/users/[id].astro` is new, expected absent), 3/3 referenced paths ✓ (`src/middleware.ts`, `src/pages/runs/history.astro`, `src/lib/services/participants.ts`), 12/12 symbols ✓ (`listArchivedRunsForParticipant`, `getArchivedRunForParticipant`, `mapArchivedRunRow`, `mapRunRow`, `getActiveRunById`, `isUuid`, `AdminRunControls`, `AdminError`, `PROTECTED_ROUTES`, `getOwnParticipation`, `runs_select_admin`, `runs_select_own_organizer`), brief↔plan ✓.

Progress↔Phase: one `## Progress` heading; Phase 1–2 names match; every Success Criteria bullet has a numbered Progress row; no `- [ ]` outside Progress — PASS.

Contradiction / promise-gap: FR-016 profile + confirmed archive list + admin `/runs/{id}` bypass + guest/member 404 + keep Delete are each backed by a phase; no "NOT doing" item reappears in phases — PASS.

Code verification of riskiest claims (inline against source; no nested subagent):

- **Admin reuse of `listArchivedRunsForParticipant(supabase, playerId)`** — confirmed. Helper takes arbitrary `userId` (`src/lib/services/runs.ts:260-296`). `run_participants_select_admin` and `runs_select_admin` (`20260729134008_run_domain_schema.sql:210-214, 288-292`) return all rows. Member clients do not get the target's full archive (archived `runs` SELECT is still viewer-scoped via confirmed-participant / organizer policies). Page must stay behind `/admin` 404. Plan's "`is_confirmed_participant` uses the viewer's `auth.uid()`" is slightly imprecise (the list helper queries `user_id = playerId`, then RLS filters `runs`) but the security conclusion is correct.
- **Ungated `getArchivedRunForAdmin` would leak S-08** — confirmed. `runs_select_own_organizer` (`:204-208`) has no active-window predicate. Page-gate on `locals.profile.role === "admin"` is required. Do not weaken `getArchivedRunForParticipant` (`runs.ts:302-321` still requires a confirmed seat).
- **`AdminRunControls` already renders when the page loaded** — confirmed. `src/pages/runs/[id].astro:255-258` has no archived guard. Delete API (`src/pages/api/admin/runs/[id]/delete.ts`) and `deleteRunAsAdmin` have no active-window filter. Keeping Delete on bypass matches FR-010.
- **Archived back link is always `/runs/history` today** — confirmed (`[id].astro:107-113`). Split by loader hit is a real Phase 2 change. `isAdmin` is currently computed *after* the fetch (`:82`); the plan correctly requires computing it before the third attempt.
- **`getProfileForAdmin` from `profiles`** — confirmed. `profiles_select_admin` + `profiles_select_own`. Banned users remain rows (`is_banned` flag). Selecting only `id, nickname` matches profile-chrome A.
- **Middleware already covers `/admin/users/{id}`** — confirmed. `pathname.startsWith("/admin")` (`src/middleware.ts:52-55`); `PROTECTED_ROUTES` includes `/admin` with `startsWith` (`:4, 46`). Guest → sign-in; member → 404. No `PROTECTED_ROUTES` edit needed.
- **`mapRunRow` still drops archived** — confirmed (`runs.ts:143-148`). Archive paths must keep `mapArchivedRunRow`.
- **Blast radius**: `getArchivedRunForParticipant` callers = `[id].astro` only. `listArchivedRunsForParticipant` callers = `history.astro` (+ new profile page). `AdminRunControls` callers = `[id].astro` only. No surprise importers. Pattern matches S-06 `admin.ts` + S-07 archive loaders; no new abstraction.

## Findings

### F1 — Archived detail swallows delete `?error=`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Dual-mode detail (`src/pages/runs/[id].astro`)
- **Detail**: `[id].astro` reads `?error=` into `serverError` but only passes it to `RunParticipantActions`, which archived mode omits. `AdminRunControls` has no error UI. Failed `POST /api/admin/runs/{id}/delete` redirects back to `/runs/{id}?error=…` (`delete.ts` `fail()`). That path already exists for a seated admin on S-07 archived detail; this slice makes it the primary admin archive UX. Success still redirects to `/runs?notice=`, so the happy path is fine.
- **Fix**: On archived (or whenever `AdminRunControls` renders), show `serverError` with the existing `Banner` (same pattern as `/admin` and `/runs`). Do not pass it only through `RunParticipantActions`.
- **Decision**: PENDING

## Triage

YOLO — report saved only; interactive triage skipped. Observation F1 is non-blocking. Implement may proceed; optionally apply F1 during Phase 2.
