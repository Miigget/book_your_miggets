<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Restricted run visibility Implementation Plan

- **Plan**: context/changes/restricted-run-visibility/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-24
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: e6199ed (p1) + 6e4bdbc (p2) + e24401c (p3) + 5b4eafb (epilogue)
- **Prior phase reviews**: all APPROVED, 0 findings (`impl-review-phase-1.md`, `impl-review-phase-2.md`, `impl-review-phase-3.md`)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

None.

## Evidence (full plan)

### Plan vs diff (`main...HEAD`)

- **In plan and in diff**: `supabase/migrations/20260824101006_restricted_run_visibility.sql`, `src/types/database.ts`, `src/lib/services/runs.ts`, `src/pages/api/runs/index.ts`, `src/pages/api/runs/[id]/index.ts`, `src/components/runs/CreateRunForm.tsx`, `src/pages/runs/new.astro`, `src/pages/runs/[id]/edit.astro`, `src/lib/run-list-sections.ts`, `src/pages/runs/index.astro`, `src/components/Welcome.astro`, `src/components/runs/ActiveRunCard.astro`, `src/pages/runs/[id].astro`, `src/pages/dashboard.astro`, `AGENTS.md`. All MATCH.
- **In diff but not in Changes Required**: change-folder process docs only (`plan.md`, `research.md`, `plan-brief.md`, phase reviews, `crew-decisions.md`). No extra product/API surface. `formatVisibility` / invite RPC wrappers / `parseInviteeIds` / `listPublicNicknamesByIds` implement the contract.
- **In plan but not in diff**: none. `src/middleware.ts` and comment services/policies are correctly unchanged. No `sync_run_invites`, no 403 on hidden runs, no comment-ACL widening, no `PROTECTED_ROUTES` prefix on `/runs`.

### Cross-phase seams

- Phase 2 consumes Phase 1 INVOKER RPCs only: invite-only create → `create_invite_only_run`; invite-only edit → `set_run_visibility_and_invites` instead of `updateRun` (`src/pages/api/runs/[id]/index.ts:85-89`). `updateRun` refuses `invite_only` (`src/lib/services/runs.ts:928-930`).
- `can_view_run` is never called from policies on `runs`; `can_view_run` never calls `is_run_in_active_window` (one-way: window helper → `can_view_run`). Comment INSERT still requires `is_confirmed_participant` **and** the window helper (`20260820092809_run_comments.sql`); a pending friend who can view a friends-only run cannot post comments.
- Phase 3 partitions rows RLS already returns. Guest `/runs` and Welcome always `{ publicOnly: true }`; signed-in `/runs` never does. `partitionActiveRuns` never puts `friends_only` / `invite_only` into Public; friend-admin is Friends-only (no Restricted duplicate).
- `canReadComments` stays confirmed / archived participant / organizer / admin (`src/pages/runs/[id].astro:92-93`). Detail 404 copy unchanged. Kick/decide/apply miss still `"Run not found or no longer active"`.
- Unverified-restricted gate is the same `RESTRICTED_VISIBILITY_UNVERIFIED` string on create and edit, plus `runs_insert_own` / `runs_update_own` WITH CHECK.

### Automated verification (re-run this review)

- **1.1–1.5 / 2.1–2.5 / 2.15 / 3.1–3.6** PASS — contracts still hold on the branch; `npm run lint` exit 0 (0 errors; pre-existing `no-console` warnings only); `npm run build` Complete.
- Phase 1 SQL smoke was re-run at phase-1 review (1.6–1.16) then smoke rows deleted. Not re-run here; migration and generated types unchanged since e6199ed.

### Manual verification

- **1.6–1.16** `[x]` with evidence in `reviews/impl-review-phase-1.md` (SQL + PostgREST anon).
- **2.6–2.14, 2.16** and **3.7–3.15** remain `- [ ]`. YOLO skipped UI click-through; unchecked is pending residual risk, not rubber-stamping. Not treated as Success Criteria FAIL.

### Residual (not findings)

1. Leftover `run_invites` after invite-only → public/friends-only via `updateRun` (plan forbade a paired invite-sync). Not a SELECT leak: `is_run_invitee` is only consulted when `visibility = invite_only`.
2. Shared unverified `?error=` still says “create …” on edit — contract required one string.
3. Phase 2/3 UI click-through not executed in YOLO.
4. Admin leftover Apply: `can_view_run` short-circuits for `is_admin()`; treated as existing admin privilege (detail + S-06 delete already in scope), not a hidden-run leak.

### What We're NOT Doing

Comments feature / comment SELECT widening, player labels, admin profile edits, new `/admin` runs index, mixing restricted into Public, live friendship on invite-only after unfriend, visibility lock after seats, auto-deleting pending on audience shrink, prefix-protecting `/runs`, Vitest/pgTAP, hand-edited `database.ts`, friend feeds/DMs/blocking — none present in the product diff.
