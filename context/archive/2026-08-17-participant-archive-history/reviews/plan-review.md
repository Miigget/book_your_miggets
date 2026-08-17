<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Participant archive history Implementation Plan

- **Plan**: context/changes/participant-archive-history/plan.md
- **Mode**: Deep
- **Date**: 2026-08-17
- **Verdict**: SOUND
- **Findings**: 0 critical 1 warning 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

Grounding: 11/11 existing paths ✓ (`src/pages/runs/history.astro` is new, expected absent), 9/9 symbols ✓ (`mapRunRow`, `listActiveRuns`, `getActiveRunById`, `getRunLifecyclePhase`, `isRunActive`, `PROTECTED_ROUTES`, `getOwnParticipation`, `RUN_SELECT`, `runs_select_own_organizer`), brief↔plan ✓.

Code verification (explore): organizer/admin SELECT still returns past-grace rows; `run_participants` confirmed SELECT has no active-window join; mutations already gate on `loadActiveRunForMutation`; `RUN_SELECT` omits `archived_at`; `PROTECTED_ROUTES` is `startsWith` and already includes `/admin`; `mapRunRow` drops time-archived rows and never sees `archived_at`.

## Findings

### F1 — Dual-mode detail 500s on invalid UUID before archive loader runs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 detail loader + Phase 3 dual-mode `/runs/[id]`
- **Detail**: Phase 2 contract says `getArchivedRunForParticipant` returns `null` for invalid UUID so the page 404s. Phase 3 tries `getActiveRunById` first. That helper has no `isUuid` guard (`src/lib/services/runs.ts` `getActiveRunById`); PostgREST `22P02` throws, and `[id].astro`’s `catch` sets `pageError = "load"` (HTTP 500). Mutation helpers already use `isUuid` (`loadActiveRunForMutation`). Until `history.astro` exists, `/runs/history` itself hits this 500 path. After it exists, any non-UUID `/runs/{id}` still never reaches the archived 404 contract.
- **Fix**: Add `isUuid` early-return `null` to `getActiveRunById` (and the new archived loader) so dual-mode 404s, matching API/mutation helpers.
- **Decision**: FIXED — Fix in plan (Crew Lead q1: fix). `isUuid` early-return `null` on `getActiveRunById` and `getArchivedRunForParticipant`; dual-mode 404 not 500. Progress 2.9 added.

## Triage

```
═══════════════════════════════════════════════════════════
  TRIAGE COMPLETE
═══════════════════════════════════════════════════════════

  Fixed:     F1 (Fix in plan)   (1)
  Skipped:                      (0)
  Accepted:                     (0)
  Dismissed:                    (0)

  ► Verdict after fixes: SOUND
═══════════════════════════════════════════════════════════
```

