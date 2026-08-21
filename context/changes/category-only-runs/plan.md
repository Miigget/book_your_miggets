# Category-only runs Implementation Plan

## Overview

Ship S-14 / US-07 / FR-022: an organizer can create (and edit) a run with a **map category and no specific map**, and that category shows on every surface that already shows the Map row. Category is a stored catalog difficulty on `runs` (`map_category`), not inferred from a missing `map_id`. New writes cannot produce a card with neither map nor category.

## Current State Analysis

`runs.map_id` is already nullable (S-01). Create (`POST /api/runs`) and edit (`updateRun` + `POST /api/runs/:id`) accept an empty map and persist `null`. `MapPicker` is labeled “Map (optional)” and its difficulty `<select>` only **filters** the ~1k catalog — it does not persist a category.

Difficulty lives on `maps.difficulty` as unconstrained text. The KoG seed has eight values: Easy, Main, Hard, Insane, Extreme, Mod, Solo, Others. There is no `category` / `map_category` column on `runs`. List/detail DTOs join `maps` via `RUN_SELECT`; when `map_id` is null, `run.map` is null and every card hides the Map row (`ActiveRunCard.astro` and the same inline block on dashboard, history, Welcome, admin player archive). Title fallback is custom → `{map} run by {nick}` → `{nick} run` → Untitled (`resolveRunTitle`). S-03 `?map=` matches map **name** or organizer nickname in-process (`matchesMapOrOrganizer`); map-less runs drop out unless the nick matches. Difficulty is not a list-filter axis.

Authenticated UPDATE is column-granted (`title, map_id, starts_at, max_participants, min_points, join_mode` in `20260820124849_runs_update_active_invariants.sql`). A new column is invisible to organizer edit until that grant is extended. INSERT RLS has no column whitelist. No test runner — CI is `astro sync`, `npm run lint`, `npm run build`. `lessons.md` forbids putting PostgREST/`Error.message` in `?error=`; create still forwards `insertError.message` today — do not copy that for the new CHECK path.

Existing production rows may already have `map_id` null (legal today). Those cards have neither map nor category until the organizer next saves.

## Desired End State

Organizer on `/runs/new` picks either a catalog map **or** a Run category (one of the eight KoG DIFF strings). Submitting neither is rejected in the form and on the server. Submitting a map stores `map_id` and `map_category = null`. Submitting a category with no map stores `map_id = null` and `map_category` equal to that string. Edit of an active run uses the same XOR. A grandfathered map-less row stays readable with no Map/Category line until the owner saves; that save must set a map or a category (`CHECK NOT VALID` plus form/API).

Public `/runs`, run detail, dashboard, history, home Recent Runs, and the admin player archive show `Category: {value}` when there is no map and `map_category` is set. Mapped runs keep `Map: {name} · {difficulty} · {points} pts` and do **not** grow a second category line. `resolveRunTitle` is unchanged. `?map=` also matches stored `map_category` (case-insensitive substring). MapPicker’s “All difficulties” control stays search-only.

### Key Discoveries:

- Failure mode is display, not nullability of `map_id` — cards already omit the Map row when `run.map` is null (`src/components/runs/ActiveRunCard.astro:46-58` and five inlined copies)
- MapPicker difficulty at `src/components/runs/MapPicker.tsx:88-104` is a search filter; persisting it would collide with “All difficulties”
- S-13 UPDATE grant must list `map_category` or organizer edit cannot write it (`supabase/migrations/20260820124849_runs_update_active_invariants.sql:37-44`)
- XOR CHECK on existing both-null rows needs `NOT VALID` or production `db push` fails
- Create POST still does `fail(insertError.message)` (`src/pages/api/runs/index.ts:128-129`); new constraint failures must use fixed copy + `console.error`
- `matchesMapOrOrganizer` does not look at `maps.difficulty` today — this slice adds stored `map_category` only, not joined DIFF
- Types: `npm run db:types` after local migrate; do not hand-edit `src/types/database.ts`

## What We're NOT Doing

- A new difficulty taxonomy, Postgres enum, or categories table
- Backfilling grandfathered map-less rows (no default `Others`)
- Inferring or copying `maps.difficulty` into `map_category` when a map is selected
- Showing both a Map row and a Category row on the same card
- Rewriting `resolveRunTitle` to include category
- A new `?category=` filter axis, or matching joined `maps.difficulty` in `?map=`
- Extracting a shared map-or-category card component
- Making map required again; S-15 visibility; admin edit of runs
- Vitest/Jest, PATCH/JSON APIs, new `PROTECTED_ROUTES`

## Implementation Approach

DB-first, then write path, then read/display — same shape as S-13 / S-12. One shared normalizer in `runs.ts` so create and edit cannot drift on XOR.

1. Nullable `map_category text` + catalog CHECK + XOR CHECK `NOT VALID` + UPDATE grant; regenerate types.
2. Canonical eight-value list in `src/lib/map-categories.ts` + `normalizeRunMapAndCategory` in `runs.ts` used by create POST and `updateRun`; DTO + `RUN_SELECT` + `?map=` substring.
3. Dedicated Run category `<select>` on `CreateRunForm` (enabled only when map is empty); Category line on every existing Map-row surface; create-page copy.

## Critical Implementation Details

**XOR in storage, not “at least one including both.”** After normalize: `(map_id IS NULL) <> (map_category IS NULL)`. If the organizer (or a crafted POST) sends both, **map wins** and `map_category` is stored null — do not 400, do not copy map DIFF into the column. If both are empty, reject with a user-facing `RunError` before INSERT/UPDATE. Postgres CHECK is the backstop; the app still validates so `?error=` stays a domain string.

**`NOT VALID` applies only to the XOR CHECK.** The catalog CHECK allows null, so existing rows pass it. Do not `VALIDATE` the XOR constraint in this slice (that would require a backfill). Fresh INSERTs and any UPDATE of a grandfathered row must satisfy XOR — so `updateRun` must always patch `map_category`, not omit it.

**Category `<select>` has no `name`; always one hidden input.** Disabled fields are omitted from FormData (same class of bug as S-13 join-mode lock). The visible Run category `<select>` is UI-only — no `name` attribute. Always submit exactly one `<input type="hidden" name="map_category" value={...} />` (`""` when a map is selected). Do not also put `name="map_category"` on the `<select>` (FormData.get is first-wins). Same pattern as `starts_at_local` + hidden `starts_at`.

---

## Phase 1: Schema, grants, and types

### Overview

Add stored catalog difficulty on `runs` so later phases have a column to read and write. Grandfathered both-null rows remain. Organizer UPDATE can include the new column.

### Changes Required:

#### 1. New migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_runs_map_category.sql` (timestamp at implement time; same header style as `20260820124849_runs_update_active_invariants.sql`)

**Intent**: Persist optional `map_category` using the eight KoG DIFF strings; enforce XOR on new writes without failing `db push` against existing map-less rows; let authenticated UPDATE patch the column.

**Contract**: `map_category text null`. Catalog CHECK `runs_map_category_catalog`: null or `IN ('Easy','Main','Hard','Insane','Extreme','Mod','Solo','Others')` (VALID). XOR CHECK `runs_map_or_category_required`: `(map_id is null) <> (map_category is null)` **`NOT VALID`**. `REVOKE UPDATE` then `GRANT UPDATE` the previous editable list **plus** `map_category`. Do not change INSERT/SELECT/DELETE policies. Snippet (ordering and names are the contract):

```sql
alter table public.runs
  add column map_category text null;

alter table public.runs
  add constraint runs_map_category_catalog
  check (
    map_category is null
    or map_category in ('Easy', 'Main', 'Hard', 'Insane', 'Extreme', 'Mod', 'Solo', 'Others')
  );

alter table public.runs
  add constraint runs_map_or_category_required
  check ((map_id is null) <> (map_category is null))
  not valid;

revoke update on table public.runs from authenticated;
grant update (
  title,
  map_id,
  map_category,
  starts_at,
  max_participants,
  min_points,
  join_mode
) on table public.runs to authenticated;
```

#### 2. Generated types

**File**: `src/types/database.ts` (via `npm run db:types` only)

**Intent**: Typed `map_category` on `runs` Row / Insert / Update so Phase 2 compiles against the column.

**Contract**: Run `npm run db:types` against local Supabase (`npx supabase start`). Do not hand-edit `database.ts`.

### Success Criteria:

#### Automated Verification:

- Migration applies on local reset (`npx supabase db reset`) without error
- `npm run db:types` regenerates; `runs.Row` / Insert / Update include `map_category: string | null`
- `npm run lint` passes

#### Manual Verification:

- SQL smoke: INSERT both-null fails; map-only succeeds with `map_category` null; category-only (`map_category = 'Insane'`) succeeds with `map_id` null; both set fails; `map_category = 'insnae'` fails
- Confirm `runs_map_or_category_required` is `NOT VALID` (`pg_constraint.convalidated` is false)

**Implementation Note**: After this phase and automated verification pass, pause for the SQL smokes above before Phase 2. Phase blocks use plain bullets — checkboxes live in `## Progress`.

---

## Phase 2: Normalize, APIs, and list DTO

### Overview

Create and edit persist XOR through one helper. List/detail rows expose `mapCategory` so Phase 3 can render it. `?map=` matches that stored value. Create POST stops echoing raw insert errors.

### Changes Required:

#### 1. Shared catalog list and normalizer

**Files**: `src/lib/map-categories.ts` (new); `src/lib/services/runs.ts`

**Intent**: Single source of the eight strings and of XOR so create and edit cannot disagree; list mapping and search can read the column. The tuple lives in a client-safe module so the create/edit island does not value-import `runs.ts`.

**Contract**: New `src/lib/map-categories.ts` (same shape as `run-lifecycle.ts` — no Supabase, no services) exports `MAP_CATEGORIES` (tuple matching the SQL CHECK, same spelling/order) and `isMapCategory`. `runs.ts` **imports** those — do not duplicate the tuple there. `CreateRunForm` value-imports `MAP_CATEGORIES` from `@/lib/map-categories` only; **never** a value import from `@/lib/services/runs` (that file value-imports `participants.ts`, which value-imports `runs.ts`). Export `normalizeRunMapAndCategory(mapIdRaw, categoryRaw)` from `runs.ts` that trims, treats empty as null, **clears category when map is non-empty**, rejects both empty (`RunError` e.g. “Pick a map or a category”), rejects a non-empty category that is not in `MAP_CATEGORIES` when no map (`RunError` e.g. “Category is invalid”). Map UUID/existence checks stay in the create/update callers (existing messages). Add `map_category` to `RUN_SELECT` and `RunRow`; add `mapCategory: string | null` on `RunListItem` (and thus detail/archived/organizer aliases); map it in `runFieldsFromRow`. Extend `matchesMapOrOrganizer` with case-insensitive `includes` on `map_category` (in addition to map name and nickname). Do not change `resolveRunTitle`.

#### 2. Create POST

**File**: `src/pages/api/runs/index.ts`

**Intent**: Persist category-only creates; reject neither; never write both; never put PostgREST text in `?error=` on insert failure.

**Contract**: Read `map_category` from the form. Run the normalizer; on `RunError`, `fail(err.message)`. INSERT `map_id` and `map_category` from the normalized pair. On insert error: `console.error`; if the blob contains `runs_map_or_category_required` or `runs_map_category_catalog`, `fail` with the same domain strings as the helper; otherwise `fail("Could not create this run")`. Replace the existing `fail(insertError.message)` on this handler — do not leave a raw-message path next to the new CHECKs.

#### 3. Edit service and POST

**Files**: `src/lib/services/runs.ts` (`UpdateRunInput`, `updateRun`); `src/pages/api/runs/[id]/index.ts`

**Intent**: Active-run edit writes the same XOR pair, including clearing category when a map is chosen and forcing category (or a map) on grandfathered rows.

**Contract**: `UpdateRunInput` gains `mapCategory: string`. Edit POST passes `formString(form, "map_category")`. `updateRun` normalizes then patches `map_id` and `map_category` every save (do not omit `map_category` or a grandfathered UPDATE will hit the XOR CHECK with both still null). Map lookup errors stay generic “Could not save this run” + `console.error` as today. Map CHECK names in `mapRunUpdateTriggerError` (or a sibling mapper) to the same domain strings; never forward PostgREST.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro sync` and `npm run build` succeed

#### Manual Verification:

- Existing create form still publishes a mapped run; DB `map_category` is null
- Crafted `POST /api/runs` with empty `map_id` and `map_category=Insane` inserts XOR; the same POST with both empty redirects with the domain `?error=` (not PostgREST)
- Crafted POST with both a map and a category stores map only (`map_category` null)
- Crafted `POST /api/runs/:id`: mapped run + empty map + `map_category=Easy` stores category-only; category-only run + a `map_id` clears `map_category`
- Crafted edit of a both-null row (if one exists) without map or category is rejected; a valid XOR save afterward succeeds

---

## Phase 3: Form UX and card/detail display

### Overview

Organizer can set the stored category in the existing create/edit form. Guests and organizers see it on every surface that already inlines the Map row. Discovery via `?map=` is user-visible once cards render.

### Changes Required:

#### 1. Create/edit form

**Files**: `src/components/runs/CreateRunForm.tsx`; `src/components/runs/MapPicker.tsx` (copy only); `src/pages/runs/new.astro`; `src/pages/runs/[id]/edit.astro`

**Intent**: Dedicated Run category control, required only when no map is selected; MapPicker difficulty stays a catalog filter; edit prefills stored category.

**Contract**: `CreateRunFormEditValues` includes `mapCategory: string`. State + `validate()` reject empty map and empty category. Label the new control **Run category** (hint: required when no map). MapPicker’s filter keeps aria-label **Filter by difficulty** / “All difficulties” — do not persist that value. When `mapId` is set, hide or disable the category `<select>` (still no `name` on it). Always include exactly one `<input type="hidden" name="map_category" value={mapId ? "" : category} />`. Selecting a map clears category state; clearing the map leaves category empty until the organizer picks one. Option list = `MAP_CATEGORIES` imported from `@/lib/map-categories` (ladder order from the const, not MapPicker’s localeCompare). Edit page passes `mapCategory: run.mapCategory ?? ""`. `new.astro` subtitle: pick a map **or** a category. MapPicker empty-state line should mention picking a run category, not only title/nickname.

#### 2. Display surfaces (copy existing pattern; no new module)

**Files**: `src/components/runs/ActiveRunCard.astro`; `src/pages/runs/[id].astro`; `src/pages/dashboard.astro` (active + past); `src/pages/runs/history.astro`; `src/components/Welcome.astro`; `src/pages/admin/users/[id].astro`

**Intent**: Close the empty-card hole everywhere the Map row is inlined. Grandfathered neither stays blank on that row.

**Contract**: If `run.map`, keep the current Map block (name · difficulty · points on lists; full Map section on detail). Else if `run.mapCategory`, show `Category: {run.mapCategory}` on lists; on detail, a Category section with that value only (no fake stars/points/creator). Else show neither. Do not add Category when a map is present. Do not change title rendering.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro sync` and `npm run build` succeed

#### Manual Verification:

- Active list card and `/runs/{id}` show `Category: Insane` (or the chosen value) with **no** map name for a category-only run
- Dashboard (active + past), `/runs/history`, home Recent Runs, and admin player archive show the same Category line
- A mapped run still shows Map: name · difficulty · points and **no** extra Category line
- A grandfathered map-less run (if present) still has neither Map nor Category
- `?map=insane` includes the category-only Insane run; title remains `{nick} run` when no custom title
- MapPicker “All difficulties” still only filters the catalog; creating without clicking a map requires Run category
- Edit via the form: mapped run → clear map, pick a category, save; category-only run → pick a map (category control hidden/cleared, Map row returns)

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`. Put XOR in `normalizeRunMapAndCategory` so it is not duplicated; lint/typecheck is the automated stand-in.

### Integration Tests:

- None. Local SQL smokes in Phase 1; form/API/UI smokes in Phases 2–3.

### Manual Testing Steps:

1. `npx supabase start` and `npm run dev`. Open [http://localhost:4321/runs/new](http://localhost:4321/runs/new).
2. Create a mapped run — card shows Map with DIFF from the catalog join; DB `map_category` is null.
3. Create a category-only Insane run with no map — card and detail show Category: Insane, not a map name; title still uses nickname/custom.
4. Submit create with neither — blocked in the UI; server `?error=` is the domain string, not PostgREST.
5. Edit the mapped run: clear map, set Easy, save — list switches Map → Category: Easy.
6. Edit that run: pick a map — Category line disappears; Map row returns; DB `map_category` null.
7. Filter `/runs?map=insane` — the Insane category-only run is listed.
8. Confirm dashboard, history, Welcome, and (if admin) player archive match the card.

## Performance Considerations

No new queries. `?map=` stays in-process on the already-fetched active list; one extra string `includes` is negligible at current list size.

## Migration Notes

Production may already have `map_id` null rows. XOR must be `NOT VALID` so `supabase db push` on the next `v*` tag succeeds. Do not `VALIDATE` until a future backfill (out of scope). Column grant is required for S-13 edit to save category. Catalog CHECK strings must stay byte-identical to `MAP_CATEGORIES` in `src/lib/map-categories.ts` — a ninth KoG DIFF later is a new migration, not a silent app-only add. Rollback: drop the two constraints, revoke/re-grant without `map_category`, drop the column (loses stored categories).

## References

- PRD: `context/foundation/prd.md` (US-07, FR-022, Business Logic map-or-category)
- Roadmap: `context/foundation/roadmap.md` S-14
- Lessons: `context/foundation/lessons.md` (`?error=` must be domain copy)
- Create/edit: `src/pages/api/runs/index.ts`, `src/lib/services/runs.ts` (`updateRun`, `RUN_SELECT`, `matchesMapOrOrganizer`)
- Catalog strings: `src/lib/map-categories.ts` (`MAP_CATEGORIES`, `isMapCategory`) — island-safe; do not value-import `runs.ts` from `CreateRunForm`
- Form/picker: `src/components/runs/CreateRunForm.tsx`, `src/components/runs/MapPicker.tsx`
- Cards: `src/components/runs/ActiveRunCard.astro`; inlined Map rows in dashboard, history, Welcome, admin player page
- Prior slice: `context/archive/2026-08-20-edit-run/plan.md` (UPDATE grants, `RunError`, no category)
- S-03 non-axis: `context/archive/2026-08-17-search-filter-runs/plan.md` (difficulty filter out of scope; this slice only extends the existing `map` substring)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema, grants, and types

#### Automated

- [x] 1.1 Migration applies on local reset (`npx supabase db reset`) without error — 5d4f02c
- [x] 1.2 `npm run db:types` regenerates; `runs.Row` / Insert / Update include `map_category: string | null` — 5d4f02c
- [x] 1.3 `npm run lint` passes — 5d4f02c

#### Manual

- [x] 1.4 SQL smoke: INSERT both-null fails; map-only succeeds with `map_category` null; category-only (`map_category = 'Insane'`) succeeds with `map_id` null; both set fails; `map_category = 'insnae'` fails — 5d4f02c
- [x] 1.5 Confirm `runs_map_or_category_required` is `NOT VALID` (`pg_constraint.convalidated` is false) — 5d4f02c

### Phase 2: Normalize, APIs, and list DTO

#### Automated

- [x] 2.1 `npm run lint` passes
- [x] 2.2 `npx astro sync` and `npm run build` succeed

#### Manual

- [x] 2.3 Existing create form still publishes a mapped run; DB `map_category` is null
- [x] 2.4 Crafted `POST /api/runs` with empty `map_id` and `map_category=Insane` inserts XOR; the same POST with both empty redirects with the domain `?error=` (not PostgREST)
- [x] 2.5 Crafted POST with both a map and a category stores map only (`map_category` null)
- [x] 2.6 Crafted `POST /api/runs/:id`: mapped run + empty map + `map_category=Easy` stores category-only; category-only run + a `map_id` clears `map_category`
- [x] 2.7 Crafted edit of a both-null row (if one exists) without map or category is rejected; a valid XOR save afterward succeeds

### Phase 3: Form UX and card/detail display

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npx astro sync` and `npm run build` succeed

#### Manual

- [ ] 3.3 Active list card and `/runs/{id}` show `Category: Insane` (or the chosen value) with **no** map name for a category-only run
- [ ] 3.4 Dashboard (active + past), `/runs/history`, home Recent Runs, and admin player archive show the same Category line
- [ ] 3.5 A mapped run still shows Map: name · difficulty · points and **no** extra Category line
- [ ] 3.6 A grandfathered map-less run (if present) still has neither Map nor Category
- [ ] 3.7 `?map=insane` includes the category-only Insane run; title remains `{nick} run` when no custom title
- [ ] 3.8 MapPicker “All difficulties” still only filters the catalog; creating without clicking a map requires Run category
- [ ] 3.9 Edit via the form: mapped run → clear map, pick a category, save; category-only run → pick a map (category control hidden/cleared, Map row returns)
