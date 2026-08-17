<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Search and filter active runs Implementation Plan

- **Plan**: context/changes/search-filter-runs/plan.md
- **Scope**: Phase 1–2 of 2 (full plan)
- **Date**: 2026-08-17
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: 03fa808 (phase 1), 0c0c322 (phase 2)
- **Prior phase reviews**: `impl-review-phase-1.md` APPROVED; `impl-review-phase-2.md` APPROVED

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

- **Git scope (product)**: `03fa808` + `0c0c322` code files are exactly the planned set: `src/lib/run-list-filters.ts` (new), `src/lib/services/runs.ts`, `src/pages/runs/index.astro`, `src/components/runs/RunListFilters.astro` (new). Same commits also carry 10x artifacts and leftover S-03 `roadmap.md` in-progress (implement-on-entry), not product-scope extras.
- **Plan drift**: all Phase 1 and Phase 2 contracts MATCH (tables below). Plan-review F1 (int4 cap on `min_points`) is present. Cross-phase: the GET form and empty-state split consume the Phase 1 parser/`listActiveRuns` wiring; invalid-only query strings still behave as unfiltered.
- **Not doing (guardrails held)**: no extra axes (slots, difficulty, organizer, title FTS); no pagination / GET `/api/runs`; no React island / `MapPicker` on the list (`RunListFilters.astro`, no `client:*`); no `maps!inner` / `ilike`; no migration/RLS; `getActiveRunById` unfiltered; no `?error=` for bad filter params; no test runner.
- **Safety**: query params parsed then applied via supabase-js filters (parameterized) or in-process `String.includes` (no SQL wildcards). Invalid params omitted; out-of-range `min_points` cannot 400 PostgREST (`0..=2147483647` + whole-string integer + length guard). Map filter runs **before** `confirmedCountsForRuns`. Active window (`.is("archived_at", null)` + `.gt("starts_at", activeWindowStartsAfter(now))`) always stays on. `minPoints === 0` uses `!== undefined` so empty ≠ 0. GET form values are Astro-escaped attributes; `selected` is a boolean HTML attribute (`selected={false}` omitted). `?error=` not used for bad filters (lessons.md). `/runs` remains public (`PROTECTED_ROUTES` unchanged).
- **Architecture**: parser lives in `src/lib/run-list-filters.ts` (plan’s preferred split). Service remains the list choke point; only caller is `src/pages/runs/index.astro`. Join-mode literals are inlined in the parser to avoid a circular import with `isJoinMode` in `runs.ts` (same two enum values). Optional extract `RunListFilters.astro` as the plan allowed. Page stays SSR; form below header, above list; fields stack (`grid-cols-1 sm:grid-cols-2`).
- **Patterns**: `fieldClass` / `selectClass` match `MapPicker` / `CreateRunForm` cosmic inputs; `cn()` used when composing (`[color-scheme:dark]` on date/number). `JOIN_MODES` + `formatJoinMode` for the select. List card markup (title, in-progress, time, filled, min points, join, map) unchanged.
- **Success criteria (re-run this review)**: helpers exist; `listActiveRuns(supabase, filters?: RunListFilters)` with default `{}`. Form field `name`s `map`, `date`, `min_points`, `join` present. `npm run lint` — 0 errors (15 pre-existing `no-console` warnings, none in this change’s files). `npm run build` — success. Manual Progress 1.4–1.7 and 2.4–2.7 left unchecked on purpose (YOLO skipped browser); Crew Lead: do not REJECT. Code matches the URL-filter / form / empty-state contracts those manuals would exercise.

## Plan vs actual

### Phase 1

| Planned item | Verdict |
|--------------|---------|
| `RunListFilters` + `parseRunListFilters` / `hasActiveFilters` / `utcDayRange` | MATCH |
| Invalid/whitespace omitted; no throw from parse | MATCH |
| Date round-trips as UTC calendar day | MATCH |
| `min_points` whole-string non-negative integer; empty unset; `0` real | MATCH |
| int4 cap `0..=2147483647` (plan-review F1) | MATCH |
| `listActiveRuns` AND filters on FR-013 window; map in-process; counts after map drop | MATCH |
| `/runs` wires `parseRunListFilters` → `listActiveRuns`; banners kept | MATCH |
| Unfiltered `{}` / omitted matches prior list behavior | MATCH |

### Phase 2

| Planned item | Verdict |
|--------------|---------|
| `<form method="GET" action="/runs">` with `map` (search), `date`, `min_points` (number, min 0, step 1, no value unless parsed), `join` select | MATCH |
| Prefill from parsed filters; submit “Filter”; Clear → `/runs` only when `hasActiveFilters` | MATCH |
| Label **My points**; hint that results are runs whose minimum is at most this number | MATCH |
| No hidden `notice` / `error` | MATCH |
| `cn()` when composing; cosmic `border-white/20 bg-white/10` | MATCH |
| Form above list, below header; stacks on narrow viewport | MATCH |
| `loadError` unchanged | MATCH |
| Filtered empty: “No runs match these filters” + Clear invite + Clear control | MATCH |
| Unfiltered empty: keep “No active runs yet” / “Check back soon…” | MATCH |
| Non-empty list markup unchanged | MATCH |
| No React island / MapPicker on the list | MATCH |

## Automated verification

| Check | Result |
|-------|--------|
| 1.1 helpers exist; `listActiveRuns` accepts optional filters | PASS |
| 1.2 `npm run lint` | PASS (0 errors) |
| 1.3 `npm run build` | PASS |
| 2.1 GET form field names `map`, `date`, `min_points`, `join` | PASS (`RunListFilters.astro` included from `/runs`) |
| 2.2 `npm run lint` | PASS (0 errors) |
| 2.3 `npm run build` | PASS |

## Manual verification

| Check | Result |
|-------|--------|
| 1.4–1.7 URL-bar filters in browser | Pending by design (YOLO residual; Crew Lead: do not REJECT) |
| 2.4–2.7 guest form click-through in browser | Pending by design (YOLO residual; Crew Lead: do not REJECT) |

## Findings

None.

## change.md

Stamped `status: impl_reviewed` (this full-plan review). Archive not started.
