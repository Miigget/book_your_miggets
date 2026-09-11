---
date: 2026-09-10T12:50:00+02:00
researcher: migget
git_commit: 3a842f8f413a63e10424a6ca830ddc399d6d5a82
branch: main
repository: book_your_miggets
topic: "How would we add an organizer-created map poll on a run so options are catalog maps, only confirmed participants vote, organizer close locks the winning map, run_maps is not replaced, and restricted-run 404 + comment ACL stay intact?"
tags: [research, codebase, map-poll, run-maps, map_id, comments, rls, rpc, verify-finish, s-28, fr-010]
status: complete
last_updated: 2026-09-10
last_updated_by: migget
last_updated_note: "Added follow-up research for nested explore confirmation (no DB sync trigger, S-27 skipped research.md, freeze split)"
---

# Research: Map poll on shipped run maps, roster, and comment ACL (S-28 / FR-010)

**Date**: 2026-09-10T12:50:00+02:00
**Researcher**: migget
**Git Commit**: [3a842f8f413a63e10424a6ca830ddc399d6d5a82](https://github.com/Miigget/book_your_miggets/commit/3a842f8f413a63e10424a6ca830ddc399d6d5a82)
**Branch**: main
**Repository**: book_your_miggets

## Research Question

How would we add an organizer-created map poll on a run so that (1) options are specific catalog maps, (2) only confirmed participants can vote (same bar as comments), (3) organizer close locks the winning map onto the run, (4) the multi-map list (`run_maps` / S-27) is not replaced, (5) restricted-run 404-not-403 and comment ACL stay intact?

Crew Lead focus (locked): (a) `runs.map_id` vs `run_maps` and verify-finish; (b) comment/participant ACL patterns to reuse for votes; (c) organizer-only mutation RPCs as a template for create-poll and close-poll; (d) archived S-27 decisions that constrain S-28.

Out of scope: clans ranking, screenshots, team-size, ownership transfer, admin labels.

## Summary

S-28 can sit **beside** S-27, not on top of it. The lock target is already named in the schema comment: `runs.map_id` is the “synced first/legacy/**S-28 lock** field”; `run_maps` is the session playlist (max 8, unique, add-order). `verify_clan_run_finish` already awards `maps.points` for **`runs.map_id` only** and returns `no_map` when that FK is null. Closing a poll should be a DEFINER `UPDATE runs SET map_id = winner, map_category = null` and must **not** call `replaceRunMaps` or pass `p_map_ids`.

There is **no** poll/vote table today. Catalog maps (`public.maps`) are world-readable. Votes should copy **comment write** ACL (`is_confirmed_participant` + `is_not_banned` + audience-active), not comment **read** (which also includes unseated organizer and admin). Organizer create/close should copy `archive_run` / `extend_run` / `complete_clan_run`: `SECURITY DEFINER`, `search_path = ''`, text outcomes, non-actor → `'not_found'` (no 403 oracle). Load poll UI only after `/runs/{id}` already resolved the run — that page already 404s restricted misses.

The load-bearing tension: every organizer **edit** still re-syncs `map_id` to `run_maps[0]` (`normalizeRunMapsAndCategory` + `updateRun` / invite setter). Cards and detail prefer the junction list, so a locked winner that is not position 1 (or not on the list) would **not** show as the session set, while title and verify-finish **would** follow `map_id`. Plan must freeze or skip that first-map sync after close, and show the locked map as its own field — without deleting `run_maps`.

## Detailed Findings

### 1. Dual map identity: `runs.map_id` vs `run_maps`

**Catalog.** `public.maps` is SELECT for `anon` and `authenticated` (`using (true)`). No authenticated writes. Poll options can FK `maps(id)` without a new catalog.

**Legacy columns.** `runs.map_id` (nullable FK → `maps`) plus `runs.map_category`. App XOR: non-empty map list clears category; category only when the list is empty. The old DB XOR CHECK was dropped (both-null is legal).

**Junction (S-27).**

```36:46:supabase/migrations/20260904130749_run_maps.sql
create table public.run_maps (
  run_id uuid not null references public.runs (id) on delete cascade,
  map_id uuid not null references public.maps (id) on delete restrict,
  position smallint not null,
  primary key (run_id, map_id),
  constraint run_maps_run_id_position_key unique (run_id, position),
  constraint run_maps_position_chk check (position >= 1 and position <= 8)
);
-- comment: session list (max 8, add-order). runs.map_id remains the synced first/legacy/S-28 lock field.
```

Grants: `SELECT` anon+authenticated; `INSERT`/`DELETE` authenticated; **no UPDATE** (replace-all). RLS SELECT = parent row visible to invoker **or** DEFINER `run_is_public(run_id)` (visibility = public, including archived). INSERT/DELETE = `is_not_banned()` + `is_run_organizer` + `is_run_roster_open_row` ([follow-up](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/supabase/migrations/20260904132544_run_maps_is_not_banned.sql)). Do **not** copy `run_is_public` onto poll/vote tables — that helper exists so guests can batch-read archived **public** maps on player Incoming/Recent without widening `can_view_run`. Polls live on `/runs/{id}`, which stays closed for archived non-participants.

**Write contract (app).** `normalizeRunMapsAndCategory` sets `mapId = mapIds[0] ?? null` and XOR-clears category ([`src/lib/run-maps.ts`](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/src/lib/run-maps.ts#L28-L48)).

| Path | Junction write | `map_id` / category |
|------|----------------|---------------------|
| Public / friends / clan **create** | After `.insert()` in [`src/pages/api/runs/index.ts`](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/src/pages/api/runs/index.ts) via `replaceRunMaps` | Insert columns |
| Non-invite **edit** | `updateRun` then `replaceRunMaps` ([`runs.ts:1515-1533`](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/src/lib/services/runs.ts#L1515-L1533)) | Patch `map_id` / `map_category` |
| Invite create | Inside `create_invite_only_run` only (`p_map_ids` default `'{}'`, always replace) | RPC insert |
| Invite edit | Inside `set_run_visibility_and_invites` (`p_map_ids` NULL skip, `'{}'` or list replace) | RPC update |

Invite RPCs do **not** re-derive `p_map_id` from the array; the app passes already-normalized first/XOR.

**Maps are not join-mode-locked.** `enforce_run_update_invariants` freezes `join_mode` + `auto_join_min` after any non-organizer participant; `map_id` / `run_maps` stay editable while `runs_update_own` / roster-open hold ([`20260901140012_run_auto_join_min.sql:299-311`](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/supabase/migrations/20260901140012_run_auto_join_min.sql#L299-L311)). After Complete, `is_run_roster_open_row` is false → edit and junction writes freeze; comments stay writable until Archive.

**Display.** Cards use `summarizeRunMaps(run.maps, run.map, mapCategory)` — junction first, singular `map` only as fallback. Detail: `detailMaps = run.maps.length > 0 ? run.maps : run.map ? [run.map] : []` ([`src/pages/runs/[id].astro:141`](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/src/pages/runs/%5Bid%5D.astro#L141)). Untitled title uses `resolveRunTitle` with the **singular** map name (`map_id` embed), not the junction. Edit seeds `mapIds` from `run.maps`.

**S-28 implication.** Close-poll that only updates `map_id` leaves the playlist intact (roadmap candidate default, AGENTS.md). Side effects unless plan adds UI + edit freeze:

1. Cards/detail still show `run_maps` (winner hidden unless it is already on the list).
2. Untitled title and `showVerifyFinish` (`run.map != null`) follow the **locked** `map_id`.
3. Next organizer save re-syncs `map_id` to `mapIds[0]` and **unlocks** the poll.

Recommended lock strategy: DEFINER close writes `map_id` + `map_category = null`; never `DELETE/INSERT run_maps`; after `closed_at`, skip first-map sync on edit (or reject map patches); UI shows session set **and** a locked-map row from `map_id`.

### 2. Verify-finish still awards `runs.map_id` only

[`verify_clan_run_finish`](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/supabase/migrations/20260901102315_verify_clan_run_finish.sql#L49-L135): `SECURITY DEFINER`; admin-only; non-admin → `'not_found'`; requires `clan_only`, `completed_at`, `verified_at` null; **`v_run.map_id` null → `'no_map'`**; delta = `maps.points` for that id; GUC `app.clan_points_award=1` bypasses `clans_freeze_points_and_owner`. S-27 explicitly did not alter this function.

Authenticated `GRANT UPDATE` on `runs` (latest, S-26, **not** rewritten by S-27): `title, map_id, map_category, starts_at, max_participants, min_points, join_mode, visibility, auto_join_min`. Closed: `archived_at`, `extended_until`, `completed_at`, `verified_at`, `organizer_id`. `clans.points` has no authenticated UPDATE.

`showVerifyFinish` stays `run.visibility === "clan_only" && completed && !verified && run.map != null`. Closing a poll onto a catalog map **enables** verify on a previously category-only clan run. Closing after `verified_at` would desync awarded points — freeze close after verify.

Do **not** GRANT UPDATE on `verified_at` / `clans.points`. Do **not** SUM `run_maps` in this slice.

### 3. Comment / participant ACL to reuse for votes

**Confirmed.** `participant_status` = `pending | confirmed | denied`. Helper:

```7:21:supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql
create or replace function public.is_confirmed_participant(p_run_id uuid)
-- STABLE SECURITY DEFINER; exists run_participants where user_id = auth.uid() and status = confirmed
```

Organizer is auto-seated confirmed on insert (`seat_organizer_on_run_insert`). They **can leave** (`leaveTeam` + `run_participants_delete_own_confirmed` while roster-open) → **unseated organizer** is a real state.

**Comment matrix (shipped, do not widen):**

| Actor | SELECT comments | INSERT comment / like | Notes |
|-------|-----------------|----------------------|-------|
| Confirmed, not banned, audience-active | yes | yes | Write also requires `is_run_in_active_window` |
| Confirmed, archived | yes (page via archived participant loader) | no | INSERT keys off audience-active |
| Unseated organizer | yes | **no** | Read policy `is_run_organizer`; write requires confirmed |
| Admin | yes | **no** unless also confirmed | `is_admin()` SELECT only |
| Pending / denied / guest | no | no | No anon GRANT on `run_comments` |
| After Complete, before Archive | yes (if reader) | **yes** (if confirmed) | Complete does not fold into `is_run_in_active_window` |
| After Archive | yes for allowed readers | no | |

App mirrors RLS: `requireConfirmedParticipant` (“Only confirmed participants can post comments”); `requireActiveRun` uses `isRunActive` (archive/extend, ignores `completed_at`). Page: `canPostOrLike = own?.status === "confirmed" && !isArchived && !isBanned`; `canReadComments = confirmed \|\| archivedParticipant \|\| organizer \|\| admin` ([`[id].astro:100-120`](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/src/pages/runs/%5Bid%5D.astro#L100-L120)).

Screenshots: private bucket; SELECT = confirmed / organizer / admin; INSERT = confirmed + not banned + active window. Polls must not reuse `clan-pictures` or widen that ACL.

**`can_view_run` (live body)** — [`20260901083000_clan_only_on_is_run_active_row.sql`](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/supabase/migrations/20260901083000_clan_only_on_is_run_active_row.sql#L12-L76): admin → true; organizer → true; confirmed → true (including archived); else audience-active + public / friends / invitee / same clan. Guests: public + audience-active only. Policies on `runs` must not call `can_view_run` (recursion). `run_maps` SELECT must not call it either.

**404-not-403.** `/runs/{id}` loads `getActiveRunById` (RLS + audience-active). Miss → participant archived → organizer archived → admin archived. Else `pageError = "missing"` → **HTTP 404**, copy “This run is missing or no longer active.” Restricted rows fail RLS the same as a missing id. Middleware does not prefix-protect `/runs`. Poll loaders and mutation RPCs must not return 403 for “cannot see this run.”

Admin archive JSON 403 for non-admin is the **admin prefix** pattern, not the restricted-run pattern. Organizer poll routes should follow `POST /api/runs/{id}/archive` (`not_found` → domain “Run not found or no longer active”).

**Recommended vote policy:**

| Action | Who | Freeze |
|--------|-----|--------|
| See poll on `/runs/{id}` | Same as comment **read** (confirmed / organizer / admin). Page already 404s everyone else. | — |
| Vote / change vote | Comment **write**: `is_confirmed_participant` + `is_not_banned` + audience-active + poll open | Close or Archive (Complete still allows votes, like comments) |
| Create poll | Organizer + not banned + roster-open (same as `run_maps` write / edit) | Complete / Archive |
| Close poll | Organizer + not banned; non-organizer → `'not_found'` | Archive; **and** `verified_at` (points already awarded). Allow after Complete so verify can still see the lock |
| Admin vote | Only if confirmed on the roster | Same as members |
| Pending applicant | Cannot vote. On public runs they can open the page; hide vote controls like comments | — |

Child-table SELECT: **authenticated only** (copy comments, not `run_maps`/`run_is_public`). Using `run_is_public` would let guests PostgREST-read archived public ballots without opening `/runs/{id}`.

### 4. Organizer mutation RPCs as templates

Shared shape: `returns text`, `SECURITY DEFINER`, `set search_path = ''`, `auth.uid()` null → `'not_authenticated'`, missing row or wrong actor → `'not_found'` (restricted-run leak family), banned organizer → `'banned'`, one-shot via stamp IS NULL, `REVOKE ALL` from public/anon, `GRANT EXECUTE` to `authenticated`. App: `supabase.rpc(...)` + `switch (outcome)` → `RunError` domain strings; infra errors logged, never `error.message` in `?error=`.

| RPC | Actor | Guards | Writes | API |
|-----|-------|--------|--------|-----|
| `archive_run` | Organizer **or** admin | already_archived | `archived_at` | `POST /api/runs/{id}/archive`; admin twin `POST /api/admin/runs/{id}/archive` |
| `extend_run` | Organizer only (admin → not_found) | hours ∈ {1,2,3,6}; audience-active; `now() >= starts_at`; not completed; one-shot `extended_until` | `extended_until` | `POST /api/runs/{id}/extend` |
| `complete_clan_run` | Organizer who currently owns a clan | `clan_only`; in-progress; one-shot | `completed_at` only (no archive, no points) | `POST /api/runs/{id}/complete` |
| `verify_clan_run_finish` | Admin only | completed clan_only; one-shot; map_id required | `verified_at` + clan points (GUC) | `POST /api/admin/runs/{id}/verify-finish` |
| Invite create/setter | Organizer via INVOKER RLS | 5-cap UX pre-check; invitee friends | run + invites + optional `run_maps` | create/edit APIs |

`map_id` **is** client-writable under `runs_update_own`, but close must be atomic (tally + lock + freeze votes) and may need to write `map_id` **after Complete** when PostgREST UPDATE is frozen. Therefore **close is DEFINER**, like archive — not a PostgREST patch.

Recommended RPC + API template:

1. **`create_map_poll(p_run_id uuid, p_map_ids uuid[]) returns text`**
   - Organizer, not banned, roster-open, no open poll (or one poll per run).
   - Options: distinct catalog UUIDs, cardinality ≥ 2 (product; not in PRD — plan), FK to `maps`.
   - Options need **not** be a subset of `run_maps` (FR-010: “specific map”; S-27 list is a different tool).
   - Outcomes: `created` \| `not_found` \| `not_authenticated` \| `banned` \| `not_open` \| `poll_exists` \| `invalid_options`.
   - Insert poll + options in one transaction. Do not touch `runs.map_id` / `run_maps`.

2. **`vote_map_poll(p_run_id uuid, p_map_id uuid) returns text`**
   - Confirmed + not banned + audience-active + poll open + option exists.
   - Upsert one row per `(poll_id, user_id)` (change-vote until close).
   - Non-viewer / missing run → `not_found` (no “not confirmed” oracle on restricted ids). Optional: confirmed-but-closed → `poll_closed` only when `can_view_run` is already true — simpler: one `not_found` / `not_open` family matching `auto_join_run`.
   - Outcomes: `voted` \| `not_found` \| `not_authenticated` \| `banned` \| `poll_closed` \| `invalid_option`.

3. **`close_map_poll(p_run_id uuid) returns text`**
   - Organizer, not banned; admin non-owner → `not_found` (copy extend, not archive).
   - Open poll; not archived; not verified.
   - `SELECT … FOR UPDATE` poll + votes; winner = max count; tie → plan (see Open Questions).
   - `UPDATE runs SET map_id = winner, map_category = null` **without** junction writes.
   - Stamp `closed_at`, `winner_map_id`.
   - Outcomes: `closed` \| `not_found` \| `not_authenticated` \| `banned` \| `already_closed` \| `no_votes` \| `already_verified` \| `not_active`.

API files copy [`archive.ts`](https://github.com/Miigget/book_your_miggets/blob/3a842f8f413a63e10424a6ca830ddc399d6d5a82/src/pages/api/runs/%5Bid%5D/archive.ts): `isUuid` → invalid-run helper; unauthenticated → existing unauthorized helper; `RunError` → `runFail`; generic fallback; HTML redirect to `/runs/{id}`. Suggested paths: `POST /api/runs/{id}/poll`, `…/poll/vote`, `…/poll/close`. Island on `[id].astro` next to comments; do not add to `PROTECTED_ROUTES`.

**Schema sketch (plan, not this stage):**

- `run_map_polls`: `id`, `run_id` UNIQUE (one poll per run unless plan allows reopen), `created_at`, `closed_at`, `winner_map_id` FK `maps`.
- `run_map_poll_options`: `(poll_id, map_id)` PK, `position`, FK `maps` ON DELETE RESTRICT.
- `run_map_poll_votes`: `(poll_id, user_id)` PK, `map_id` must be an option, `created_at`.
- RLS: ENABLE; SELECT authenticated via confirmed \| organizer \| admin; no anon; writes via DEFINER RPCs (REVOKE INSERT/UPDATE/DELETE from authenticated) **or** INVOKER INSERT on votes with comment-like WITH CHECK. Prefer **RPC-only writes** so tally/close cannot be raced via PostgREST.

ON DELETE CASCADE from `runs` matches `run_comments` / `run_maps`.

### 5. Restricted-run and comment ACL stay intact if…

- Poll tables never GRANT to `anon`.
- SELECT does not use `run_is_public` / does not widen `can_view_run`.
- Mutation RPCs use `'not_found'` for wrong actor (extend/complete family).
- Page loads poll only after the existing 404 chain.
- Vote INSERT requires `is_confirmed_participant` — not `can_view_run` alone (friends/invitees/clan members who are not confirmed must not vote).
- No comment policy changes; no screenshot grant changes.

## Code References

- `supabase/migrations/20260904130749_run_maps.sql:36-46` — `run_maps` + S-28 lock comment
- `supabase/migrations/20260904130749_run_maps.sql:16-27` — `run_is_public` (maps SELECT only)
- `supabase/migrations/20260904130749_run_maps.sql:238-358` — invite setter `p_map_ids` NULL skip
- `supabase/migrations/20260904132544_run_maps_is_not_banned.sql` — junction write + banned
- `supabase/migrations/20260901102315_verify_clan_run_finish.sql:93-99` — award `runs.map_id` only
- `supabase/migrations/20260901140012_run_auto_join_min.sql:29-40` — current `runs` UPDATE grant list
- `supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql:7-21` — confirmed helper
- `supabase/migrations/20260820092809_run_comments.sql:89-116` — comment SELECT/INSERT ACL
- `supabase/migrations/20260901083000_clan_only_on_is_run_active_row.sql:12-76` — live `can_view_run`
- `supabase/migrations/20260831131219_manual_archive_and_extend.sql:439-544` — `archive_run` / original `extend_run`
- `supabase/migrations/20260901083008_complete_clan_run.sql:20-31,161-219,308-373` — roster-open, extend+complete freeze
- `supabase/migrations/20260731111849_participant_apply_leave_and_organizer_seat.sql:44-62` — organizer auto-seat
- `src/lib/run-maps.ts:28-48` — first-map sync + XOR
- `src/lib/services/runs.ts:81-103,427-448,1082-1111,1353-1468,1515-1533` — embed, 404 loader, replace-all, RPC wrappers, edit sync
- `src/lib/services/comments.ts:70-91,210-211` — confirmed + active gates
- `src/pages/runs/[id].astro:62-120,127,141` — 404 chain, comment flags, verify gate, detail maps
- `src/pages/api/runs/[id]/archive.ts` — organizer mutation HTTP template
- `AGENTS.md` Hard Rules — S-28 must write locked `map_id` and must not replace `run_maps`

## Architecture Insights

1. **Two map fields, two jobs.** Playlist (`run_maps`) vs lock/award/title (`runs.map_id`). S-28 writes the second and leaves the first. Mixing them in `replaceRunMaps` would violate S-27 and FR-010 (“separate tools”).
2. **DEFINER for stamps and races; INVOKER for ordinary edit.** Lifecycle stamps are off the column grant list. Close is a stamp-plus-lock even though `map_id` is grant-listed — use DEFINER for atomicity and post-Complete lock.
3. **Leak family is `not_found`, never 403**, except admin-prefix JSON. Copy extend/complete, not admin archive’s 403.
4. **Comment write ≠ comment read.** “Same bar as comments” for **votes** is the write bar (confirmed). Organizer close is a different bar (organizer-only RPC).
5. **`run_is_public` is not a general “public including archived” hammer.** It was invented so guest profile cards can show maps without opening archived `/runs/{id}`. Polls must not inherit it.
6. **First-map sync will undo the lock** unless edit grows a closed-poll branch. That is the main plan hazard, not RLS.
7. **Lessons priors:** default branch is `main`; never put PostgREST/`Error.message` in `?error=`; name CHECKs/exceptions for `mapRunWriteError`-style mapping.

## Historical Context (from prior changes)

- [`context/archive/2026-09-04-multi-map-runs/plan.md`](context/archive/2026-09-04-multi-map-runs/plan.md) — S-28 out of scope; `runs.map_id` kept as “future lock field”; verify still first/`map_id` only; do not DROP `list_player_public_runs`; do not widen `can_view_run`.
- [`context/archive/2026-09-04-multi-map-runs/plan-brief.md`](context/archive/2026-09-04-multi-map-runs/plan-brief.md) — Open Risks: “S-28, when built, must write `map_id` only and leave `run_maps` alone.” Storage rule settled; presentation/edit-freeze left for this slice.
- [`context/archive/2026-09-04-multi-map-runs/crew-decisions.md`](context/archive/2026-09-04-multi-map-runs/crew-decisions.md) — **plan-q3**: keep `map_id` / `map_category`; sync first attached map. **plan-q4**: verify still awards `map_id` only. **review-F1**: SELECT = parent visible OR `run_is_public`. **review-F2**: setter NULL skip.
- [`context/archive/2026-09-04-multi-map-runs/reviews/impl-review.md`](context/archive/2026-09-04-multi-map-runs/reviews/impl-review.md) — full-plan APPROVED; “S-28 out: AGENTS records lock field vs junction; no poll UI.”
- [`context/foundation/roadmap.md`](context/foundation/roadmap.md) S-28 unknown — candidate default: poll writes locked map field; multi-map list unchanged. Risk: votes confirmed-only; close organizer-only.
- [`context/foundation/prd-v2.md`](context/foundation/prd-v2.md) FR-010 / US-01 — options are specific maps; close sets the run’s map; poll ≠ multi-map.
- [`context/archive/2026-09-01-verified-finish-clan-points/research.md`](context/archive/2026-09-01-verified-finish-clan-points/research.md) — Complete vs archive vs comments; award path (then pre-`run_maps`; still true for `map_id`).
- [`context/archive/2026-08-24-restricted-run-visibility/research.md`](context/archive/2026-08-24-restricted-run-visibility/research.md) — 404-not-403; comment read must not widen; publishable key is the authz boundary.

Table comment on `run_maps` already documents the S-28 lock field — implementers must not “fix” dual identity by collapsing columns.

## Related Research

- `context/archive/2026-09-01-verified-finish-clan-points/research.md` — verify/complete freeze and `map_id` award (pre-junction; still the award rule)
- `context/archive/2026-08-24-restricted-run-visibility/research.md` — visibility + 404
- `context/archive/2026-08-31-manual-archive-and-extend/research.md` — audience-active / archive RPC family
- `context/archive/2026-09-01-team-size-scope/research.md` — invite RPC DROP/re-GRANT and omit-to-keep args (if poll later needs invite RPC args: it should **not**)

No prior `context/changes/map-poll/research.md`. S-27 (`context/archive/2026-09-04-multi-map-runs/`) has **no** `research.md` (crew skipped `/10x-research`). No poll/vote symbols in `src/` or `supabase/migrations/` (confirmed grep).

## Open Questions

These are `/10x-plan` [S] material, not blockers for this research.

1. **Tie-break** when two options share the max vote count (first option, earliest leading vote, organizer pick on close, refuse `no_votes`/`tie`).
2. **Minimum/maximum option count** (2–8 to rhyme with `RUN_MAPS_MAX`, or uncapped catalog picks).
3. **One poll per run vs reopen** after close (FR-010 is singular “a map poll”).
4. **May poll options include maps not on `run_maps`?** Evidence: yes (separate tools). Confirm in plan so UI copy does not imply “vote on the session list.”
5. **After close, freeze `map_id` against `updateRun` first-map sync?** Strongly recommended; otherwise the lock is best-effort.
6. **Close after Complete / after Archive / after `verified_at`?** Split: vote writes match comments (open until Archive); create/close match edit (`is_run_roster_open_row`, frozen after Complete). Allowing close after Complete would need DEFINER (PostgREST UPDATE already frozen) so verify can still lock `map_id`. Refuse Archive and `verified_at`.
7. **Zero votes on close** — refuse, or leave `map_id` unchanged.
8. **Change-vote until close** vs append-only (comments are append-only; a unique voter row is the natural vote model).

## Follow-up Research 2026-09-10T12:31:00+02:00

Nested explores ([Map identity vs run_maps](b43fa3ab-c38f-40ec-8f6a-210abf053ba6), [Comment and vote ACL](0810775a-112e-4f73-bd75-7b10bd0bc018), [Organizer mutation RPC templates](4fdf1d10-c972-4ab6-9fb8-5dbd691efe31), [S-27 archive constraints](6ba365fc-85ad-42df-ac5c-548b2a3ccced)) agree with the summary above. Additions that were under-specified in the first pass:

1. **No DB trigger syncs `run_maps[0]` → `runs.map_id`.** Sync is only `normalizeRunMapsAndCategory` plus the four write paths. Close cannot rely on a constraint to keep lock ≡ first list map.
2. **Invite edit never hits setter NULL-skip in the app.** `setRunVisibilityAndInvites` always passes `p_map_ids: prepared.mapIds`, so a later organizer save still replace-alls the junction even though SQL NULL would skip. Poll close must not go through that function.
3. **Comment RLS was never rewritten after S-12.** INSERT still keys off `is_run_in_active_window` (audience-active + `can_view_run`), not `is_run_roster_open_row`. Vote INSERT should copy that helper if votes stay open after Complete.
4. **S-27 authors treated the roadmap unknown as an architecture lock**, not a UI spec: write `map_id` only; leave `run_maps` alone; dual-identity presentation and post-close edit freeze were deferred to S-28.
5. **Vote RPC shape:** DEFINER + `FOR UPDATE` like `auto_join_run` (serialize tally) is a better template than comment RLS-only INSERT, because close must read a stable count in the same transaction.
