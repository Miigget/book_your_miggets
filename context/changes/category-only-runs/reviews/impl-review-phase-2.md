<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Category-only runs

- **Plan**: context/changes/category-only-runs/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations

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

## Verification

### Automated

| Check | Result |
|-------|--------|
| `npm run lint` | Pass (0 errors; 54 `no-console` warnings, same class as Phase 1; two new `console.error` sites on create insert/map lookup are required by the plan / lessons `?error=` rule). |
| `npx astro sync` | Pass. |
| `npm run build` | Pass. |

### Manual (Progress 2.3–2.7)

Not re-curled. Live local `runs` rows match the YOLO smoke outcomes after 2.6/2.7 transforms; constraint catalog matches the migration file.

| Progress | Result |
|----------|--------|
| 2.3 mapped create, `map_category` null | Pass via code (`normalize` clears category when map is set) + leftover `p2-both` / `p2-insane` map-only rows. Original `p2-mapped` was later converted by 2.6. |
| 2.4 category-only Insane + both-empty `?error=` | Code path MATCH: `normalizeRunMapAndCategory` throws `RunError("Pick a map or a category")`; insert mapper uses the same domain string; no `insertError.message` left. Both-empty leaves no row. |
| 2.5 both sent → map only | Live `p2-both`: `map_id` set, `map_category` null. |
| 2.6 edit XOR both directions | Live `p2-mapped` is now category-only Easy (mapped → empty map + Easy). Live `p2-insane` is now map-only (category-only → map clears category). |
| 2.7 grandfathered both-null edit | Planted row was XOR-saved: `p2-grand` is category-only `Mod`. Zero both-null rows remain. |

Progress 2.3–2.7 checkboxes are not rubber stamps: helper + APIs match the contract, and leftover smoke rows are XOR-valid in the expected post-edit shape.

## Plan vs diff

Commit `d4c1270` on `feature/category-only-runs` (parent `5d4f02c`).

- In plan and in diff: `src/lib/map-categories.ts` — MATCH. Tuple `Easy, Main, Hard, Insane, Extreme, Mod, Solo, Others` (same spelling/order as SQL CHECK). `isMapCategory`. No Supabase, no services (same shape as `run-lifecycle.ts`).
- In plan and in diff: `src/lib/services/runs.ts` — MATCH. Imports `isMapCategory` only (tuple not duplicated). `normalizeRunMapAndCategory`: trim, empty→null, map wins and clears category, both empty → `Pick a map or a category`, invalid catalog → `Category is invalid`. `RUN_SELECT` / `RunRow` / `RunListItem.mapCategory` / `runFieldsFromRow`. `matchesMapOrOrganizer` case-insensitive `includes` on stored `map_category`. `resolveRunTitle` unchanged. `UpdateRunInput.mapCategory`; `updateRun` always patches `map_id` and `map_category`. `mapRunMapCategoryConstraintError` + sibling `mapRunUpdateTriggerError`.
- In plan and in diff: `src/pages/api/runs/index.ts` — MATCH. Reads `map_category`, normalizes, INSERTs the pair, maps CHECK names to domain strings, otherwise `Could not create this run` + `console.error`. Raw `fail(insertError.message)` removed.
- In plan and in diff: `src/pages/api/runs/[id]/index.ts` — MATCH. `formString(..., "map_category")` passed into `updateRun`.
- In plan, not in this phase: `CreateRunForm` category `<select>` / hidden `map_category` — expected. Crew Lead: Phase 3. Absence is not a miss.
- In diff, not in plan: create map-lookup failure also stopped echoing PostgREST (`Could not validate map: ${mapError.message}` → generic + `console.error`). Benign; matches `lessons.md`. `plan.md` Progress checkboxes — implement ritual, not product scope creep.

Island gate: `CreateRunForm.tsx` still type-imports `MapPickerItem` from `@/lib/services/runs` only. No value import of `runs.ts`. No `MAP_CATEGORIES` import yet (Phase 3). `MapPicker.tsx` still type-only.

## Safety notes (not findings)

- Live XOR `runs_map_or_category_required`: `pg_constraint.convalidated` is **false**; definition still `NOT VALID`. Catalog `runs_map_category_catalog` is **VALID**. 2.7 drop/re-add did not re-add the XOR check as VALID.
- Planted both-null row was not left both-null. After the valid XOR save it is `p2-grand` / `Mod`. Local `runs`: 0 both-null, 2 map-only, 2 category-only, 0 both-set. Production-shaped XOR data; local smoke titles only.
- Phase 3 3.6 (grandfathered neither on the card) has **no** both-null row locally unless the implementer re-plants. That is a Phase 3 smoke setup note, not a Phase 2 defect.
- `updateRun` always writes `map_category`, so a grandfathered title-only save cannot skip the column and sneak past the NOT VALID check.
- Lessons `?error=` rule: create insert and map-lookup no longer forward PostgREST. `fail(err.message)` remains only for `RunError` / `ProfileError` domain strings.

## Decision

All findings PENDING: none. YOLO path: Done (no triage). `change.md` stays `implementing` — this is a phase review, not a full-plan impl-review.
