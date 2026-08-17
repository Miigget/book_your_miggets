# Search and filter active runs Implementation Plan

## Overview

Add FR-007 / S-03 search and filter to the public active-runs list: guests (no login) can narrow `/runs` by map name, calendar date, and requirements (`min_points` I-qualify + optional `join_mode`). Filters are AND, shareable via GET query params, and always intersect the existing FR-013 active window.

## Current State Analysis

`/runs` is SSR Astro with no React islands. `listActiveRuns()` in `src/lib/services/runs.ts` already applies `archived_at IS NULL` and `starts_at > now - 1h`, then N+1 `confirmedCountsForRuns`, then `mapRunRow`. Query params on the page are only flash `notice` / `error`. There is no GET list API, no pagination, and no filter form.

Create-run `MapPicker` searches the ~1k catalog client-side (name + difficulty). That picker is a POST-form island, not a list filter. `runs.map_id` is nullable; map-less runs must disappear when a map query is set. Indexes already exist for `runs(map_id)` and `(archived_at, starts_at)`. No test runner (`AGENTS.md`).

S-01 explicitly deferred guest list filters to this slice. S-04 locked `runs.ts` as the list choke point so pages do not grow their own active-window logic.

## Desired End State

A guest opens `/runs`, optionally sets map / date / My points / join mode, submits a GET form, and sees only matching **active** runs. The URL is shareable (e.g. Discord). Invalid params are ignored (no banner, no `?error=`). Unfiltered empty list keeps “No active runs yet”; filtered empty list says “No runs match these filters” with Clear → `/runs`. List cards, in-progress labels, and create/sign-in CTAs stay as they are.

### Key Discoveries:

- Service choke point: `listActiveRuns` (`src/lib/services/runs.ts`) — extend here; keep `getActiveRunById` unfiltered (detail is not this slice)
- Guest SSR + flash params already live on `src/pages/runs/index.astro`; first GET form in the repo
- `JOIN_MODES` / `isJoinMode` / `formatJoinMode` already exist for the join-mode control
- `confirmedCountsForRuns` is one count query per remaining row — drop non-matching rows **before** counting
- `formatStart` uses Worker `toLocaleString(undefined)` (not visitor TZ); date filter is UTC calendar day (accepted MVP mismatch vs CEST)
- Native inputs + `fieldClass` / `selectClass` from `MapPicker` / `CreateRunForm`; do not add shadcn Input/Calendar
- Empty `min_points` must not default to `0` or the form would hide every run with a positive threshold

## What We're NOT Doing

- Extra axes: remaining slots / capacity, map difficulty, organizer, title free-text, filled-only
- Pagination, virtual list, or a GET `/api/runs` endpoint
- React island / `MapPicker` reuse on the list; client-only filtering in the browser
- Exact `map_id` picker, trigram/FTS, or a new migration/index
- Changing RLS, archival, or `getActiveRunById`
- Using `?error=` for bad filter params (lessons.md)
- Vitest/Jest (no runner in `package.json`)

## Implementation Approach

**SSR GET form + service-layer AND filters** (locked in planning).

1. Parse `Astro.url.searchParams` into a typed filter object; invalid/whitespace values omitted.
2. `listActiveRuns(supabase, filters?)` keeps the active-window query, adds SQL filters for date / min_points / join_mode, then applies map-name substring in-process, then counts confirmed participants.
3. `/runs` renders a GET form (Astro, native controls) that round-trips valid params, plus the two empty states.

Query keys (do not collide with `notice` / `error`):

| Param | Meaning | Valid value |
| ----- | ------- | ----------- |
| `map` | Case-insensitive substring of `maps.name` | Non-empty trimmed string |
| `date` | UTC calendar day of `starts_at` | `YYYY-MM-DD` that is a real calendar date |
| `min_points` | Guest’s points; keep runs with `runs.min_points <= N` | Integer ≥ 0 (string of digits) |
| `join` | Join mode | `approval_required` \| `auto_join` (`isJoinMode`) |

## Critical Implementation Details

**Filter before counts:** After the PostgREST call, apply the map-name substring (and drop `map == null` when `map` is set) **before** `confirmedCountsForRuns`. Counting then discarding wastes the existing N+1.

**Map match in the service, not SQL:** Keep a single `RUN_SELECT` (left embed `map:maps`). Do not add a `maps!inner` / `.ilike('map.name', …)` path in this slice — embed filters without `!inner` keep parent rows, and `ilike` needs `%`/`_` escaping. Case-insensitive `includes` on `row.map.name` in `listActiveRuns` is still server-side (Astro/Worker), matches FR-007 “search”, and excludes map-less runs when the query is set.

**Date bounds (UTC, AND active window):** For a valid `date`, constrain `starts_at` to `[dateT00:00:00.000Z, nextDayT00:00:00.000Z)` **and** keep `.gt("starts_at", activeWindowStartsAfter(now))`. A past UTC day with no in-grace runs yields a filtered empty list, not archived rows.

**`min_points` empty ≠ 0:** The My points input has no default value. GET `min_points=` (empty) is unset. Only a valid integer string applies `.lte("min_points", N)`. `0` is a real filter (runs that require 0).

**Empty-state split:** `hasActiveFilters` is true only when the **parsed** object has at least one field. Invalid-only query strings behave as unfiltered (including “No active runs yet” if the catalog is empty). Clear filters is `<a href="/runs">` with no query string (does not preserve `notice`/`error`).

## Phase 1: Parse filters and extend `listActiveRuns`

### Overview

Own the URL contract and make `?map=&date=&min_points=&join=` already change the SSR list, even before a visible form.

### Changes Required:

#### 1. Filter parse + UTC day bounds

**File**: `src/lib/run-list-filters.ts` (new) — or a clearly named export group in `src/lib/services/runs.ts` if a second file is overkill

**Intent**: Single place for param names, validation, and “any valid filter set?” so the page cannot drift from the query.

**Contract**:
- `RunListFilters`: optional `mapQuery: string`, `date: string` (`YYYY-MM-DD`), `minPoints: number`, `joinMode: Enums<"join_mode">`
- `parseRunListFilters(searchParams: URLSearchParams): RunListFilters` — omit invalid/whitespace; do not throw
- `hasActiveFilters(filters: RunListFilters): boolean`
- `utcDayRange(date: string): { startIso: string; endIso: string }` — `[start, end)` as above
- Date valid only if it round-trips as UTC calendar day (reject `2026-13-40`)
- `min_points` valid only as a whole-string non-negative integer (not `parseInt("12px") === 12`)

#### 2. Filtered active list query

**File**: `src/lib/services/runs.ts`

**Intent**: List choke point applies AND filters on top of the FR-013 window without touching detail/mutations.

**Contract**: `listActiveRuns(supabase, filters?: RunListFilters)`:
- Always: `.is("archived_at", null)`, `.gt("starts_at", activeWindowStartsAfter(now))`, `.order("starts_at", { ascending: true })`
- If `date`: also `.gte("starts_at", startIso).lt("starts_at", endIso)`
- If `minPoints`: `.lte("min_points", minPoints)`
- If `joinMode`: `.eq("join_mode", joinMode)`
- If `mapQuery`: after fetch, keep rows whose `map?.name` contains the query case-insensitively; drop map-less rows
- Then `confirmedCountsForRuns` on the remaining ids, then `mapRunRow` as today
- Unfiltered call (`{}` / omitted) must match today’s list behavior

#### 3. Wire params on the list page (no form yet)

**File**: `src/pages/runs/index.astro`

**Intent**: Parsed filters reach the service so Phase 1 can be verified via the URL bar.

**Contract**: `parseRunListFilters(Astro.url.searchParams)` → `listActiveRuns(supabase, filters)`. Keep existing `notice` / `error` banner reads. Do not change empty-state copy yet (Phase 2).

### Success Criteria:

#### Automated Verification:

- `parseRunListFilters` / `hasActiveFilters` / `utcDayRange` exist and `listActiveRuns` accepts optional filters
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Logged-out `/runs?map=<substring>` shows only active runs whose map name contains that substring (case-insensitive); map-less runs hidden
- `/runs?date=YYYY-MM-DD` (a day that has an upcoming run) shows that day’s active runs only; a date with no in-window runs shows the current empty card (copy still the unfiltered one until Phase 2)
- `/runs?min_points=N` hides runs with `min_points > N`; `/runs?join=auto_join` hides approval-required
- Combined params AND; garbage `date` / `min_points` / `join` / whitespace `map` behave as if omitted
- Unfiltered `/runs` still lists all active runs in `starts_at` order with in-progress labels

**Implementation Note**: After automated checks, confirm the URL-driven filters against local `/runs` before building the form.

---

## Phase 2: GET form, labels, and empty states

### Overview

Guests can set the three axes without editing the URL. Copy makes “My points” polarity obvious and distinguishes “nothing scheduled” from “nothing matches.”

### Changes Required:

#### 1. Filter form (Astro, native controls)

**File**: `src/pages/runs/index.astro` and optionally `src/components/runs/RunListFilters.astro`

**Intent**: Shareable GET filters with the same visual language as create-run fields; no new island.

**Contract**:
- `<form method="GET" action="/runs">` with fields `map` (search), `date` (`type="date"`), `min_points` (`type="number"`, `min="0"`, `step="1"`, **no** value unless parsed `minPoints` is set), `join` (`<select>`: empty “Any join mode”, then `JOIN_MODES` labeled via `formatJoinMode`)
- Prefill from parsed filters; submit button “Filter”; Clear link to `/runs` only when `hasActiveFilters`
- Label `min_points` **“My points”** (not “Min points”); short hint that results are runs whose minimum is at most this number
- Do not include hidden `notice` / `error` in the form
- Merge classes with `cn()` if composing strings; reuse the cosmic `border-white/20 bg-white/10` input look from `MapPicker` `fieldClass` / `CreateRunForm` `selectClass`
- Form sits above the list, below the header; stays usable on a narrow viewport (stack fields)

#### 2. Empty states

**File**: `src/pages/runs/index.astro`

**Intent**: Filtered zero must not look like “the community has no runs.”

**Contract**:
- `loadError` unchanged
- Else if `runs.length === 0` && `hasActiveFilters`: heading “No runs match these filters”; supporting line inviting a Clear; include the Clear control
- Else if `runs.length === 0`: keep “No active runs yet” / “Check back soon…”
- List markup for non-empty results unchanged (title, in-progress, time, filled, min points, join, map)

### Success Criteria:

#### Automated Verification:

- `/runs` contains a GET form whose field `name`s are `map`, `date`, `min_points`, `join`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest (logged out) can filter by map, a UTC date, My points, and join mode; the URL updates and the list matches
- “My points” is the visible label; submitting empty My points does not apply a 0-point filter
- Filtered empty vs unfiltered empty copy both appear as specified; Clear returns to the full active list
- Shared URL opened in another session/browser shows the same filtered list
- `?notice=` / `?error=` banners still render when those params are present; Filter submit does not copy them into the next URL
- Create CTA / sign-in CTA and run cards still work; in-progress badge still shows on matching grace runs

**Implementation Note**: Pause for a guest click-through of the three axes plus both empty states before marking the change implemented.

---

## Testing Strategy

### Unit Tests:

- None required (no test runner). Keep `parseRunListFilters` / `utcDayRange` pure so a runner can cover them later without a page harness.

### Integration Tests:

- `npm run lint` and `npm run build` per phase
- No new migration; do not run `db reset` for this slice

### Manual Testing Steps:

1. Local app up (`npm run dev`); open [http://localhost:4321/runs](http://localhost:4321/runs) logged out.
2. Unfiltered list still shows upcoming + in-progress active runs.
3. Filter map substring (known catalog name) → only those maps; map-less runs gone.
4. Filter a date with a known run → that UTC day only; pick a date with no in-window runs → no-match empty + Clear.
5. My points below a high-threshold run hides it; join mode Auto join hides approval-required.
6. Combine two+ filters; paste the URL in a private window.
7. Submit `date=nope`, `min_points=-1`, `join=maybe`, `map=   ` → treated as unset.
8. Confirm banners: visit `/runs?notice=test` then Filter — `notice` should not remain unless re-added by hand.

## Performance Considerations

Active list size is small (community MVP). SQL filters on `runs` shrink rows before the N+1 confirmed counts. Map substring is in-process over that already-narrow set — no trigram index. Do not load the full maps catalog on `/runs`. No pagination in this slice.

## Migration Notes

None. No schema, RLS, or seed changes. Rollback is revert of the page + service + parser files.

## References

- Roadmap S-03 / Change ID `search-filter-runs`: `context/foundation/roadmap.md`
- PRD FR-007 (must-have discovery): `context/foundation/prd.md`
- GitHub issue #4 (1:1 S-03)
- S-01 list surface (deferred guest filters): `context/archive/2026-07-29-create-and-list-runs/plan.md`
- S-04 list choke point + active window: `context/archive/2026-08-07-run-archival-lifecycle/plan.md`
- List page: `src/pages/runs/index.astro`
- List service: `src/lib/services/runs.ts` (`listActiveRuns`, `JOIN_MODES`, `formatJoinMode`)
- Active window: `src/lib/run-lifecycle.ts`
- Lessons (`?error=`): `context/foundation/lessons.md`
- supabase-js: filter parent rows via related embed only with `!inner` (not used here; map match is in-process)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Parse filters and extend `listActiveRuns`

#### Automated

- [x] 1.1 `parseRunListFilters` / `hasActiveFilters` / `utcDayRange` exist and `listActiveRuns` accepts optional filters
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` passes

#### Manual

- [ ] 1.4 Logged-out `/runs?map=` substring filters by map name; map-less runs hidden
- [ ] 1.5 `/runs?date=` UTC day AND active window; out-of-window date does not leak archived runs
- [ ] 1.6 `/runs?min_points=` I-qualify (`<=`) and `/runs?join=` work; combined params AND
- [ ] 1.7 Invalid/whitespace params behave as omitted; unfiltered `/runs` unchanged

### Phase 2: GET form, labels, and empty states

#### Automated

- [ ] 2.1 `/runs` contains a GET form whose field `name`s are `map`, `date`, `min_points`, `join`
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 `npm run build` passes

#### Manual

- [ ] 2.4 Guest can filter all three axes via the form; URL and list match
- [ ] 2.5 “My points” label; empty My points does not apply 0
- [ ] 2.6 Filtered vs unfiltered empty copy; Clear returns to `/runs`
- [ ] 2.7 Shared URL works; Filter submit does not copy `notice`/`error`; cards and CTAs unchanged
