# Multi-map session (S-27) Implementation Plan

## Overview

Organizers can attach up to eight catalog maps to one run for a single session. The public/signed-in active list and run detail show that set. Category-only runs stay valid: when the list is empty, the existing `map_category` card/detail branch still renders. This is roadmap S-27 / prd-v2 FR-009. Map poll (S-28) and clan verify-finish points stay unchanged.

## Current State Analysis

A run stores at most one optional `runs.map_id` and one optional `runs.map_category`. There is no junction table. App writes XOR-clear the category when a map is set (`normalizeRunMapAndCategory` in `src/lib/services/runs.ts`); the DB XOR CHECK was dropped, so both-null is legal. The catalog is `public.maps` (SELECT for anon/authenticated).

Create/edit post `map_id` + `map_category` via FormData. Public / friends_only / clan_only create is an inline `.from("runs").insert()` in `src/pages/api/runs/index.ts` (around lines 235–261) then redirect — there is no `createRun` in `runs.ts`. Non-invite edit is `updateRun` in `runs.ts`. Invite-only goes through `create_invite_only_run` / `set_run_visibility_and_invites` (live bodies in `supabase/migrations/20260901140012_run_auto_join_min.sql`), which write the same two columns. `setRunVisibilityAndInvites` today calls the 12-arg setter and omits any maps-array arg (same omit-to-keep class as `p_update_auto_join_min`). `MapPicker` is a default-form field (not Advanced): one selection, difficulty doubles as category-when-no-map.

Every list/detail surface assumes one map: `RUN_SELECT` embeds `map:maps (...)`; `RunListItem.map` is singular; cards (`ActiveRunCard`, `DashboardRunCard`, `RunPreviewCard`) and admin past runs use `map ? Map : mapCategory ? Category : omit`. Detail (`src/pages/runs/[id].astro`) shows a seven-field Map section when `run.map` is set. `resolveRunTitle` uses one map name; category never enters the title. `list_player_public_runs` is SECURITY DEFINER, left-joins one `maps` row, and returns public runs **including archived**. Guests cannot SELECT archived parents (`runs_select_active_anon` is audience-active + public; `can_view_run` is false once the run is not audience-active unless organizer/admin/confirmed). `?map=` search is in-memory on that one name, organizer nick, or category.

`verify_clan_run_finish` awards `maps.points` for `runs.map_id` only and returns `no_map` when that FK is null. Authenticated GRANT UPDATE on `runs` includes `map_id` / `map_category` and must not gain `verified_at` / `completed_at` / `archived_at` / `extended_until`. `clans.points` stays off the clan UPDATE grant.

## Desired End State

An organizer can pick 0–8 distinct catalog maps on create/edit (same default-form MapPicker, multi-select, add-order). The first map is written to `runs.map_id`; `map_category` is null whenever the list is non-empty, and may be set only when the list is empty (S-14 XOR). Existing single-map rows appear as a one-item set after backfill. Cards list `name · difficulty · pts`, show the first three, and `+N more` when needed; category-only / both-null cards stay coherent (Category row, or omit). Detail stacks one compact row per map (not seven fields × N). Untitled titles still use the first/synced map name. `?map=` matches any attached map name or the category. Clan verify-finish still awards the synced `map_id` only. S-28 is not built; `runs.map_id` remains the future lock field.

Guest Incoming/Recent cards show the set for public runs returned by `list_player_public_runs`, including **archived public**. Restricted runs stay hidden (junction unreadable; `/runs/{id}` still 404). Archived `/runs/{id}` stays closed for non-participants — do not widen `can_view_run` and do not open that page for guests.

Verify by: create a public run with three maps → `/runs` card shows three names; detail lists all three; title uses map 1 if untitled. Create category-only (no maps, difficulty = Hard) → card shows `Category: Hard`, no blank Map line. Edit to add a fourth map and remove the first → `map_id` becomes the new first; category stays null. Ninth map is rejected. Invite-only create/edit persist the same list. Guest player Incoming/Recent cards show the set for public runs (Recent includes archived public).

### Key Discoveries:

- Child-table pattern already exists (`run_participants`, `run_invites`, `run_comments`): FK to `runs` ON DELETE CASCADE. Invoker `exists (select 1 from runs)` hides restricted rows, but also hides **archived public** from anon — that is the guest Recent hole. `list_player_public_runs` exists specifically so guests can list archived public without widening `can_view_run`.
- Invite RPC `DROP FUNCTION` drops `GRANT EXECUTE` — copy live bodies from `20260901140012_run_auto_join_min.sql`, then re-GRANT (`team-size-scope` / lessons).
- Setter already uses `p_update_auto_join_min` so omit ≠ clear. `p_map_ids default '{}'` on the setter would wipe backfilled rows on current 12-arg edits after Phase 1.
- Do not DROP/CREATE `list_player_public_runs` to add a maps array (S-26 left RETURNS TABLE alone). Batch-select `run_maps` by run id after the RPC, same class as participant-count chunking. That batch only works for archived public if SELECT can see those junction rows (F1).
- Public/friends/clan create has no `createRun` in `runs.ts`. The live insert is `src/pages/api/runs/index.ts` around lines 235–261. Invite-only create/edit must not PostgREST-write `run_maps` after the RPC.
- `CreateRunForm` already value-imports from `runs.ts`; put the cap + normalize + display model in an island-safe `src/lib/run-maps.ts` (like `run-limits.ts`) so MapPicker and APIs cannot drift.
- `mapRunWriteError` maps named CHECKs to domain `?error=` strings — name the cap/unique constraints and never forward PostgREST text.
- Verify UI gates on `run.map != null` (`src/pages/runs/[id].astro`). Keeping `map_id` synced to the first list map leaves that gate and `verify_clan_run_finish` untouched.
- Maps are not in `enforce_run_update_invariants`’s join-mode lock. They stay editable on audience-active, roster-open runs (same as today’s `map_id`). After Complete, edit is already frozen.

## What We're NOT Doing

- S-28 map poll, poll votes, or closing a poll.
- Extending `verify_clan_run_finish` to SUM junction points; no new verify queue; no officer Complete/verify.
- GRANT UPDATE on `verified_at`, `clans.points`, `completed_at`, `archived_at`, `extended_until`.
- Dropping or stopping writes to `runs.map_id` / `runs.map_category`.
- Allowing category AND maps together; requiring at least one map (S-14 stays).
- Changing `resolveRunTitle` to join names or put category in the title.
- Repeating the seven-field catalog block per map on detail; showing every name on cards with no truncate.
- Reorder arrows on the form (add-order + remove only).
- New columns / DROP of `list_player_public_runs`.
- Widening `can_view_run` or opening archived `/runs/{id}` for non-participants.
- Clan pages gaining a run list.
- A Vitest/Jest runner.
- Prefix-protecting `/runs` or changing restricted-run 404 behavior.

## Implementation Approach

DB-first, three phases, same shape as S-26:

1. **Schema + RLS + backfill + invite RPC args + types** — `run_maps` with position/unique/cap; SELECT = parent visible to invoker **or** DEFINER `run_is_public` (public including archived); organizer replace-all writes while roster-open; backfill from `runs.map_id`; invite create takes `p_map_ids` default `'{}'` and always writes; invite setter takes `p_map_ids` default NULL (NULL skips, `'{}'` or a list replaces); `npm run db:types`.
2. **Services + APIs** — normalize list + XOR + first-map sync; validate cap/UUIDs/catalog; public create writes the junction in the same request as the live insert in `src/pages/api/runs/index.ts` (or a helper that insert calls); `updateRun` replace-all on non-invite edit; invite create/edit pass `p_map_ids` inside the RPC only; DTO `maps[]` on every loader; filter matches any name; guest profile batch-attach; `mapRunWriteError` for new constraint names.
3. **UI + agent contract** — multi-select MapPicker; shared card/detail summary; edit seeds the list; `AGENTS.md`.

App-normalized `mapId` / `mapCategory` / `mapIds` are the single write contract. Invite RPCs apply that contract inside the function so invite-only is one transaction. Public/friends/clan insert the run then replace the junction in the same request as that insert.

## Critical Implementation Details

**Write XOR + first-map sync** — After normalize: `mapIds` is ≤8, unique, first-seen order. `mapId = mapIds[0] ?? null`. If `mapIds.length > 0` then `mapCategory = null`; else category is validated-or-null as today. Do not 400 when the form sends both a list and a difficulty — list wins. Both empty remains legal.

**Invite RPC DROP + F2 defaults** — Current create EXECUTE signature is `(text, uuid, text, timestamptz, integer, integer, join_mode, uuid[], integer)`. Current setter is the 12-arg list ending `(join_mode, boolean, integer)`. DROP those exact lists, copy the live bodies, then:

- `create_invite_only_run`: append `p_map_ids uuid[] default '{}'`. After the run INSERT, always `DELETE FROM run_maps` then `INSERT` from `unnest(p_map_ids)` WITH ORDINALITY as `position` (new run; empty list unless passed).
- `set_run_visibility_and_invites`: append `p_map_ids uuid[] default null`. If `p_map_ids is null`, skip the junction write (leave existing rows). If non-null — including `'{}'` — replace-all (`DELETE` then `INSERT` from `unnest(p_map_ids)` WITH ORDINALITY). Do **not** default the setter to `'{}'` (that would wipe backfilled rows on current 12-arg edits). Do **not** `coalesce(p_map_ids, '{}')` on the setter (NULL must mean skip). Document the create-vs-setter default difference in the migration comment. Same NULL-vs-empty lesson as `p_update_auto_join_min` on this function.

Raise a named exception if `cardinality > 8` when a write happens. Re-GRANT EXECUTE to `authenticated` on the new signatures. App still passes normalized `p_map_id` / `p_map_category` (first / XOR); the RPC does not re-derive them. Phase 2 app writers always pass the array.

**Guest profile without RPC DROP** — `runRowFromPublicRpc` keeps building singular `map` from the existing columns. After `list_player_public_runs`, batch-load `run_maps` (+ `maps`) for those ids and set `maps[]`. If the junction is empty but `map` is set, treat display as `[map]` so a half-written public create still has a coherent card. F1 is what makes that batch return rows for **archived public** Recent; do not add a second maps RPC.

**F1 `run_maps` SELECT (do not widen `can_view_run`)** — SELECT for `anon` and `authenticated`: parent run visible to the invoker **or** DEFINER `run_is_public(run_id)`. `run_is_public` is `visibility = 'public'` regardless of `archived_at` / `extended_until`. Use it **only** in `run_maps` SELECT. Do not change `can_view_run`. Do not open archived `/runs/{id}` for non-participants. Restricted junction rows stay unreadable (not public). Catalog map names on a guessed public archived id are acceptable — they are already partly exposed via the profile RPC’s first map. INSERT/DELETE stay organizer + `is_run_roster_open_row`; no DEFINER on writes.

```sql
-- contract: STABLE SECURITY DEFINER; search_path locked; visibility only (no audience-active test)
create function public.run_is_public(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.runs r
    where r.id = p_run_id and r.visibility = 'public'
  );
$$;
```

SELECT using expression: `exists (select 1 from public.runs r where r.id = run_id) or public.run_is_public(run_id)`.

**F3 public create write site** — After a successful `.insert()` in `src/pages/api/runs/index.ts` (around 235–261), or in a helper **that this insert calls**, replace `run_maps` in the same request. On junction failure, map via `mapRunWriteError` and do not redirect as success. Invite create/edit still only `p_map_ids` inside the RPC. Do not invent a `createRun` in `runs.ts` that does not exist. `updateRun` remains the non-invite edit replace-all site.

## Phase 1: Schema, RLS, backfill, invite RPCs, types

### Overview

Add `run_maps`, policies, and backfill so existing `map_id` rows become a one-item set. Invite-only SQL can persist a list. Regenerated types land. App behavior is unchanged until Phase 2 (no UI yet; unused table is fine). Current 12-arg setter omits `p_map_ids` → NULL → skip junction, so backfill survives Phase 1 invite edits.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_run_maps.sql` (timestamp at implementation time; follow existing section-banner style)

**Intent**: Persist an ordered, unique, capped set of catalog maps per run without replacing `runs.map_id` / `map_category`.

**Contract**: Table `public.run_maps` (`run_id` FK → `runs(id)` ON DELETE CASCADE, `map_id` FK → `maps(id)` ON DELETE RESTRICT, `position smallint not null`). Primary key `(run_id, map_id)`. Unique `(run_id, position)`. CHECK `position >= 1 and position <= 8` named for `mapRunWriteError` (e.g. `run_maps_position_chk`). Index `(run_id, position)`. Backfill: `INSERT` position 1 from `runs` where `map_id is not null`. Comment the table as S-27 session list; `runs.map_id` remains the synced first/legacy/S-28 lock field. Do not alter `verify_clan_run_finish`. Do not REVOKE/rewrite the `runs` UPDATE column list (already has `map_id` / `map_category`; keep lifecycle stamps closed).

#### 2. Grants and RLS

**File**: same migration

**Intent**: Viewers who can already see the parent run can read its maps; guests can also batch-read maps for archived **public** runs listed by `list_player_public_runs`. Only the organizer can replace the list while edit is allowed. Restricted runs stay hidden. `can_view_run` and archived `/runs/{id}` stay unchanged.

**Contract**: `REVOKE ALL` from `public`. `GRANT SELECT` to `anon, authenticated`. `GRANT SELECT, INSERT, DELETE` to `authenticated` (no UPDATE — replace-all). Enable RLS. Create `run_is_public(p_run_id uuid)` as in Critical Implementation Details; `REVOKE ALL` from `public`; `GRANT EXECUTE` to `anon, authenticated`. SELECT policies for `anon` and `authenticated`: `exists (select 1 from public.runs r where r.id = run_id) or public.run_is_public(run_id)`. INSERT/DELETE for `authenticated`: `is_run_organizer(run_id)` and `exists (select 1 from public.runs r where r.id = run_id and public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at))` (column-args helper — same freeze as `runs_update_own` / `run_participants` writes; not a uuid). Do not call `can_view_run` from these policies. Do not use DEFINER on INSERT/DELETE. Do not change `can_view_run` or run SELECT policies.

#### 3. Invite RPCs

**File**: same migration

**Intent**: Invite-only create/edit can write the junction in the same transaction as `map_id` / `map_category`, without wiping backfill when the current 12-arg setter omits the new argument.

**Contract**: DROP + CREATE `create_invite_only_run` and `set_run_visibility_and_invites`. Copy live bodies from `20260901140012_run_auto_join_min.sql` (keep 5-cap UX pre-check, `p_update_auto_join_min`, invitee checks).

- Create: append `p_map_ids uuid[] default '{}'`. After the run INSERT, always replace-all from `unnest(p_map_ids)` WITH ORDINALITY.
- Setter: append `p_map_ids uuid[] default null`. If `p_map_ids is null`, skip the junction write. If non-null (including `'{}'`), replace-all from `unnest(p_map_ids)` WITH ORDINALITY — no `coalesce` to `'{}'`.

Raise a named exception if `cardinality > 8` on a write. Re-GRANT EXECUTE to `authenticated` on the new signatures. App still passes normalized `p_map_id` / `p_map_category` (first / XOR); the RPC does not re-derive them. Comment that create default `'{}'` vs setter default NULL is intentional (S-26 omit-to-keep).

#### 4. Generated types

**File**: `src/types/database.ts` via `npm run db:types`

**Intent**: Type the new table, `run_is_public`, and RPC args so Phase 2 compiles against local schema.

**Contract**: `Tables<"run_maps">` present; both invite functions include `p_map_ids: string[]` (setter arg optional/nullable in generated types). `Functions["run_is_public"]` present. Do not hand-edit the generated file.

### Success Criteria:

#### Automated Verification:

- Migration applies on local Supabase (`npx supabase db reset` or equivalent migrate-up).
- SQL check: every `runs.map_id is not null` row has exactly one `run_maps` row at `position = 1` with that `map_id`.
- `npm run db:types` succeeds; `create_invite_only_run` / `set_run_visibility_and_invites` args include `p_map_ids`.
- `GRANT EXECUTE` exists on the new invite signatures (old signatures are gone).
- SQL check (F2): after backfill, calling the setter with `p_map_ids` omitted/NULL leaves those rows; calling with `'{}'` deletes them; calling with a non-empty array replaces.

#### Manual Verification:

- As postgres/SQL: inserting a 9th position or a duplicate `map_id` on one run fails the named constraint/exception.
- Anon `SELECT` on `run_maps` for a public run id returns rows; the same select for a friends-only run id returns no rows when the role cannot see that run.
- Anon `SELECT` on `run_maps` for an **archived public** run id returns rows (F1). The same select for a restricted (friends/invite/clan) run — active or archived — returns no rows. Guest GET `/runs/{id}` of that archived public run still 404s (do not widen `can_view_run`).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Normalize, create/edit writes, loaders, filter

### Overview

Every create/edit path persists the list and keeps `map_id` / `map_category` in sync. Every loader that builds a `RunListItem` exposes ordered `maps[]`. Search matches any attached name. Guest profile cards can show the set without changing `list_player_public_runs` RETURNS TABLE. Public/friends/clan create writes the junction next to the live API insert, not a fictional `createRun`.

### Changes Required:

#### 1. Island-safe map-list helpers

**File**: `src/lib/run-maps.ts` (new)

**Intent**: One cap, one normalize, one display model for form, API, and cards.

**Contract**: Export `RUN_MAPS_MAX = 8`, `RUN_MAPS_CARD_VISIBLE = 3`, a domain cap message, `normalizeRunMapsAndCategory(mapIdsRaw: string[], categoryRaw: string)` returning `{ mapIds, mapId, mapCategory }` per the XOR + first-map rule (dedupe first-seen, reject invalid category only when the list is empty, throw `RunError` or a small shared error type the API already maps — do not import the heavy `runs.ts` service if that creates a cycle; keep this file free of Supabase). Export a display helper: if `maps.length > 0` (or fallback `[map]` when junction empty but `map` set) → `{ kind: "maps", visible, extra }`; else if category → `{ kind: "category", category }`; else `{ kind: "none" }`. Cap throw message must be the same string the API puts in `?error=`.

#### 2. Service writes (edit + invite RPC args)

**File**: `src/lib/services/runs.ts`

**Intent**: Replace the single-map normalizer on edit and invite paths; persist `run_maps` on non-invite **edit**; pass `p_map_ids` on invite RPCs. Public/friends/clan **create** is not in this file.

**Contract**: Extend `normalizeRunMapAndCategory` or replace call sites with `normalizeRunMapsAndCategory`. `prepareOwnedActiveRunPatch`: validate each id is a UUID and exists in `maps` (one `in("id", mapIds)` lookup). `updateRun` (public / friends_only / clan_only edit): write `map_id` / `map_category` as today, then replace junction (`delete().eq("run_id")` + `insert` rows with `position` 1..n). Invite create/edit: always pass `p_map_id`, `p_map_category`, and `p_map_ids` (including `[]`); do not also PostgREST-write `run_maps` after those RPCs. Map new constraint/exception names in `mapRunWriteError` to the cap message / “Map is invalid” — never raw `error.message` on redirects. `UpdateRunInput` / create invite input grow a `mapIds: string[]` (or equivalent); keep `mapCategory` for the empty-list case. A shared replace-all helper in `runs.ts` is allowed **if** the create API insert calls it — do not add an unused `createRun`.

#### 3. API FormData + public create insert (F3)

**Files**: `src/pages/api/runs/index.ts`; `src/pages/api/runs/[id]/index.ts`

**Intent**: Read a repeated `map_ids` field instead of a single `map_id`. Persist the junction on public/friends/clan create in the same request as the live insert.

**Contract**: `form.getAll("map_ids")` (string values, trimmed, empty dropped). Still read `map_category`. Do not require a leftover `map_id` field. Pass the array into normalize / invite RPC / `updateRun`. After a successful `.insert()` in `src/pages/api/runs/index.ts` (around 235–261), or in a helper that **that insert calls**, replace `run_maps` for the new id. On junction failure, `mapRunWriteError` and do not redirect as success (leave a coherent single-map card via synced `map_id` only if you choose not to delete the run — prefer failing the request). Invite-only branch still only `createInviteOnlyRun` / `p_map_ids`. Existing `?error=` domain-string rule unchanged.

#### 4. Loaders and DTO

**File**: `src/lib/services/runs.ts`

**Intent**: Every card/detail path has an ordered `maps: RunMap[]` without dropping singular `map` / `mapCategory`. Guest Recent can batch-read maps for archived public ids the RPC returned.

**Contract**: `RunListItem` adds `maps: RunMap[]`. Keep `map` as the synced first (embed `map:maps` and/or `maps[0]`). Extend `RUN_SELECT` with an ordered `run_maps` embed (`position` + nested `maps` catalog fields already on `RunMap`). `runFieldsFromRow` sorts by `position` and fills `maps`. `matchesMapOrOrganizer` returns true if any `maps[].name`, the singular `map?.name`, organizer nick, or `map_category` contains the needle. `runRowFromPublicRpc` sets `maps: []` then `listPlayerProfileRuns` batch-fills them (chunk ids; do not DROP the RPC). F1 SELECT is what lets that batch include archived public; do not add `list_public_run_maps`. `getOwnedActiveRunForEdit` must return `maps` so edit can seed. Title still calls `resolveRunTitle` with `map?.name` only.

### Success Criteria:

#### Automated Verification:

- `npm run lint`
- `npm run build`
- `src/lib/run-maps.ts` exports `RUN_MAPS_MAX === 8` and the display kinds `maps` / `category` / `none`.

#### Manual Verification:

- Direct SQL + service path (or create API with curl/FormData): three valid map UUIDs persist as positions 1..3 and `runs.map_id` = first; `map_category` is null.
- Empty `map_ids` + category `Hard` persists `map_id` null, `map_category` Hard, zero `run_maps`.
- Nine ids or a duplicate after normalize is a domain `?error=` (not a PostgREST dump).
- `listActiveRuns` with `?map=` matching the second map’s name includes the run.
- Public/friends/clan create via `POST /api/runs` (the inline insert in `src/pages/api/runs/index.ts`, not a `createRun` helper that does not exist) writes `run_maps` in the same request; invite-only create persists the list only through `p_map_ids` (no follow-up PostgREST `run_maps` insert).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: MapPicker, cards, detail, edit seed, AGENTS.md

### Overview

Organizers attach the set on the existing default-form picker. List and detail show the set with the agreed truncate/stack rules. Category-only cards stay coherent. Agent contract records the invariants.

### Changes Required:

#### 1. MapPicker + create/edit form

**Files**: `src/components/runs/MapPicker.tsx`; `src/components/runs/CreateRunForm.tsx`; `src/pages/runs/[id]/edit.astro`

**Intent**: Multi-select with add-order and remove; difficulty remains category-when-no-map.

**Contract**: MapPicker takes `selectedIds: string[]` and `onChange(ids: string[])`. Hidden inputs: one `map_ids` per selected id (order = position); `map_category` = difficulty only when `selectedIds.length === 0`. Clicking a catalog row appends if under cap and not already selected; selected rows render as an ordered chip/list with remove (no up/down). Cap copy uses `RUN_MAPS_MAX`. Label stays on the default form (not Advanced). `CreateRunFormEditValues` replaces singular `mapId` with `mapIds: string[]` (keep `mapCategory` for the empty-list seed). `edit.astro` seeds `mapIds` from `run.maps` and `mapCategory` from `run.mapCategory`. Client validate uses the same normalize/cap as the API.

#### 2. Shared list display

**Files**: `src/components/runs/RunMapsSummary.astro` (new); `src/components/runs/ActiveRunCard.astro`; `src/components/runs/DashboardRunCard.astro`; `src/components/runs/RunPreviewCard.astro`; `src/pages/admin/users/[id].astro`

**Intent**: One card treatment so the four list surfaces cannot fork.

**Contract**: Replace the `run.map ? Map : run.mapCategory ? Category : null` blocks with the Phase 2 display helper. `kind: "maps"` → “Map:” / “Maps:” plus visible `name · difficulty · pts` (comma or stacked compact lines that fit the existing card), then `+N more` when `extra > 0`. `kind: "category"` → today’s Category row. `kind: "none"` → omit the row (no empty “Map:”). Welcome landing stays covered via `RunPreviewCard`. Do not add a team-size-style extra line beyond the set.

#### 3. Run detail

**File**: `src/pages/runs/[id].astro`

**Intent**: Detail shows the full set without a catalog dump; category-only and verify-finish stay as today.

**Contract**: Remove the seven-field single-map section as the only map UI. When `maps.length > 0` (or fallback `[map]`), render a “Map” / “Maps” section of compact rows (name, difficulty, points — not stars/length/creator/released per row). When the list is empty and `mapCategory` is set, keep the existing Category DL row. `showVerifyFinish` stays `run.map != null`. Do not change Complete / Archive / Extend / comment ACL. Do not open archived `/runs/{id}` for non-participants.

#### 4. Agent contract

**File**: `AGENTS.md`

**Intent**: Later slices (especially S-28) do not drop the junction, mix poll into this list, reopen verify grants, or widen archived-run visibility for maps.

**Contract**: In Hard Rules, record: session maps live in `run_maps` (max 8, unique, position = add-order); `runs.map_id` is synced to the first list map or null; `map_category` XOR-clears when the list is non-empty; cards/detail show the set (cards truncate after 3); `list_player_public_runs` stays singular — attach `run_maps` in the app; `run_maps` SELECT is parent-visible **or** DEFINER `run_is_public` (public including archived) — do not widen `can_view_run` or archived `/runs/{id}` for non-participants; setter `p_map_ids` NULL skips, `'{}'` or a list replaces; public/friends/clan create writes the junction at the API insert (not a `createRun` in `runs.ts`); verify-finish still awards `runs.map_id` only; do not GRANT UPDATE on `verified_at` / `clans.points`; S-28 (when built) writes the locked `map_id` and must not replace `run_maps`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`
- `npm run build`
- `AGENTS.md` states the invariants above.

#### Manual Verification:

- Create public run with three maps: `/runs` card shows three `name · difficulty · pts` lines/items; detail lists all three compactly; untitled title uses map 1.
- Add maps 4–8 on edit; card shows three + “+5 more”; ninth click/submit is rejected with the cap message.
- Category-only create (no maps, Hard): card and detail show Category Hard; no blank Map row; title is `{nick} run` if untitled.
- Clear all maps on edit and leave a category: `run_maps` empty, `map_id` null, category stored; card switches to Category.
- Invite-only create with two maps: invitee sees both on the card/detail; guest 404s the run and cannot read `run_maps`.
- Player public Incoming/Recent for a public multi-map run shows the set (or first three +N), including **archived public** Recent for guests (F1). Guest still 404s archived `/runs/{id}`.
- Completed clan run with maps: Verify still appears when `map_id` is set; Complete does not change `clans.points`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`. Shared cap/normalize/display live in `src/lib/run-maps.ts` so form and API cannot drift.

### Integration Tests:

- None automated. Phase 1 SQL checks stand in for backfill, F2 setter skip/replace, and RLS (anon cannot read friends-only `run_maps`; anon can read archived public `run_maps`).

### Manual Testing Steps:

1. Create public run, three maps, no title → list card shows three names; detail has three compact rows; heading uses map 1.
2. Create public run, no maps, difficulty Hard → Category: Hard on card and detail; no Map section.
3. Edit the three-map run: remove map 1, add a fourth → `map_id` is the former map 2; cards/detail match the new order.
4. Attempt a ninth map → domain error; list unchanged.
5. Invite-only with two maps → invitee sees the set; a non-invitee gets 404 on `/runs/{id}`.
6. `?map=` on `/runs` using the second map’s name finds the run; category-only Hard still matches `Hard`.
7. Guest opens the organizer’s `/players/{id}` Incoming → public run shows the set. Archive that public run → guest Recent still shows the set; guest `/runs/{id}` still 404s.
8. Clan-only completed run with maps: admin Verify still available; points move by the first map only; Complete does not award.

## Performance Considerations

Catalog is ~1k maps and already loaded for MapPicker (`listMapsForPicker`). Junction reads are small (≤8 per run). Prefer one embedded `run_maps` select on `RUN_SELECT` rather than N+1. Guest profile batch-load chunks run ids (reuse the existing participant-count chunk size mindset). Card truncate keeps `/runs` scan cheap. No new realtime. `run_is_public` is a single-row `exists` on `runs.id` + visibility — not a table scan of all public runs.

## Migration Notes

- Backfill copies `runs.map_id` → `run_maps` position 1. Category-only and both-null rows get zero junction rows.
- Rollback: drop `run_maps`, drop `run_is_public`, and revert invite RPCs to the `20260901140012` signatures + EXECUTE grants. `runs.map_id` / `map_category` stay; no data loss on the legacy columns.
- Direct PostgREST can insert `run_maps` once granted (same class as other authenticated child tables). App + CHECK are the product guards. Organizer RLS + roster-open still apply.
- Phase 1 setter default NULL keeps backfill if invite edits run before Phase 2 passes `p_map_ids`.
- YOLO skips Progress Manual rows; they remain the human checklist.

## References

- Roadmap S-27 / prd-v2 FR-009, US-01
- Crew decisions: `context/changes/multi-map-runs/crew-decisions.md`
- Plan-review SOUND (second pass; prior F1–F3 applied): `context/changes/multi-map-runs/reviews/plan-review.md`
- Live invite RPCs + grant list: `supabase/migrations/20260901140012_run_auto_join_min.sql`
- Verify (unchanged): `supabase/migrations/20260901102315_verify_clan_run_finish.sql`
- Normalize / DTO / `RUN_SELECT` / `updateRun` / invite RPC callers: `src/lib/services/runs.ts`
- Public create insert (no `createRun`): `src/pages/api/runs/index.ts`
- MapPicker: `src/components/runs/MapPicker.tsx`
- Category-only precedent: `context/archive/2026-08-21-category-only-runs/plan.md`
- Recent create/edit plan shape: `context/archive/2026-09-01-team-size-scope/plan.md`
- Lessons: never forward PostgREST/`Error.message` into `?error=`; default branch is `main`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, RLS, backfill, invite RPCs, types

#### Automated

- [x] 1.1 Migration applies on local Supabase (`npx supabase db reset` or equivalent migrate-up) — fcfa49c
- [x] 1.2 SQL check: every `runs.map_id is not null` row has exactly one `run_maps` row at `position = 1` with that `map_id` — fcfa49c
- [x] 1.3 `npm run db:types` succeeds; `create_invite_only_run` / `set_run_visibility_and_invites` args include `p_map_ids` — fcfa49c
- [x] 1.4 `GRANT EXECUTE` exists on the new invite signatures (old signatures are gone) — fcfa49c
- [x] 1.7 SQL check (F2): after backfill, calling the setter with `p_map_ids` omitted/NULL leaves those rows; calling with `'{}'` deletes them; calling with a non-empty array replaces — fcfa49c

#### Manual

- [x] 1.5 As postgres/SQL: inserting a 9th position or a duplicate `map_id` on one run fails the named constraint/exception — fcfa49c
- [x] 1.6 Anon `SELECT` on `run_maps` for a public run id returns rows; the same select for a friends-only run id returns no rows when the role cannot see that run — fcfa49c
- [x] 1.8 Anon `SELECT` on `run_maps` for an **archived public** run id returns rows (F1). The same select for a restricted (friends/invite/clan) run — active or archived — returns no rows. Guest GET `/runs/{id}` of that archived public run still 404s (do not widen `can_view_run`) — fcfa49c

### Phase 2: Normalize, create/edit writes, loaders, filter

#### Automated

- [x] 2.1 `npm run lint`
- [x] 2.2 `npm run build`
- [x] 2.3 `src/lib/run-maps.ts` exports `RUN_MAPS_MAX === 8` and the display kinds `maps` / `category` / `none`

#### Manual

- [x] 2.4 Direct SQL + service path (or create API with curl/FormData): three valid map UUIDs persist as positions 1..3 and `runs.map_id` = first; `map_category` is null
- [x] 2.5 Empty `map_ids` + category `Hard` persists `map_id` null, `map_category` Hard, zero `run_maps`
- [x] 2.6 Nine ids or a duplicate after normalize is a domain `?error=` (not a PostgREST dump)
- [x] 2.7 `listActiveRuns` with `?map=` matching the second map’s name includes the run
- [x] 2.8 Public/friends/clan create via `POST /api/runs` (the inline insert in `src/pages/api/runs/index.ts`, not a `createRun` helper that does not exist) writes `run_maps` in the same request; invite-only create persists the list only through `p_map_ids` (no follow-up PostgREST `run_maps` insert)

### Phase 3: MapPicker, cards, detail, edit seed, AGENTS.md

#### Automated

- [ ] 3.1 `npm run lint`
- [ ] 3.2 `npm run build`
- [ ] 3.3 `AGENTS.md` states the invariants above

#### Manual

- [ ] 3.4 Create public run with three maps: `/runs` card shows three `name · difficulty · pts` lines/items; detail lists all three compactly; untitled title uses map 1
- [ ] 3.5 Add maps 4–8 on edit; card shows three + “+5 more”; ninth click/submit is rejected with the cap message
- [ ] 3.6 Category-only create (no maps, Hard): card and detail show Category Hard; no blank Map row; title is `{nick} run` if untitled
- [ ] 3.7 Clear all maps on edit and leave a category: `run_maps` empty, `map_id` null, category stored; card switches to Category
- [ ] 3.8 Invite-only create with two maps: invitee sees both on the card/detail; guest 404s the run and cannot read `run_maps`
- [ ] 3.9 Player public Incoming/Recent for a public multi-map run shows the set (or first three +N), including **archived public** Recent for guests (F1). Guest still 404s archived `/runs/{id}`
- [ ] 3.10 Completed clan run with maps: Verify still appears when `map_id` is set; Complete does not change `clans.points`
