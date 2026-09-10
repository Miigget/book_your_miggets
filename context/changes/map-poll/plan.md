# Map poll (S-28 / FR-010) Implementation Plan

## Overview

Organizer creates one map poll on a run (2–8 catalog maps as options). Confirmed participants change-vote until close. Organizer close locks the winner onto `runs.map_id` and XOR-clears `map_category` without writing `run_maps`. After close, first-map sync on edit cannot unlock the winner. This is roadmap S-28 / prd-v2 FR-010.

## Current State Analysis

There is no poll or vote table. Session maps live in `run_maps` (max 8, unique, add-order). `runs.map_id` is the synced first / legacy / **S-28 lock** field (table comment on `run_maps`). `normalizeRunMapsAndCategory` (`src/lib/run-maps.ts`) sets `mapId = mapIds[0]` and XOR-clears category. Every non-invite edit (`updateRun`) and every invite edit (`set_run_visibility_and_invites`) writes that first-map value — invite RPC applies `map_id = p_map_id` even when `p_map_ids` is NULL. `enforce_run_update_invariants` freezes `join_mode` / `auto_join_min` only; `map_id` stays client-writable while `runs_update_own` / roster-open hold.

Verify-finish awards `maps.points` for `runs.map_id` only (`no_map` when null). Cards and detail prefer the junction list; untitled title and `showVerifyFinish` follow the singular `map` embed. Catalog `public.maps` is world-readable.

Comment **write** is `is_confirmed_participant` + `is_not_banned` + `is_run_in_active_window` (Complete does not fold into that window). Comment **read** also includes unseated organizer and admin. Restricted `/runs/{id}` 404s like a missing id. Organizer lifecycle RPCs (`archive_run` / `extend_run` / `complete_clan_run`) are DEFINER, `returns text`, wrong actor → `not_found`. `run_is_public` exists only so guests can batch-read archived **public** `run_maps` on player profiles — polls must not inherit it.

`MapPicker` already multi-selects the catalog with cap 8, but hardwires `name="map_ids"` / `map_category` XOR. `/runs/{id}` is not in `PROTECTED_ROUTES`. No test runner.

## Desired End State

On an audience-active, roster-open run, the organizer can open a poll whose options are specific catalog maps (not required to be on `run_maps`). Confirmed, unbanned participants see options and their own vote (no running totals). They may change that vote until close. Close with at least one vote writes `runs.map_id` to the winner (tie → lowest option `position`) and sets `map_category` null, leaving the playlist untouched. Close with zero votes is refused. One poll per run, never reopened. Create is forbidden after Complete/Archive; an already-open poll may still close after Complete, not after Archive or `verified_at`. Edit still replaces `run_maps` but cannot change `map_id` / `map_category` once closed. Detail and edit show a **Locked map** field from `map_id` next to the session list. Restricted runs still 404; PostgREST cannot read other people’s ballots while the poll is open.

### Key Discoveries:

- Dual identity is load-bearing: playlist (`run_maps`) vs lock/award/title (`runs.map_id`). Close must not call `replaceRunMaps` or pass `p_map_ids` (`AGENTS.md`, S-27 archive).
- First-map sync will undo the lock unless **both** app omit and DB freeze exist. Invite edit always writes `p_map_id` independently of the junction (`set_run_visibility_and_invites` UPDATE at `supabase/migrations/20260904130749_run_maps.sql:320-324`).
- Close after Complete needs DEFINER: `runs_update_own` is roster-open only (`is_run_roster_open_row`).
- Freeze trigger must see `closed_at` **after** the winner write, or close cannot set `map_id`.
- Hiding tallies in the island is not enough: vote SELECT must be own-row while open, all rows only after `closed_at`, or PostgREST leaks counts.
- `run_is_public` on poll tables would let guests read archived public ballots without opening `/runs/{id}`.
- Copy `archive.ts` + `archiveRun` outcome switch for create/close; copy `RunComments` + `fetchFormJson` + `commentFail` for vote. Named exception `map_id_locked` maps through `mapRunWriteError` (lessons: never put PostgREST `Error.message` in `?error=`).
- Invite setter: `CREATE OR REPLACE` the **same** signature (do not add args; S-26 omit-to-keep). Skip `map_id` / `map_category` when a closed poll exists; still apply `p_map_ids` (playlist).

## What We're NOT Doing

- Replacing, deleting, or reordering `run_maps` on close; passing `p_map_ids` from close.
- Reopen / second poll after close (`UNIQUE (run_id)`).
- Live tallies, organizer-only live counts, or guest/pending vote UI.
- Closing with zero votes or locking the first option without a ballot.
- Poll options required to be a subset of `run_maps`.
- Widening `can_view_run`, comment ACL, screenshot grants, or `run_is_public` onto poll tables.
- GRANT UPDATE on `verified_at`, `clans.points`, `completed_at`, `archived_at`, `extended_until`.
- SUM `run_maps` in `verify_clan_run_finish`; admin poll routes; admin/officer close.
- Prefix-protecting `/runs`; 403 for restricted misses (create/close/vote wrong actor → `not_found`).
- Clans ranking, screenshots, team-size, ownership transfer, admin labels (out of this change).
- A Vitest/Jest runner.
- Card list redesign (playlist display stays; title/verify already follow `map_id`).

## Implementation Approach

DB-first, three phases:

1. **Schema + RLS + RPCs + freeze** — tables, authenticated SELECT (no anon, no `run_is_public`), RPC-only writes, create/vote/close, trigger + invite setter skip.
2. **Services + APIs + edit omit** — wrappers, HTTP routes, `prepareOwnedActiveRunPatch` omits locked `map_id` / `map_category`, `mapRunWriteError` for `map_id_locked`.
3. **UI + agent contract** — `RunPoll` island on `/runs/{id}`, Locked map on detail/edit, MapPicker reusable without category XOR, `AGENTS.md`.

## Critical Implementation Details

**Close vs freeze ordering.** `close_map_poll` must `SELECT … FOR UPDATE` the open poll, tally, `UPDATE runs SET map_id = winner, map_category = null` **while `closed_at` is still null**, then stamp `closed_at` / `winner_map_id`. If the poll is stamped first, `enforce_run_update_invariants` will reject the winner write. Vote RPC should lock the same poll row so a vote cannot land after the tally starts.

**Vote SELECT is the tally ACL.** While `closed_at` is null, authenticated SELECT on `run_map_poll_votes` is `user_id = auth.uid()` (plus comment-read on the parent poll). After close, comment-read (confirmed / organizer / admin) may SELECT all vote rows. App must not aggregate before `closed_at`; RLS is what stops PostgREST bandwagon.

**Invite setter, same 13-arg signature.** `CREATE OR REPLACE` live `set_run_visibility_and_invites`. When a closed poll exists for `p_run_id`, leave `runs.map_id` and `runs.map_category` unchanged; still replace `run_maps` when `p_map_ids` is non-null. Do not add a skip arg. App still sends normalized `p_map_id` (ignored when locked).

## Phase 1: Schema, RLS, RPCs, map_id freeze

### Overview

Add poll/option/vote tables, DEFINER create/vote/close, vote RLS that hides other ballots until close, and a hard freeze so PostgREST/invite edit cannot unlock `map_id` after close.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_run_map_poll.sql` (timestamp at apply time)

**Intent**: Persist one poll per run, catalog options, and one vote per user; expose create/vote/close only as DEFINER text RPCs; freeze `map_id` after close without touching `run_maps`.

**Contract**:

Tables (all RLS ENABLE; `ON DELETE CASCADE` from `runs` / poll; maps `ON DELETE RESTRICT`):

- `run_map_polls`: `id uuid PK`, `run_id uuid NOT NULL UNIQUE`, `created_at`, `closed_at timestamptz NULL`, `winner_map_id uuid NULL REFERENCES maps`.
- `run_map_poll_options`: `(poll_id, map_id) PK`, `position smallint NOT NULL`, unique `(poll_id, position)`, `CHECK (position >= 1 AND position <= 8)`.
- `run_map_poll_votes`: `(poll_id, user_id) PK`, `map_id uuid NOT NULL`, `created_at`, `updated_at`. FK `(poll_id, map_id)` → options. One row per voter (change-vote = UPDATE).

Grants: `SELECT` **authenticated only** (no anon). `REVOKE INSERT/UPDATE/DELETE` from `anon` and `authenticated` on all three. `REVOKE ALL` on RPCs from `public`/`anon`; `GRANT EXECUTE` to `authenticated`.

SELECT policies (comment-read parent: `is_confirmed_participant(run_id) OR is_run_organizer(run_id) OR is_admin()`). Never `run_is_public` / `can_view_run`. Votes: own row always among those readers; **all rows only when `closed_at IS NOT NULL`**.

RPCs (`returns text`, `SECURITY DEFINER`, `search_path = ''`, `auth.uid()` null → `not_authenticated`, banned organizer/voter → `banned`, missing run or wrong actor → `not_found`):

- `create_map_poll(p_run_id uuid, p_map_ids uuid[])` — organizer + `is_run_roster_open_row` (after start OK; Complete/Archive → `not_open`). Existing row → `poll_exists`. Options: distinct catalog UUIDs, cardinality 2–8, else `invalid_options`. Insert poll + options in one transaction. Do not write `runs` or `run_maps`. Success: `created`.
- `vote_map_poll(p_run_id uuid, p_map_id uuid)` — confirmed + not banned + `is_run_in_active_window` + open poll + option exists. Upsert `(poll_id, user_id)`. Non-confirmed / missing → `not_found`. Closed (and confirmed) → `poll_closed`. Bad option → `invalid_option`. Success: `voted`.
- `close_map_poll(p_run_id uuid)` — organizer only (admin non-owner → `not_found`, copy `extend_run`). Open poll; not archived → else `not_active`; `verified_at` set → `already_verified`; already closed → `already_closed`. Zero votes → `no_votes` (no stamp, `map_id` unchanged). Else winner = max count, tie → minimum `position`. `UPDATE runs SET map_id = winner, map_category = null` (no junction writes), then stamp `closed_at` / `winner_map_id`. Success: `closed`. Allowed after Complete.

`enforce_run_update_invariants`: copy live body from `20260901140012_run_auto_join_min.sql`; if a closed poll exists for `new.id` and (`map_id` or `map_category`) is distinct from `old`, `raise exception 'map_id_locked' using errcode = 'P0001'`. Close’s own `runs` UPDATE happens before `closed_at` is set, so it is not rejected.

`set_run_visibility_and_invites`: `CREATE OR REPLACE` same signature; `map_id` / `map_category` assigned only when no closed poll; `p_map_ids` behavior unchanged.

#### 2. Generated types

**File**: `src/types/database.ts` via `npm run db:types`

**Intent**: Typed tables and RPC args for Phase 2.

**Contract**: `run_map_polls`, `run_map_poll_options`, `run_map_poll_votes`, and the three RPC signatures appear in `Database["public"]`.

### Success Criteria:

#### Automated Verification:

- Migration applies on local Supabase (`npx supabase migration up` or `npx supabase db reset`)
- `npm run db:types` completes without error
- `npm run lint` passes

#### Manual Verification:

- `create_map_poll` as non-organizer → `not_found`; 1 option → `invalid_options`; 2 catalog maps as organizer on a roster-open run → `created`
- Second create on the same run → `poll_exists`; create after Complete → `not_open`
- `vote_map_poll` as pending → `not_found`; as confirmed upserts; after close → `poll_closed`
- Close with 0 votes → `no_votes`, `map_id` unchanged, `closed_at` still null
- Close with a tie → lower `position` wins; `run_maps` count/order unchanged; `map_category` null
- Authenticated PostgREST INSERT into poll tables fails; anon SELECT on poll tables returns empty
- While open, a second confirmed user cannot SELECT the first user’s vote row; after close, comment-read can
- After close, organizer PostgREST `UPDATE runs SET map_id = …` raises `map_id_locked`

**Implementation Note**: After this phase and automated verification pass, pause for manual SQL confirmation before Phase 2.

---

## Phase 2: Services, APIs, edit omit

### Overview

App wrappers and HTTP routes for the three RPCs. Edit paths skip writing `map_id` / `map_category` when the poll is closed so a playlist shuffle does not 400 on the trigger.

### Changes Required:

#### 1. Poll service

**File**: `src/lib/services/polls.ts` (new)

**Intent**: Load poll state for `/runs/{id}` and wrap the three RPCs with domain errors; never forward PostgREST text.

**Contract**: `PollError` (same shape as `RunError`). Loader returns null when the run has no poll or RLS hides it. Open payload: options (map id/name/difficulty/points) + viewer’s own `map_id` or null + `closed: false` (no counts, no other voters). Closed payload: same plus `counts` per option, `winnerMapId`, `closed: true`. Wrappers: `createMapPoll` / `voteMapPoll` / `closeMapPoll` — `rpc` + `switch (outcome)`:

| Outcome | User-facing string (stable) |
| --- | --- |
| `not_found` / `not_authenticated` | `Run not found or no longer active` |
| `banned` | `Your account is banned` |
| `not_open` | `This run can no longer be edited` (or equivalent existing edit-frozen copy) |
| `poll_exists` | `This run already has a map poll` |
| `invalid_options` | `Pick between 2 and 8 different maps` |
| `poll_closed` | `This poll is closed` |
| `invalid_option` | `That map is not an option` |
| `already_closed` | `This poll is already closed` |
| `no_votes` | `No votes yet — wait for a vote before closing` |
| `already_verified` | `Finish is already verified` |
| `not_active` | `Run not found or no longer active` |
| unexpected / infra | generic; `console.error` the raw error |

#### 2. HTTP routes

**Files**:

- `src/pages/api/runs/[id]/poll.ts` (POST create)
- `src/pages/api/runs/[id]/poll/vote.ts` (POST vote)
- `src/pages/api/runs/[id]/poll/close.ts` (POST close)

**Intent**: Same auth/uuid/fail skeleton as organizer lifecycle; vote stays in-island JSON like comments.

**Contract**: `isUuid` → `commentInvalidRun`; no `locals.user` → `commentUnauthorized`; `PollError` → fail helper; infra → generic + `console.error`. Create/close copy `archive.ts` (`runFail`, success redirect `/runs/{id}` or JSON `{ ok: true, redirect }`). Create reads `parseMapIdsFromForm(form)` (same as run create/edit) and passes that array to `createMapPoll`; do not invent JSON `{ mapIds }`. Cardinality 2–8 stays `invalid_options` from the RPC. Vote copies comments (`commentFail` **or** a sibling `pollFail` with `?pollError=`; JSON success includes updated poll payload for the island). Do not add these paths to `PROTECTED_ROUTES`.

#### 3. Edit freeze in the app

**Files**: `src/lib/services/runs.ts`, `src/lib/services/runs.ts` `mapRunWriteError`

**Intent**: Playlist edits remain allowed after close; the lock field does not move. Trigger stays the hard gate.

**Contract**: `prepareOwnedActiveRunPatch` loads whether a closed poll exists. If yes, keep returning `mapIds` from the form (for `replaceRunMaps` / `p_map_ids`) but set `mapId` / `mapCategory` to the **existing** locked values (select current `map_id` / `map_category` on the run — extend the existing load select). `updateRun` still patches those columns with the locked values (no-op) or omits them; invite wrapper still passes `p_map_id` (setter ignores when closed). `mapRunWriteError`: `map_id_locked` → `The poll winner is locked`. Still call `replaceRunMaps` / pass `p_map_ids`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro sync` and `npm run build` pass

#### Manual Verification:

- Signed-in organizer POST create → redirect to detail; second create shows domain error
- Confirmed participant POST vote JSON updates own vote; pending gets domain not-found copy without 403
- Close with votes locks `map_id`; close with none stays open
- After close, non-invite **and** invite-only edit can change `run_maps` / title; reload shows winner still on `map_id` and playlist as edited
- After Complete, create fails; close of an already-open poll still locks `map_id`
- After Archive or `verified_at`, close fails with domain copy
- Restricted run: wrong actor / unknown id never returns 403 from these routes

**Implementation Note**: After this phase and automated verification pass, pause for API confirmation before Phase 3.

---

## Phase 3: Run detail island, locked map UI, AGENTS.md

### Overview

Comment-read viewers get a poll section on `/runs/{id}`. Organizer creates with a catalog picker (2–8, independent of `run_maps`). Voters submit in-island. After close, everyone who can see the poll sees counts + winner, and detail/edit show Locked map from `map_id` without removing the session list.

### Changes Required:

#### 1. MapPicker reuse

**File**: `src/components/runs/MapPicker.tsx`

**Intent**: Poll create needs the same catalog search without writing run `map_ids` / `map_category`.

**Contract**: Optional props, defaults preserving today’s create/edit: `maxSelected` default `RUN_MAPS_MAX`, `includeCategoryField` default `true`, optional `capMessage`, optional `label` / `emptyHint`. Poll instance: `includeCategoryField={false}` (no hidden `map_category`), still unique append, cap 8; pass a poll `label` / `emptyHint` so the picker does not say “optional” or mention the run category (keep the difficulty **filter** select). Do not couple poll options to `run.maps`.

#### 2. RunPoll island + page load

**Files**: `src/components/runs/RunPoll.tsx` (new), `src/pages/runs/[id].astro`

**Intent**: Poll lives on the public run page after the existing 404 chain; guests and non-readers never mount it.

**Contract**: Load poll (and `listMapsForPicker` when organizer may create) only after `run` is resolved. Mount when `canReadComments` (same as comments). Slot: after session maps (`detailMaps` block ~L268), before participants. Create/close: confirm + POST + redirect/reload (`OrganizerRunLifecycleControls` pattern). Vote: `fetchFormJson` + in-island error (`RunComments`). Open UI: option labels + own selection; **no counts**. Closed UI: counts + winner highlight. Organizer create: only if roster-open, not banned, no poll row. Organizer close: only if open poll, not archived, not verified. Unseated organizer sees the poll (read) but no vote controls (`canPostOrLike`-style: `own?.status === "confirmed"`). Read `?pollError=` / `?error=` as today. `showVerifyFinish` unchanged (`run.map != null` after lock).

#### 3. Locked map field

**Files**: `src/pages/runs/[id].astro`, `src/pages/runs/[id]/edit.astro`, `src/components/runs/CreateRunForm.tsx`

**Intent**: Winner is visible even when it is not `run_maps[0]` (or not on the list). Session list stays.

**Contract**: When a closed poll exists (or `winner_map_id` / locked `map_id` after close), detail shows a **Locked map** row (name · difficulty · pts) in Run details or above the session Maps list — do not drop `detailMaps`. If a closed poll exists, set `detailMaps` from `run.maps` only (no `run.map` fallback) so an empty playlist does not duplicate the winner in the session list. Empty session section is allowed; Locked map + `run.map` embed still drive title and verify-finish. Edit: read-only locked-map line; MapPicker still seeds `run.maps` only. Cards / `summarizeRunMaps` unchanged this slice.

#### 4. Agent contract

**File**: `AGENTS.md` Hard Rules (session-maps paragraph)

**Intent**: Future slices keep poll lock vs playlist split.

**Contract**: Document: organizer create `POST /api/runs/{id}/poll`, vote `POST /api/runs/{id}/poll/vote`, close `POST /api/runs/{id}/poll/close`; close writes `runs.map_id` and must not replace `run_maps`; after close, edit must not re-sync `map_id` from `run_maps[0]`; poll SELECT must not use `run_is_public`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro sync` and `npm run build` pass

#### Manual Verification:

- Organizer on roster-open run creates a 2-map poll from catalog maps **not** on the session list; pending viewer on a public run does not see the section; confirmed voter sees options without counts and can change vote
- Close shows counts + winner; Locked map on detail matches `map_id`; session Maps list still shows `run_maps` (empty playlist: no session-list duplicate of the winner); untitled title uses the locked map name
- Edit after close shows Locked map; saving a shuffled playlist does not change the lock
- Restricted friends-only run: non-invitee still 404; no poll 403
- `/runs/{id}` still absent from `PROTECTED_ROUTES`; guest public run has no poll island
- Clan completed run: cannot create; can close an open poll; verify-finish appears once `map_id` is set

**Implementation Note**: After this phase and automated verification pass, pause for UI confirmation. Local URLs: [http://localhost:4321](http://localhost:4321) (or the `astro dev` port in the terminal). Ensure `npm run dev` and local Supabase (`npx supabase start`) are running before click-through.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`. Do not add Vitest in this slice.

### Integration Tests:

- None automated. Phase 1 SQL checks and Phase 2 HTTP checks above are the integration net.

### Manual Testing Steps:

1. Public run, organizer seated: create poll (2–8 maps, including one not on `run_maps`) → confirmed teammate votes twice (last wins) → organizer closes → Locked map + playlist both visible; `/runs` card still lists session maps.
2. Tie: two options, one vote each → close picks the first-added option.
3. Close with no votes → error copy; poll remains open; `map_id` unchanged.
4. After close, edit maps; invite-only twin path; `map_id` unchanged.
5. In-progress (after `starts_at`) create still works; after Complete create fails; close after Complete works; Archive/verify then close fails.
6. Friends-only run: outsider URL 404; invited confirmed user can vote.
7. Unseated organizer: sees poll, cannot vote; can still close if they remain organizer.
8. Banned confirmed user cannot vote; banned organizer cannot create/close.

## Performance Considerations

Catalog load for create reuses `listMapsForPicker` (full `maps` ordered by name, already used on create/edit). Vote/close lock a single poll row. No list-page poll queries. Do not batch polls onto `/runs` cards in this slice.

## Migration Notes

New tables only; no backfill. Existing runs have no poll (`UNIQUE run_id` empty). Rollback = drop RPCs/policies/tables and revert the two `CREATE OR REPLACE` bodies (`enforce_run_update_invariants`, `set_run_visibility_and_invites`) to the live copies in `20260901140012_run_auto_join_min.sql` and `20260904130749_run_maps.sql`. `map_id` values written by a close remain until manually cleared — reverting code does not un-lock by itself.

## References

- Related research: `context/changes/map-poll/research.md`
- Roadmap S-28: `context/foundation/roadmap.md`
- PRD FR-010 / US-01: `context/foundation/prd-v2.md`
- S-27 dual identity: `context/archive/2026-09-04-multi-map-runs/plan.md`
- Organizer HTTP template: `src/pages/api/runs/[id]/archive.ts`
- Comment island: `src/components/runs/RunComments.tsx`
- First-map sync: `src/lib/run-maps.ts:28-61`
- Invite setter `map_id = p_map_id`: `supabase/migrations/20260904130749_run_maps.sql:320-358`
- Invariants trigger: `supabase/migrations/20260901140012_run_auto_join_min.sql:288-329`
- Verify award: `supabase/migrations/20260901102315_verify_clan_run_finish.sql`
- Lessons: named exceptions; no PostgREST in `?error=`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, RLS, RPCs, map_id freeze

#### Automated

- [x] 1.1 Migration applies on local Supabase (`npx supabase migration up` or `npx supabase db reset`)
- [x] 1.2 `npm run db:types` completes without error
- [x] 1.3 `npm run lint` passes

#### Manual

- [ ] 1.4 `create_map_poll` as non-organizer → `not_found`; 1 option → `invalid_options`; 2 catalog maps as organizer on a roster-open run → `created`
- [ ] 1.5 Second create on the same run → `poll_exists`; create after Complete → `not_open`
- [ ] 1.6 `vote_map_poll` as pending → `not_found`; as confirmed upserts; after close → `poll_closed`
- [ ] 1.7 Close with 0 votes → `no_votes`, `map_id` unchanged, `closed_at` still null
- [ ] 1.8 Close with a tie → lower `position` wins; `run_maps` count/order unchanged; `map_category` null
- [ ] 1.9 Authenticated PostgREST INSERT into poll tables fails; anon SELECT on poll tables returns empty
- [ ] 1.10 While open, a second confirmed user cannot SELECT the first user’s vote row; after close, comment-read can
- [ ] 1.11 After close, organizer PostgREST `UPDATE runs SET map_id = …` raises `map_id_locked`

### Phase 2: Services, APIs, edit omit

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npx astro sync` and `npm run build` pass

#### Manual

- [ ] 2.3 Signed-in organizer POST create → redirect to detail; second create shows domain error
- [ ] 2.4 Confirmed participant POST vote JSON updates own vote; pending gets domain not-found copy without 403
- [ ] 2.5 Close with votes locks `map_id`; close with none stays open
- [ ] 2.6 After close, non-invite **and** invite-only edit can change `run_maps` / title; reload shows winner still on `map_id` and playlist as edited
- [ ] 2.7 After Complete, create fails; close of an already-open poll still locks `map_id`
- [ ] 2.8 After Archive or `verified_at`, close fails with domain copy
- [ ] 2.9 Restricted run: wrong actor / unknown id never returns 403 from these routes

### Phase 3: Run detail island, locked map UI, AGENTS.md

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npx astro sync` and `npm run build` pass

#### Manual

- [ ] 3.3 Organizer on roster-open run creates a 2-map poll from catalog maps **not** on the session list; pending viewer on a public run does not see the section; confirmed voter sees options without counts and can change vote
- [ ] 3.4 Close shows counts + winner; Locked map on detail matches `map_id`; session Maps list still shows `run_maps` (empty playlist: no session-list duplicate of the winner); untitled title uses the locked map name
- [ ] 3.5 Edit after close shows Locked map; saving a shuffled playlist does not change the lock
- [ ] 3.6 Restricted friends-only run: non-invitee still 404; no poll 403
- [ ] 3.7 `/runs/{id}` still absent from `PROTECTED_ROUTES`; guest public run has no poll island
- [ ] 3.8 Clan completed run: cannot create; can close an open poll; verify-finish appears once `map_id` is set
