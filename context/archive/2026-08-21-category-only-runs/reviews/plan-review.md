<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Category-only runs Implementation Plan

- **Plan**: context/changes/category-only-runs/plan.md
- **Mode**: Deep
- **Date**: 2026-08-21
- **Verdict**: SOUND
- **Findings**: 0 critical 2 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 15/15 existing paths ✓ (new migration is create-at-implement), 11/11 symbols ✓, brief↔plan ✓

Symbols checked: `RUN_SELECT`, `RunRow`, `RunListItem`, `runFieldsFromRow`, `matchesMapOrOrganizer`, `resolveRunTitle`, `UpdateRunInput`, `updateRun`, `mapRunUpdateTriggerError`, `CreateRunFormEditValues`, `insertError.message`.

Riskiest claims vs code:

- S-13 UPDATE grant omits `map_category` — confirmed `supabase/migrations/20260820124849_runs_update_active_invariants.sql:37-44`.
- Create POST forwards `insertError.message` — confirmed `src/pages/api/runs/index.ts:128-129`.
- Map-row surfaces — seven sites; public `/runs` uses `ActiveRunCard.astro`; all listed.
- `matchesMapOrOrganizer` is map name + nickname only — confirmed `src/lib/services/runs.ts:160-164`.
- No other app `UPDATE` on `runs`; archival is computed, not stamped — confirmed.
- Create/edit islands type-import `runs.ts` only — confirmed; `JOIN_MODES` is duplicated in the form, not value-imported.
- KoG seed has exactly eight DIFF strings (Easy, Main, Hard, Insane, Extreme, Mod, Solo, Others).
- XOR CHECK `NOT VALID` is required: `map_id` is already nullable.

## Findings

### F1 — MAP_CATEGORIES must not be value-imported from runs.ts into the island

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Shared catalog list and normalizer; Phase 3 — Create/edit form
- **Detail**: Phase 2 originally exported `MAP_CATEGORIES` from `src/lib/services/runs.ts` and Phase 3 told CreateRunForm to use that const. CreateRunForm.tsx and MapPicker.tsx only type-import from `runs.ts`. A value import would pull `runs.ts`, which value-imports `participants.ts`, which value-imports `runs.ts` — a cycle that can bloat or destabilize the `client:load` island. `JOIN_MODES` is already duplicated in the form for this reason.
- **Fix A ⭐ Recommended**: Extract `src/lib/map-categories.ts` (tuple + `isMapCategory`); `runs.ts` and CreateRunForm import it. Do not value-import `runs.ts` from the island.
  - Strength: Matches `run-lifecycle.ts` / `run-list-filters.ts`; island stays free of the service cycle; one TS source for the eight strings.
  - Tradeoff: One extra file; SQL CHECK remains duplicated in the migration.
  - Confidence: HIGH — existing islands already avoid value-importing `runs.ts`.
  - Blind spot: None significant.
- **Fix B**: Pass `categories` as a prop from `new.astro` / `edit.astro` (same pattern as `maps`).
  - Strength: No new module.
  - Tradeoff: Two pages must remember the prop; form API grows.
  - Confidence: HIGH — maps are already passed this way.
  - Blind spot: Pages still need a server-side import of the tuple.
- **Decision**: FIXED (Fix A)

### F2 — Pin a single FormData contract for map_category

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details; Phase 3 — Create/edit form
- **Detail**: The plan offered two strategies (disabled select + hidden, or omit select `name` + always-hidden). Both named `map_category` in the DOM makes `FormData.get()` first-wins.
- **Fix**: Category `<select>` has no `name`; always exactly one hidden input `name=map_category` (`""` when a map is selected). Same pattern as `starts_at`.
- **Decision**: FIXED (Fix A)

## Triage

- **Fixed**: F1 (Fix A), F2 (Fix A)
- **Skipped**: none
- **Accepted**: none
- **Dismissed**: none

Verdict after fixes: **SOUND**
