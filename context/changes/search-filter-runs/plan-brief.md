# Search and filter active runs — Plan Brief

> Full plan: `context/changes/search-filter-runs/plan.md`

## What & Why

Guests need to find the right KoG run on the public list (FR-007 / S-03) instead of scanning every active card. This slice adds search/filter by **map**, **date**, and **requirements** only — the three axes FR-007 names — so players can share a filtered URL (Discord) and organizers still get discovery without login.

## Starting Point

`/runs` is SSR Astro: `listActiveRuns()` already applies the FR-013 active window (`archived_at` null + `starts_at > now - 1h`) and renders title, time, filled, min points, join mode, map, and in-progress. Query params are flash `notice`/`error` only. Create-run `MapPicker` is not a list filter. S-01 deferred this work; S-04 locked the service as the list choke point.

## Desired End State

A logged-out guest submits a GET form on `/runs` and sees only matching active runs. URL keys `map`, `date`, `min_points`, `join` are shareable. Invalid params are ignored. Unfiltered empty copy stays “No active runs yet”; filtered empty is “No runs match these filters” with Clear to `/runs`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Scope | Map, date, requirements only | FR-007 + roadmap risk: no extra axes | Change / Crew |
| Delivery | SSR GET form + query params | Guest list is SSR; URLs shareable; no first list island | Plan |
| Map | `?map=` case-insensitive substring on `maps.name` | Matches “search”; map-less rows excluded when set | Plan |
| Date | `?date=YYYY-MM-DD` UTC day ∩ active window | Singular date; CEST/UTC mismatch accepted for MVP | Plan |
| Requirements | My points (`min_points <= N`) + optional join mode | Guest “runs I qualify for”; no capacity axis | Plan |
| Bad params | Treat as unset; no `?error=` | Public list must not break; lessons.md | Plan |
| Empty copy | Distinct no-match vs no-runs | Avoid implying the catalog is empty | Plan |
| Map SQL | In-process name match, not `!inner`+`ilike` | One `RUN_SELECT`; filter before N+1 counts | Plan |

## Scope

**In scope:** parse helpers; extend `listActiveRuns`; GET form on `/runs`; My points label; two empty states; Clear link

**Out of scope:** pagination, slots/capacity, difficulty, MapPicker island, GET API, migrations, RLS, detail-page filters, test runner

## Architecture / Approach

```text
GET /runs?map&date&min_points&join
  → parseRunListFilters (invalid omitted)
  → listActiveRuns: active window
       + SQL date / min_points / join
       + in-process map.name contains
       → then confirmed counts
  → Astro form + list / empty states
```

No new tables. Detail and mutations unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Parse + `listActiveRuns` | URL filters already change the list | Applying map filter after counts; `min_points=` empty vs 0 |
| 2. Form + empty states | Guest UI, My points copy, Clear | Empty My points defaulting to 0; no-match copy looking like “no runs” |

**Prerequisites:** S-01 + S-04 shipped (public active list exists)
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- UTC calendar day vs visitor-local / CEST evening runs — accepted MVP
- In-process map match assumes a small active list (true for community MVP)
- `formatStart` remains Worker-locale; this slice does not fix list timezone display

## Success Criteria (Summary)

- Guest can filter active runs by map substring, UTC date, My points, and join mode without logging in
- Combined filters AND; shareable URL; invalid params ignored
- Filtered empty ≠ unfiltered empty; Clear restores the full active list
