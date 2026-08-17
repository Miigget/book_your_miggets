<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Search and filter active runs Implementation Plan

- **Plan**: context/changes/search-filter-runs/plan.md
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

Grounding: 5/5 paths ✓, 10/10 symbols ✓, brief↔plan ✓

- Paths exist: `src/lib/services/runs.ts`, `src/pages/runs/index.astro`, `src/lib/run-lifecycle.ts`, `src/components/runs/MapPicker.tsx`, `src/components/runs/CreateRunForm.tsx`. New `src/lib/run-list-filters.ts` / optional `RunListFilters.astro` correctly absent.
- Symbols found: `listActiveRuns`, `getActiveRunById`, `confirmedCountsForRuns`, `mapRunRow`, `RUN_SELECT`, `JOIN_MODES`, `isJoinMode`, `formatJoinMode`, `activeWindowStartsAfter`, `formatStart`. `fieldClass` / `selectClass` are file-local (plan quotes the class strings).
- Brief, plan, and crew-decisions agree: SSR GET, `?map=` substring, UTC day ∩ FR-013, My points `<=` + optional `join`, invalid unset, distinct empty copy, LOW / two phases.

Code verification (riskiest claims): map embed is a left join (`map:maps` without `!inner`); `map_id` nullable; N+1 counts today run on every fetched row; `/runs` is public; no GET list API; `listActiveRuns` has a single caller (`index.astro`). Stacked `.gt` + `.gte`/`.lt` on `starts_at` has no in-repo precedent but postgrest-js documents chained filters as AND.

## Findings

### F1 — Out-of-range `min_points` can 400 the list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Filter parse + UTC day bounds / `listActiveRuns` contract
- **Detail**: Plan treats `min_points` as valid when it is a whole-string non-negative integer, then applies `.lte("min_points", N)`. Column is Postgres `integer` (`supabase/migrations/20260729134008_run_domain_schema.sql`). A shareable URL like `?min_points=99999999999` is a valid integer string in JS but out of range for int4; PostgREST returns an error, `listActiveRuns` throws, and `/runs` renders `loadError` with `err.message`. That contradicts Desired End State / crew lock: invalid params are ignored with no banner, and it can surface infrastructure text on the public list (same class of leak as lessons.md, even though this path is not `?error=`).
- **Fix**: In `parseRunListFilters`, treat `min_points` as unset unless it is a whole-string integer in `0..=2147483647` (Postgres `integer` max). Do not call `.lte` with a value the column cannot bind.
- **Decision**: PENDING
