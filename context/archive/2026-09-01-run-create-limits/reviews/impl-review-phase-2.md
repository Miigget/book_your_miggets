<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Capacity 64 and schedule bounds (S-25)

- **Plan**: context/changes/run-create-limits/plan.md
- **Scope**: Phase 2 of 2
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 80924e9 (`docs(run-create-limits): Agent contract (p2)`)

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

Planned Phase 2 files vs `80924e9`:

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `AGENTS.md` (Hard Rules) | present | MATCH |

Extra in the commit: `context/changes/run-create-limits/plan.md` Progress write-back (Phase 1 `1.1`/`1.2` SHAs + Phase 2 `2.1`/`2.2` checked). 10x ritual, not product-scope creep. Missing vs Phase 2: none. No `prd.md` rewrite. No migration.

Inserted into the existing Hard Rules private-pages bullet (after the 5-active sentence, which was not rewritten):

> Organizer create/edit capacity (`max_participants`) is an integer 1–64 (create default 64); an existing value > 64 may stay until the organizer changes it. Create `starts_at` must be in the future and ≤ 1 year ahead. Edit `starts_at` must keep the run audience-active (`isRunActive`) and ≤ 1 year ahead (past start allowed). These capacity and schedule guards live on the existing create/edit form fields and the matching API — form + API only; there is no Postgres CHECK and no migration.

Locked Crew cuts:

- Default/max 64: integer **1–64**, create default **64**.
- Create vs edit schedule: create = future + ≤ 1 year; edit = `isRunActive` + ≤ 1 year (past start allowed).
- Form + API only: existing create/edit form fields + matching API.
- No Postgres CHECK implied: explicit “there is no Postgres CHECK and no migration.”
- No Advanced as home: home is “existing create/edit form fields,” not an Advanced dump (the word Advanced is not used; the home is still the flat form).

Grandfather (>64 until changed) and edit past-start are extra vs the Phase 2 contract one-liner and match Desired End State / Phase 1. Strengthens the agent contract; not drift.

Phase 1 code paths were not touched. Docs-only; no interaction break.

Uncommitted at review time: Progress SHA suffix on `2.1`/`2.2` (`— 80924e9`) in working-tree `plan.md`. Not treated as drift. `change.md` left `implementing` (Crew lock: phase review only).

## Automated verification

| Command | Result |
|---------|--------|
| `npm run lint` | PASS (exit 0; 0 errors, 188 pre-existing `no-console` / `prefer-class-list` warnings) |
| `npm run build` | PASS (exit 0; `astro build` complete) |

## Manual verification

Progress row 2.3 remains `- [ ]`. YOLO skips the human eyeball (Crew locked). Not a reject reason.

Reviewer independently confirmed 2.3 against HEAD `AGENTS.md`: default/max 64, create vs edit schedule, form+API only, no CHECK implied, Advanced is not the home. Residual risk: none beyond the skipped human read of the same paragraph.

## Findings

None.

## Notes

- Pattern: new invariants spliced into the existing dense Hard Rules bullet, same style as the 5-active sentence immediately before them.
- `prd.md` still the product-scope pointer; FR-006/FR-007 numbering untouched (`prd-v2.md` remains S-25 source).
- Full-plan impl-review is still owed after both phases; this file is Phase 2 only.
