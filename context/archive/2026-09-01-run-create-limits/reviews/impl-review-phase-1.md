<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Capacity 64 and schedule bounds (S-25)

- **Plan**: context/changes/run-create-limits/plan.md
- **Scope**: Phase 1 of 2
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: b4fd1d5 (`feat(run-create-limits): Shared helpers and create/edit wiring (p1)`)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

Planned Phase 1 files vs `b4fd1d5` (code only):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `src/lib/run-limits.ts` (new) | present | MATCH |
| `src/components/runs/CreateRunForm.tsx` | present | MATCH |
| `src/pages/api/runs/index.ts` | present | MATCH |
| `src/lib/services/runs.ts` (`prepareOwnedActiveRunPatch`) | present | MATCH |

Extra in the commit: `context/changes/run-create-limits/*` from earlier 10x stages (not product-scope creep). Missing vs Phase 1: none. `AGENTS.md` and migrations are Phase 2 / out of scope.

Locked Crew cuts verified in code:

- Create = future + ≤1 year; edit = `isRunActive` + ≤1 year (no future-only on edit).
- Client + API only; `run-limits.ts` has predicates + messages, no `RunError`, no Supabase/React.
- F1: callers `parseInt` then pass numbers; helper `===` on numbers; grandfather skip of ≤64 when unchanged.
- Same `now` on create for future + 1-year (form + API). Inclusive `setFullYear(+1)`.
- Invite-only create uses the same POST checks before `createInviteOnlyRun`. Edit API `[id]` still only calls `updateRun` / `setRunVisibilityAndInvites` (no duplicated bounds).
- 5-active pre-check unchanged. No Advanced UI. No migration. `isRunActive` / `run-lifecycle.ts` untouched.

Uncommitted: Progress SHA write-back on `plan.md` (`1.1`/`1.2` — `b4fd1d5`). Not treated as drift.

## Automated verification

| Command | Result |
|---------|--------|
| `npm run lint` | PASS (exit 0; 0 errors, 188 pre-existing `no-console` warnings) |
| `npm run build` | PASS (exit 0; `astro build` complete) |

## Manual verification

Progress rows 1.3–1.10 remain `- [ ]`. YOLO skips the click-through (Crew locked). Not a reject reason. Residual risk: default 64 / reject 65+0 / past / >1y on create; in-progress edit with elapsed start; edit >1y; grandfather >64; invite-only same API messages; S-24 5-cap; no Advanced.

## Findings

None.

## Notes

- `fail()` / `new RunError(...)` wrap module message constants — matches `lessons.md` (intentional `?error=` copy, not raw infra `Error.message`).
- HTML `datetime-local` `min`/`max` use `formatLocalDatetimeValue` (local, not ISO); form keeps `noValidate`. Edit omits `min` so elapsed start can stay.
- Phase 2 (`AGENTS.md`) is not in this review.
