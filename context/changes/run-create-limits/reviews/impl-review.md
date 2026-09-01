<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Capacity 64 and schedule bounds (S-25)

- **Plan**: context/changes/run-create-limits/plan.md
- **Scope**: Phase 1–2 of 2 (full)
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: b4fd1d5 (Phase 1), 80924e9 (Phase 2)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Architecture | PASS |
| Safety & Quality | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

Planned files vs `b4fd1d5^..80924e9` (product + agent contract):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `src/lib/run-limits.ts` (new) | present (p1) | MATCH |
| `src/components/runs/CreateRunForm.tsx` | present (p1) | MATCH |
| `src/pages/api/runs/index.ts` | present (p1) | MATCH |
| `src/lib/services/runs.ts` (`prepareOwnedActiveRunPatch`) | present (p1) | MATCH |
| `AGENTS.md` (Hard Rules) | present (p2) | MATCH |

Extra in range: 10x ritual (`change.md`, `plan.md`, `plan-brief.md`, `crew-decisions.md`, `plan-review.md`) plus Phase 1 Progress SHA write-back in p2. Not product-scope creep. Missing vs plan: none. No migration. `run-lifecycle.ts` untouched. Edit API `src/pages/api/runs/[id]/index.ts` still only calls `updateRun` / `setRunVisibilityAndInvites` (no duplicated bounds).

Phase reviews: Phase 1 APPROVED (`reviews/impl-review-phase-1.md`), Phase 2 APPROVED (`reviews/impl-review-phase-2.md`). Full sweep re-read the same paths; Phase 2 did not touch Phase 1 code.

Locked Crew cuts verified in code + AGENTS.md:

- Create = future + ≤1 year; edit = `isRunActive` + ≤1 year (no future-only on edit). Past start on edit remains allowed.
- Client + API only; `run-limits.ts` has predicates + messages, no `RunError`, no Supabase/React.
- F1: callers `parseInt` then pass numbers; helper `===` on numbers; grandfather skip of ≤64 when unchanged (`isAllowedRunCapacity(capacity, existingCapacity)`).
- Same `now` on create for future + 1-year (form + API). Inclusive `setFullYear(+1)` via `oneYearAhead`.
- Invite-only create uses the same POST checks before `createInviteOnlyRun`. 5-active pre-check unchanged and still runs before bounds/insert.
- Grandfather >64 until capacity changes; roster-floor check unchanged.
- Form + API only; no Postgres CHECK; no Advanced dump; no `prd.md` rewrite.

## Automated verification

| Command | Result |
|---------|--------|
| `npm run lint` | PASS (exit 0; 0 errors, 188 pre-existing `no-console` / `prefer-class-list` warnings) |
| `npm run build` | PASS (exit 0; `astro build` complete) |

## Manual verification

Progress rows 1.3–1.10 and 2.3 remain `- [ ]`. YOLO skips the click-through (Crew locked). Not a reject reason.

Reviewer independently confirmed 2.3 against HEAD `AGENTS.md`: default/max 64, create vs edit schedule, form+API only, no CHECK implied, Advanced is not the home.

Residual risk (human click-through still owed): default 64 / reject 65+0 / past / >1y on create; in-progress edit with elapsed start; edit >1y; grandfather >64; invite-only same API messages; S-24 5-cap; no Advanced.

## Findings

None.

## Notes

- `fail()` / `new RunError(...)` wrap module message constants — matches `lessons.md` (intentional `?error=` copy, not raw infra `Error.message`).
- HTML `datetime-local` `min`/`max` use `formatLocalDatetimeValue` (local, not ISO); form keeps `noValidate`. Edit omits `min` so elapsed start can stay.
- `run-limits.ts` mirrors `run-lifecycle.ts` (constants + predicates + optional `now`).
- Direct PostgREST/SQL can still write unbounded capacity/start (accepted: no CHECK). Far-future existing `starts_at` has no grandfather.
- Code-ready for archive. Manual Progress rows stay open as residual risk.
