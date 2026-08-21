# Category-only runs — Plan Brief

> Full plan: `context/changes/category-only-runs/plan.md`

## What & Why

Organizers often want a night of a given difficulty without locking a KoG map yet (US-07 / FR-022 / S-14). Map is already optional, so map-less cards currently show no difficulty at all. This plan stores catalog difficulty on the run and shows it on the card so guests can still tell the intended DIFF.

## Starting Point

`runs.map_id` is nullable; create/edit already accept no map. Difficulty exists only on `maps.difficulty` (eight KoG seed strings). Cards hide the Map row when the join is null. MapPicker’s difficulty dropdown filters the catalog; it does not persist. S-13 UPDATE grants do not include a category column.

## Desired End State

Organizer creates or edits a run with either a specific map or a Run category (Easy / Main / Hard / Insane / Extreme / Mod / Solo / Others). New writes cannot save neither. List, detail, dashboard, history, home, and admin archive show `Category: {value}` when there is no map. Mapped runs keep the existing Map line only. Titles do not change. Searching `?map=` also matches the stored category.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| -------- | ------ | ---------------- |
| Storage | `map_category text` + CHECK of eight KoG strings | Catalog values, not a new taxonomy or unconstrained junk |
| Map + category | Null category when `map_id` is set (XOR) | One label on the card; do not infer from the map join |
| New writes | Reject both empty (app + DB) | Closes the empty-card failure mode going forward |
| Legacy rows | No backfill; XOR CHECK `NOT VALID` | Existing map-less runs stay readable; next edit must set map or category |
| Display | Every surface that already inlines Map | Dashboard/history/home/admin must not keep the hole |
| Filters | Extend `?map=` substring to `map_category` | No new axis; category-only Insane runs are findable |
| Form | Dedicated Run category select when map empty | MapPicker DIFF stays search-only; labels distinguish the two |
| Titles | Leave `resolveRunTitle` | US-07 is a card metadata line, not a rename |

## Scope

**In scope:** Migration + grants + types; `src/lib/map-categories.ts` + XOR normalizer; create/edit POST; form select; Category line on existing Map-row surfaces; `?map=` match on stored category; create `?error=` no longer forwards insert PostgREST.

**Out of scope:** Enum/new taxonomy; backfill; inferring DIFF from map; new card module; `?category=` axis; matching joined `maps.difficulty`; title rewrite; S-15; Vitest.

## Architecture / Approach

Form POST → `normalizeRunMapAndCategory` (map wins if both sent; reject if neither) → INSERT/UPDATE `map_id` + `map_category`. `MAP_CATEGORIES` lives in `src/lib/map-categories.ts` (CreateRunForm and `runs.ts` import it; the island must not value-import `runs.ts`). Category `<select>` has no `name`; always one hidden `map_category` (empty when mapped). Postgres catalog CHECK + XOR CHECK `NOT VALID` backstop PostgREST. Read path: `RUN_SELECT` includes `map_category`; cards render Map if joined map else Category if set. Update grant must list `map_category` or S-13 edit cannot save it.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema, grants, types | Column, CHECKs, UPDATE grant, `db:types` | Forgetting `NOT VALID` breaks prod `db push` on map-less rows |
| 2. Normalize + APIs + DTO | `map-categories.ts` + XOR helper, create/edit persist, list field, `?map=` | Duplicating XOR in two routes; echoing CHECK text in `?error=`; value-importing `runs.ts` into the island |
| 3. Form + cards | Run category select; Category on all Map-row surfaces | Persisting MapPicker’s search filter; naming both the select and the hidden input |

**Prerequisites:** S-01 and S-13 shipped. Local Supabase for `db reset` + `db:types`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Grandfathered cards stay empty until the organizer edits (accepted; no `Others` lie).
- Crafted POST with both fields stores map only (category cleared), not a 400.
- `?map=main` will hit Main-category runs as well as maps whose name contains “main”.
- YOLO may skip in-browser Progress rows; Phase 1 SQL smokes still matter.
- A ninth KoG DIFF later needs a migration to keep SQL CHECK and `src/lib/map-categories.ts` in sync.

## Success Criteria (Summary)

- Organizer can publish a category-only run; cards/detail show that category without a map name.
- New creates/edits cannot save with neither map nor category; mapped runs do not also show Category.
- Guests can find those runs via the existing map search box.
