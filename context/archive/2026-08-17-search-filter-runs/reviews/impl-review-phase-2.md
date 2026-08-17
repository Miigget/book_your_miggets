<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Search and filter active runs Implementation Plan

- **Plan**: context/changes/search-filter-runs/plan.md
- **Scope**: Phase 2 of 2
- **Date**: 2026-08-17
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 0c0c322

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

- **Git scope**: `0c0c322` product files are exactly the Phase 2 set (`src/components/runs/RunListFilters.astro` new, `src/pages/runs/index.astro`). Same commit also stamps plan Progress 2.1–2.3 and leftover S-03 `roadmap.md` in-progress (implement-on-entry), not product-scope extras. No React island, no `MapPicker` reuse, no GET `/api/runs`, no pagination, no extra filter axes, no migration/RLS, `getActiveRunById` / `runs.ts` untouched.
- **Plan drift**: both planned contracts MATCH (see below). Phase 1 parser + `listActiveRuns` wiring is unchanged; this phase only adds the GET form and the empty-state split.
- **Crew Lead confirmations**:
  - Label is **My points** (not “Min points”) on the filter control. Card `Min points:` is the unchanged list markup the plan required to keep.
  - Empty My points does **not** submit `0`: `value` is omitted when `minPoints` is unset (`value={undefined}` → Astro omits the attribute). `min="0"` / `step="1"` only. `0` is still a real filter when parsed. Empty `min_points=` is omitted by `parseRunListFilters`.
  - Clear is `href="/runs"` (form, only when `hasActiveFilters`; filtered empty state also).
  - Two empty copies: “No runs match these filters” vs “No active runs yet”.
  - Filter submit does not copy `notice` / `error` (no hidden fields; GET fields are only `map`, `date`, `min_points`, `join`).
  - No React island: `RunListFilters.astro`, no `client:*`.
- **Safety**: GET form values are Astro-escaped attributes. Invalid/empty params still ignored (Phase 1 parser). `?error=` not used for bad filters (lessons.md). Active-window list choke point unchanged.
- **Architecture**: optional extract `src/components/runs/RunListFilters.astro` as the plan allowed. Page stays SSR; form below header, above list; fields stack (`grid-cols-1 sm:grid-cols-2`).
- **Patterns**: `fieldClass` / `selectClass` match `MapPicker` / `CreateRunForm` cosmic inputs; `cn()` used when composing (`[color-scheme:dark]` on date/number). `JOIN_MODES` + `formatJoinMode` for the select.
- **Success criteria (re-run)**: form field `name`s present. `npm run lint` — 0 errors (15 pre-existing `no-console` warnings, none in Phase 2 files). `npm run build` — success. Manual Progress 2.4–2.7 left unchecked on purpose (YOLO skipped browser); not treated as failure. Form/empty-state code matches the contracts those manuals would exercise.

## Plan vs actual (Phase 2)

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
| 2.1 GET form field names `map`, `date`, `min_points`, `join` | PASS (`RunListFilters.astro` included from `/runs`) |
| 2.2 `npm run lint` | PASS (0 errors) |
| 2.3 `npm run build` | PASS |

## Manual verification

| Check | Result |
|-------|--------|
| 2.4–2.7 guest form click-through in browser | Pending by design (YOLO residual; Crew Lead: do not REJECT) |

## Findings

None.

## change.md

Status left as `implementing` (full-plan impl-review not run yet). Full-plan `impl_reviewed` stamp is reserved for the review after all phases.
