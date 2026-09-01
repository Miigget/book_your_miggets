<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Capacity 64 and schedule bounds (S-25)

- **Plan**: context/changes/run-create-limits/plan.md
- **Mode**: Deep
- **Date**: 2026-09-01
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

Grounding: 7/7 existing paths ✓ (`CreateRunForm.tsx`, `src/pages/api/runs/index.ts`, `src/pages/api/runs/[id]/index.ts`, `src/lib/services/runs.ts`, `src/lib/run-lifecycle.ts`, `src/components/auth/FormField.tsx`, `AGENTS.md`; `src/lib/run-limits.ts` new as specified), 6/6 symbols ✓ (`prepareOwnedActiveRunPatch`, `isRunActive`, `createInviteOnlyRun`, `parseLocalDatetime`, `RunError`, `fail`), brief↔plan ✓ (locked Crew cuts match: LOW, create vs edit clocks, client+API only, grandfather, `setFullYear(+1)`, lint+build, no Advanced/S-24/S-26/Vitest).

Code verification: create POST validates `starts_at` / `max_participants` before both `.insert()` and `createInviteOnlyRun` (`src/pages/api/runs/index.ts` 162–196). `isRunActive` voids `startsAt` (`src/lib/run-lifecycle.ts` 24–36). `prepareOwnedActiveRunPatch` is the sole organizer edit gate (private; `updateRun` + `setRunVisibilityAndInvites` only). Create default capacity is `"2"`; checks are `> 0` plus edit roster floor. `FormField` has no `min`/`max`. No extra TS writers of capacity/start beyond the plan’s three sites.

## Findings

### F1 — Grandfather compare must use parsed integers

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details — Grandfather; Phase 1 helper contract
- **Detail**: Plan says skip ≤64 when `maxParticipants === existing.max_participants`. Form state `maxParticipants` is a **string** (`CreateRunForm.tsx` L81); `edit.maxParticipants` / `existing.max_participants` are **numbers**. Today’s roster floor is safe because it `parseInt`s first, then compares numbers (`CreateRunForm.tsx` 134–137; `runs.ts` 1043–1066). A naive `===` on raw form state would always fail and treat a grandfathered 80 as a change. The helper contract already says “integer … optional existingCapacity”; implementer must parse before compare (do not put `RunError` in `run-limits.ts`).
- **Fix**: Helper signature takes numbers (post-`parseInt`); form/API parse first, then call — same order as the roster-floor check. Capture one `now` for create’s future + 1-year checks.
- **Decision**: PENDING

## Notes for implement

- Copy island-safe shape from `src/lib/run-lifecycle.ts` (constants + predicates, no Supabase/React). Put user-facing strings in `run-limits.ts`; API/edit still wrap with `fail(...)` / `new RunError(message)` — do not leak raw `Error.message`.
- Optional `datetime-local` `min`/`max` are hints only (`noValidate`). If added, use local strings via `formatLocalDatetimeValue`, not ISO (the hidden field is ISO).
- No migration: PostgREST can still write unbounded values (accepted). Far-future existing `starts_at` has no grandfather — any edit Save fails until start is pulled in.
- YOLO skips Progress Manual rows 1.3–1.10 and 2.3; residual risk stays on those checkboxes.
