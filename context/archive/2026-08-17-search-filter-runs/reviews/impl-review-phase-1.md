<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Search and filter active runs Implementation Plan

- **Plan**: context/changes/search-filter-runs/plan.md
- **Scope**: Phase 1 of 2
- **Date**: 2026-08-17
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 03fa808

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Review evidence

- **Git scope**: `03fa808` code files are exactly the Phase 1 set (`src/lib/run-list-filters.ts` new, `src/lib/services/runs.ts`, `src/pages/runs/index.astro`). Other files in that commit are 10x artifacts (`change.md`, plan, brief, plan-review, crew-decisions), not product-scope extras. No GET `/api/runs`, no form, no empty-copy change, no migration/RLS, `getActiveRunById` untouched.
- **Plan drift**: all three planned contracts MATCH (see below). Plan-review F1 (int4 cap on `min_points`) is present: `0..=2147483647` plus whole-string integer + length guard.
- **Safety**: query params are parsed then applied via supabase-js filters (parameterized) or in-process `String.includes` (no `ilike` wildcards). Invalid params omitted; out-of-range `min_points` cannot 400 PostgREST. Map filter runs **before** `confirmedCountsForRuns`. Active window (`.is("archived_at", null)` + `.gt("starts_at", activeWindowStartsAfter(now))`) always stays on. `minPoints === 0` uses `!== undefined` so empty ≠ 0.
- **Architecture**: parser lives in `src/lib/run-list-filters.ts` (plan’s preferred split). Service remains the list choke point. Join-mode literals are inlined in the parser to avoid a circular import with `isJoinMode` in `runs.ts` (same two enum values).
- **Success criteria (re-run)**: symbols exist; `listActiveRuns(supabase, filters?: RunListFilters)` with default `{}`. `npm run lint` — 0 errors (15 pre-existing `no-console` warnings, none in Phase 1 files). `npm run build` — success. Manual Progress 1.4–1.7 left unchecked on purpose (YOLO skipped browser); not treated as failure. Code matches the URL-filter contracts those manuals would exercise.

## Plan vs actual (Phase 1)

| Planned item | Verdict |
|--------------|---------|
| `RunListFilters` + `parseRunListFilters` / `hasActiveFilters` / `utcDayRange` | MATCH |
| Invalid/whitespace omitted; no throw from parse | MATCH |
| Date round-trips as UTC calendar day | MATCH |
| `min_points` whole-string non-negative integer; empty unset; `0` real | MATCH |
| int4 cap `0..=2147483647` (plan-review F1) | MATCH |
| `listActiveRuns` AND filters on FR-013 window; map in-process; counts after map drop | MATCH |
| `/runs` wires `parseRunListFilters` → `listActiveRuns`; banners kept; empty copy unchanged | MATCH |
| Unfiltered `{}` / omitted matches prior list behavior | MATCH (same window + order + mapRunRow; filters default `{}`) |

## Automated verification

| Check | Result |
|-------|--------|
| 1.1 helpers exist; `listActiveRuns` accepts optional filters | PASS |
| 1.2 `npm run lint` | PASS (0 errors) |
| 1.3 `npm run build` | PASS |

## Manual verification

| Check | Result |
|-------|--------|
| 1.4–1.7 URL-bar filters in browser | Pending by design (YOLO residual; Crew Lead: do not REJECT) |

## Findings

None.

## change.md

Status left as `implementing` (Phase 2 not started). Full-plan `impl_reviewed` stamp is reserved for the review after all phases.
