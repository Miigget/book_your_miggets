<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Category-only runs Implementation Plan

- **Plan**: context/changes/category-only-runs/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation

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

### F1 — Grandfathered both-null card not live-smoked (YOLO)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: ActiveRunCard.astro:46-62 (same ternary on dashboard, history, Welcome, admin archive, runs/[id].astro)
- **Detail**: Progress 3.6 is marked `[x]` but YOLO skipped planting a live both-null row (Phase 2 already XOR-saved `p2-grand`). That is a skipped human-action gate, not a missing branch. Every Map-row surface uses `run.map ? Map : run.mapCategory ? Category : null`, so a grandfathered neither still renders neither Map nor Category. Do not REJECT for this. Carried from impl-review-phase-3.md; code still matches the contract on this full sweep.
- **Fix**: None required. Display branch matches the contract. Re-plant a both-null row only if a live eyeball is wanted before archive.
- **Decision**: PENDING

## Verification

### Automated (re-run this review)

| Check | Result |
|-------|--------|
| Phase 1 `npx supabase db reset` | Not re-run (destructive). Migration `20260821083357` is applied; live objects match the file. |
| `npm run db:types` | Pass. `npx supabase gen types typescript --local` is byte-identical to committed `src/types/database.ts`. `runs.Row.map_category: string \| null`; Insert/Update use generated optional `map_category?: string \| null`. |
| `npm run lint` | Pass (0 errors; 54 pre-existing `no-console` warnings; new `console.error` sites on create insert/map lookup and `updateRun` are required by the plan / lessons `?error=` rule). |
| `npx astro sync` | Pass. |
| `npm run build` | Pass. |

### Manual

In-browser click-through not re-run (YOLO human-action skip). SQL smokes re-run in a rolled-back transaction against local Postgres.

| Progress | Result |
|----------|--------|
| 1.4 INSERT both-null / map-only / category-only Insane / both-set / `insnae` | Pass (rolled back). Constraint names match: XOR vs catalog. |
| 1.5 XOR `NOT VALID` | Pass. `pg_constraint.convalidated` is false for `runs_map_or_category_required`; catalog CHECK is true (VALID). |
| 2.3–2.7 create/edit XOR + domain `?error=` | Code MATCH. Helper + APIs implement the contract; leftover local smoke rows from Phase 2 are XOR-valid. Crafted POSTs not re-curled. |
| 3.3–3.5, 3.7–3.9 form + cards + `?map=` | Code MATCH. Display ternary, hidden `map_category`, MapPicker filter-only, `resolveRunTitle` unchanged. |
| 3.6 grandfathered neither | Branch MATCH; live row not planted (F1 / YOLO residual risk). |

Do not REJECT for YOLO-skipped in-browser Progress rows: the code matches the plan.

## Locked checks

- Catalog CHECK eight KoG strings (`Easy, Main, Hard, Insane, Extreme, Mod, Solo, Others`); XOR `(map_id is null) <> (map_category is null)`; XOR CHECK `NOT VALID`. Authenticated UPDATE grant is the previous six columns plus `map_category`.
- `MAP_CATEGORIES` in `src/lib/map-categories.ts` (tuple + `isMapCategory`). `CreateRunForm` value-imports that module only. `runs.ts` is `import type { MapPickerItem }` on the island — no value import. `runs.ts` imports `isMapCategory`; the tuple is not duplicated there.
- Run category `<select id="run_category">` has no `name`. Exactly one `<input type="hidden" name="map_category" value={mapId ? "" : category} />`.
- Category line on every Map-row surface (`ActiveRunCard`, public `/runs` via that card, detail, dashboard active + past, history, Welcome, admin player archive). Titles unchanged (`resolveRunTitle` / `displayTitle` not rewritten).
- 3.6 skip: see F1. Display branch correctly coded.

## Plan vs diff

Commits `5d4f02c`, `d4c1270`, `597633e` on `feature/category-only-runs`. Epilogue `4236b6f` is Progress SHAs + `change.md` → `implemented` only.

### In plan and in diff — MATCH

- `supabase/migrations/20260821083357_runs_map_category.sql` — column, catalog CHECK VALID, XOR CHECK NOT VALID, revoke/grant. Constraint names and grant column order match the plan snippet. Header style matches `20260820124849_runs_update_active_invariants.sql`. No `VALIDATE`. No RLS policy edits.
- `src/types/database.ts` — three generated lines only. Not hand-edited. Relationships unchanged (no FK on `map_category`).
- `src/lib/map-categories.ts` — same shape as `run-lifecycle.ts` (no Supabase, no services). Byte-identical catalog strings to SQL CHECK.
- `src/lib/services/runs.ts` — `normalizeRunMapAndCategory` (trim, empty→null, map wins, both empty → `Pick a map or a category`, invalid catalog → `Category is invalid`). `RUN_SELECT` / `RunRow` / `RunListItem.mapCategory` / `runFieldsFromRow`. `matchesMapOrOrganizer` case-insensitive `includes` on stored `map_category` only (not joined `maps.difficulty`). `UpdateRunInput.mapCategory`; `updateRun` always patches `map_id` and `map_category`. `mapRunMapCategoryConstraintError` + sibling `mapRunUpdateTriggerError`.
- `src/pages/api/runs/index.ts` — reads `map_category`, normalizes, INSERTs the pair, maps CHECK names to domain strings, otherwise `Could not create this run` + `console.error`. Raw `fail(insertError.message)` removed.
- `src/pages/api/runs/[id]/index.ts` — `formString(..., "map_category")` passed into `updateRun`.
- `CreateRunForm.tsx` — `CreateRunFormEditValues.mapCategory`. State + `validate()` XOR. Label **Run category**, hint “Required when no map.” Options = `MAP_CATEGORIES` ladder order. Map selected → hide select + clear category; clear map leaves category empty. Hidden `map_category` always present.
- `MapPicker.tsx` — copy-only: empty state mentions picking a run category. Filter aria-label **Filter by difficulty** / “All difficulties” unchanged; filter select still unnamed.
- `new.astro` — subtitle “Pick a map or a category…”.
- `edit.astro` — `mapCategory: run.mapCategory ?? ""`.
- Display surfaces listed above — no shared card module (out of scope).

### In diff, not in plan

- Create map-lookup failure also stopped echoing PostgREST (`Could not validate map: ${mapError.message}` → generic + `console.error`). Benign; matches `lessons.md`. Not a Scope Discipline finding.
- `context/changes/category-only-runs/*` and Progress checkboxes — implement / review ritual, not product scope creep.

### In plan, not in diff

- None. All three phases’ Changes Required files are present.

### What We're NOT Doing (respected)

No new taxonomy/enum/categories table; no backfill; no copy of `maps.difficulty` into `map_category` when a map is selected; no dual Map+Category line; no `resolveRunTitle` rewrite; no `?category=` axis; no matching joined DIFF in `?map=`; no shared card module; no Vitest; middleware `PROTECTED_ROUTES` unchanged.

## Safety notes (not extra findings)

- XOR `NOT VALID` is required so existing both-null rows do not fail production `db push`. Fresh INSERT/UPDATE still enforce the check (re-verified this review). Do not `VALIDATE` until a future backfill (out of scope).
- `updateRun` always writes `map_category`, so a grandfathered title-only save cannot skip the column and sneak past the NOT VALID check.
- Lessons `?error=` rule: create insert and map-lookup no longer forward PostgREST. `fail(err.message)` remains only for `RunError` / `ProfileError` domain strings. Edit POST maps `RunError` the same way; other errors → `Could not save this run`.
- Astro interpolates `{run.mapCategory}`; catalog CHECK + `MAP_CATEGORIES` keep values in the eight strings. No new XSS class.
- Authenticated UPDATE column privileges are exactly: `title`, `map_id`, `map_category`, `starts_at`, `max_participants`, `min_points`, `join_mode`. INSERT/SELECT/DELETE remain table-level.

## Decision

F1 PENDING (observation only; no code fix). YOLO path: Done (no triage). Full-plan review — `change.md` stamped `impl_reviewed`.
