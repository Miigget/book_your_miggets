<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Mark a clan run completed

- **Plan**: context/changes/complete-clan-run/plan.md
- **Mode**: Deep
- **Date**: 2026-09-01
- **Verdict**: REVISE
- **Findings**: 0 critical, 4 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 13/13 existing modify-paths ✓, 2 new paths expected absent (`complete.ts`, timestamped migration), 18/18 live symbols ✓, brief↔plan ✓.

Verified against code: latest migration `20260901083000_clan_only_on_is_run_active_row.sql`; `runs_update_own` USING/WITH CHECK as cited; comment INSERT + screenshot INSERT + likes use `is_run_in_active_window` (audience-active ∧ `can_view_run`); `auto_join_run` miss returns `not_active`; `run_participants_delete_own_confirmed` and `run_participants_update_organizer` have no run-window; kick is UPDATE to `denied` (not a separate DELETE); `archive.ts` + `OrganizerRunLifecycleControls` confirm-dialog pattern; `RUN_SELECT` / `RunRow` / `runRowFromPublicRpc` lack `completed_at`; `loadActiveRunForMutation` and `requireActiveRun` use `isRunActive` only; `canPostOrLike` is confirmed ∧ !archived ∧ !banned; Clan section is `/runs` `clanRuns` via `ActiveRunCard`; Dashboard Incoming Edit is `showEdit && !isArchived` on `DashboardRunCard`.

Brief phases, crew-locked decisions (distinct `completed_at`, in-progress only, freeze roster/edit/extend, Archive still allowed, stamp-only, Completed chip, Archive-style confirm, SQL→API→UI, owner-only, no points), and “NOT doing” all match the plan body. Progress headings match Phase titles. Phase 3 Manual has six numbered success items vs five Progress rows (4+5 folded into 3.5).

Riskiest claims confirmed: putting `completed_at` on `is_run_active_row` / `is_run_in_active_window` would drop lists, free the 5-cap, and stop comments/screenshots. Actor must be organizer + current clan owner + `clan_only`, not `userOwnsClan` alone. Kick freeze is the organizer UPDATE policy, not a DELETE.

## Findings

### F1 — Phase 3 Manual success items vs Progress 1:1

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 Manual Verification vs `## Progress` Phase 3
- **Detail**: Phase body lists six numbered manual checks (including a standalone “other clan owner cannot complete”). Progress has five rows; `3.5` folds guest/non-member 404, public/friends-only no Complete, and other-clan-owner into one checkbox. `/10x-implement` treats Progress as the parse contract; a skipped 1:1 leaves the other-owner leak check easy to drop.
- **Fix**: Split Progress so other-clan-owner is its own `3.6` and shift admin to `3.7`, or merge Success Criteria bullets 4 and 5 into one bullet that matches current `3.5`.
- **Decision**: FIXED (Crew Lead YOLO — split Progress 3.6 other-clan-owner, 3.7 admin)

### F2 — Phase 1 SQL smoke skips the unbounded roster policies

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 Automated Verification / Progress 1.3
- **Detail**: Current State correctly notes apply INSERT uses `can_view_run` only (`run_participants_insert_self_pending` in `20260824101006`) and leave DELETE has no window (`run_participants_delete_own_confirmed` in `20260821094355`). Kick/decide use `run_participants_update_organizer` with no window (`kickParticipant` UPDATEs status to `denied`). Phase 1 smoke covers `auto_join_run` (DEFINER, bypasses INSERT RLS), `extend_run`, comment INSERT, and GRANT — not apply INSERT / leave DELETE / organizer UPDATE on a completed row. Forgetting those policy EXISTS lines would still pass 1.3.
- **Fix**: Add authenticated smokes on a completed clan-only run: pending INSERT fails; confirmed leave DELETE fails; organizer participant UPDATE (decide or kick) fails.
- **Decision**: FIXED (Crew Lead YOLO — authenticated apply/leave/kick smokes on completed row)

### F3 — Completed vs Archived chip precedence on Past

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 Completed chip + Manual 3.4
- **Detail**: `completedAt` on `RunListItem` is inherited by `ArchivedRunListItem`. Cards today key chips off `lifecyclePhase` (`DashboardRunCard.astro`, `RunPreviewCard.astro`). Success 3.4 says Past shows Archived. The chip contract says “when `completedAt` is set, show Completed; do not also show In progress” — it does not say Archived wins after Archive. A naive `completedAt ? Completed : In progress` shows Completed on Past and archived detail.
- **Fix**: Specify Archived wins: show Completed only when the run is still audience-active (`lifecyclePhase !== "archived"`). Past, Recent, and archived `/runs/{id}` stay Archived.
- **Decision**: FIXED (Crew Lead YOLO — Archived wins; Completed only while audience-active)

### F4 — `runRowFromPublicRpc` must stub `completed_at`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Run DTO + selects
- **Detail**: Phase 2 adds required `completed_at` to `RunRow` and `RUN_SELECT`, and says do not change `list_player_public_runs`. `runRowFromPublicRpc` (`src/lib/services/runs.ts`) builds a `RunRow` from the RPC, which has no `completed_at`. Typecheck/build (2.3 / 2.2) will fail until the mapper sets `completed_at: null`. Player-profile organized/member rows still get the column via `RUN_SELECT`.
- **Fix**: In the Phase 2 DTO contract, set `completed_at: null` in `runRowFromPublicRpc` (do not alter the RPC).
- **Decision**: FIXED (Crew Lead YOLO — `runRowFromPublicRpc` stubs `completed_at: null`)
