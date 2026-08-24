---
date: 2026-08-24T11:20:05+02:00
researcher: migget
git_commit: 0b7263d34e3538fe8f2cc97119d558a97d8476fe
branch: main
repository: book_your_miggets
topic: "S-15 restricted-run-visibility — end-to-end run visibility, friends graph, and leak surfaces for FR-027/FR-028"
tags: [research, codebase, runs, rls, friends, visibility, fr-027, fr-028, s-15]
status: complete
last_updated: 2026-08-24
last_updated_by: migget
---

# Research: S-15 restricted-run-visibility — run visibility, friends graph, leak surfaces

**Date**: 2026-08-24T11:20:05+02:00
**Researcher**: migget
**Git Commit**: 0b7263d34e3538fe8f2cc97119d558a97d8476fe
**Branch**: main
**Repository**: book_your_miggets

## Research Question

Map how run visibility currently works end-to-end and where friends-only / invite-only must plug in without leaking to guests.

Cover: (1) list/search/dashboard/detail queries; (2) Postgres RLS / active-window policies; (3) create + edit forms and APIs; (4) S-11 friends graph; (5) leak surfaces including admin; (6) historical decisions that constrain this slice.

Crew Lead scope (locked): runs listing/detail/create/edit + RLS + friends graph. Out of scope: comments feature work, player labels, admin profile edits.

## Summary

Every active run is world-readable today. There is **no `visibility` column**, no invite table, and no friendship check on `runs`. Guest and signed-in default SELECT share the same FR-013 active window (`archived_at IS NULL AND starts_at > now() - 1 hour`). Organizer, admin, and archived-confirmed-participant policies sit beside that window as extra PERMISSIVE OR paths.

S-15 cannot be a UI-only split of `/runs`. The publishable anon key is the authz boundary (F-01). Filtering `src/pages/runs/index.astro` alone still leaks through: landing `Welcome.astro` (same `listActiveRuns`), public `/runs/{id}`, PostgREST `GET /rest/v1/runs`, **global confirmed `run_participants` SELECT** (organizer auto-seat dumps every `run_id`), `loadActiveRunForMutation` + apply/`auto_join_run`, and several error-message oracles (kick/decide/withdraw).

S-11 already shipped the consumption hook: `are_friends(a, b)` is `STABLE` / `SECURITY DEFINER`, granted to `authenticated` only, and **must not** be called from `friend_requests` policies. It is unused by run RLS and unused in `src/` except generated types. Friends-only should call `are_friends(organizer_id, auth.uid())` as a **live** graph (accepted + both currently verified). Invite-only candidate default is a **snapshot** table at create/edit, not a live friendship check.

Create today is any non-banned member with a nickname — **not** verified. PRD v1.1 forbids unverified members from creating friends-only / invite-only runs; that gate is new. Admins must keep SELECT (and therefore `/runs/{id}` + S-06 delete) on restricted runs. Comment **read** ACL must not be widened: S-12 already locked readers to confirmed + admin + unseated organizer.

## Detailed Findings

### 1. List / search / dashboard / detail queries

Supabase client uses the publishable anon key + session cookies ([`src/lib/supabase.ts`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/supabase.ts)). Guests = `anon`; signed-in = `authenticated`. No SQL **view** on `runs`; all reads hit `public.runs`. Shared PostgREST shape `RUN_SELECT` ([`src/lib/services/runs.ts:52-76`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L52-L76)): run columns + nested `maps` + `public_profiles` organizer nickname. DTOs (`RunListItem`, `RunDetail`) have `joinMode` and no visibility field ([`:20-38`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L20-L38)).

Active-window app mirror: `RUN_GRACE_MS = 3_600_000`; `activeWindowStartsAfter()` = `now - 1h` ISO ([`src/lib/run-lifecycle.ts:1-19`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/run-lifecycle.ts#L1-L19)).

| Surface                                     | Loader                                                 | Auth             | Filter                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing `/`                                 | `Welcome.astro` → `listActiveRuns().slice(0, 6)`       | Guest OK         | Active window only ([`Welcome.astro:10-13`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/components/Welcome.astro#L10-L13))                                     |
| `/runs`                                     | `listActiveRuns(supabase, filters)`                    | Guest OK         | Active window + optional filters ([`runs/index.astro:15-25`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/runs/index.astro#L15-L25))                      |
| `/runs/{id}`                                | `getActiveRunById` then archived fallbacks             | Guest for active | Active window; archived: participant → organizer → admin ([`[id].astro:57-68`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/runs/%5Bid%5D.astro#L57-L68)) |
| `/runs/{id}/edit`                           | `getOwnedActiveRunForEdit`                             | Auth             | `organizer_id` + app `isRunActive` ([`runs.ts:297-318`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L297-L318))                           |
| `/runs/new`                                 | `listMapsForPicker` only                               | Auth             | No run rows                                                                                                                                                                                                       |
| `/dashboard`                                | `listRunsForOrganizer`                                 | Auth             | All own rows; app splits active/archived ([`runs.ts:325-373`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L325-L373))                     |
| `/runs/history`                             | `listArchivedRunsForParticipant`                       | Auth             | Confirmed ids **first**, then runs ([`runs.ts:376-416`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L376-L416))                           |
| `/admin/users/{id}`                         | `listArchivedRunsForParticipant(supabase, profile.id)` | Admin            | Target player's archived confirmed runs                                                                                                                                                                           |
| `/profile`, `/players/{id}`, `/admin` index | —                                                      | —                | **No run loads**                                                                                                                                                                                                  |

**Public catalog choke point:** `listActiveRuns` ([`runs.ts:227-268`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L227-L268)):

```sql
archived_at IS NULL AND starts_at > activeWindowStartsAfter()
```

Optional SQL: `date` → UTC day range on `starts_at`; `min_points` → `min_points <= viewer value`; `join` → `join_mode` eq. Optional **in-memory** `map` query matches map name, organizer nickname, and `map_category` ([`matchesMapOrOrganizer`:165-171](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L165-L171)). Parser: [`src/lib/run-list-filters.ts:65-86`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/run-list-filters.ts#L65-L86). Only `/runs` passes filters; landing does not.

**Detail:** `getActiveRunById` ([`runs.ts:271-291`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L271-L291)) — same active window, no search filters, invalid UUID returns `null` without a DB hit. Missing → HTTP 404, copy "This run is missing or no longer active." ([`[id].astro:102-140`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/runs/%5Bid%5D.astro#L102-L140)). Loaded run sets `<title>` to `{displayTitle}`.

**Mutation reads (not lists):**

- `updateRun` — owned + active window ([`runs.ts:622-629`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L622-L629))
- `loadActiveRunForMutation` — `id, join_mode, organizer_id` + active window ([`participants.ts:158-182`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/participants.ts#L158-L182))
- `requireActiveRun` (comments) — `select id` + active window ([`comments.ts:63-79`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/comments.ts#L63-L79))
- `deleteRunAsAdmin` — DELETE `.eq("id")` ([`admin.ts`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/admin.ts))

**RPCs:** `auto_join_run(p_run_id)` reads a full `runs` row `FOR UPDATE` and returns a **text outcome**, not run data ([`20260807123643_auto_join_run_rpc.sql:16-54`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260807123643_auto_join_run_rpc.sql#L16-L54)). `ensure_own_profile`, `is_confirmed_participant`, `is_run_in_active_window`, `is_run_organizer`, `are_friends` do not return run rows. No GET `/api/runs` list.

**Middleware** ([`src/middleware.ts:6-7, 59-62`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/middleware.ts#L6-L7)): `/runs` and `/runs/{id}` stay public. Do **not** prefix-protect `/runs` (AGENTS.md). Protected: `/dashboard`, `/runs/new`, `/runs/history`, `/profile`, `/admin`, `/runs/{id}/edit`.

`/runs` currently renders a **single flat list** of `ActiveRunCard` ([`index.astro:110-116`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/runs/index.astro#L110-L116)). Candidate default for FR-027: distinct Friends / Invited sections so restricted rows never mix into the public stack.

### 2. Postgres RLS / active-window policies

RLS enabled on `runs` ([`20260729134008_run_domain_schema.sql:190`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260729134008_run_domain_schema.sql#L190)). Grants: `SELECT` → `anon`, `authenticated`; `INSERT`/`UPDATE`/`DELETE` → `authenticated` ([`:148-149`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260729134008_run_domain_schema.sql#L148-L149)). Policies are **PERMISSIVE** (OR).

**SELECT on `runs` (current effective set):**

| Policy                                       | Role            | USING                                                              | Source                                                                                                                                                                                                        |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runs_select_active_anon`                    | `anon`          | `archived_at is null and starts_at > (now() - interval '1 hour')`  | [active-window migration:8-15](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260807104348_run_active_window_select.sql#L8-L15)             |
| `runs_select_active_authenticated`           | `authenticated` | same                                                               | [:17-24](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260807104348_run_active_window_select.sql#L17-L24)                                  |
| `runs_select_own_organizer`                  | `authenticated` | `auth.uid() = organizer_id` (any archive state)                    | [domain schema:204-208](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260729134008_run_domain_schema.sql#L204-L208)                        |
| `runs_select_admin`                          | `authenticated` | `is_admin()`                                                       | [:210-214](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260729134008_run_domain_schema.sql#L210-L214)                                     |
| `runs_select_archived_confirmed_participant` | `authenticated` | `is_confirmed_participant(id)` AND (stamped archive OR past grace) | [`20260817125800`:28-38](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql#L28-L38) |

**INSERT:** `runs_insert_own` — organizer + `is_not_banned()`, **no verified check** ([domain schema:216-223](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260729134008_run_domain_schema.sql#L216-L223)).

**UPDATE:** `runs_update_own` — organizer + not banned + **active window on USING and WITH CHECK** ([`20260820124849`:14-29](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260820124849_runs_update_active_invariants.sql#L14-L29)); `runs_update_admin` unbounded. Column grant currently: `title, map_id, map_category, starts_at, max_participants, min_points, join_mode` ([`20260821120000`:35-44](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260821120000_runs_map_category.sql#L35-L44)). A new `visibility` column needs a matching grant (same pattern as `map_category`).

**DELETE:** `runs_delete_admin` only. No organizer DELETE.

**There is no visibility/privacy column.** `runs.Row` in generated types: `archived_at, created_at, id, join_mode, map_category, map_id, max_participants, min_points, organizer_id, starts_at, title, updated_at` ([`src/types/database.ts:348-361`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/types/database.ts#L348-L361)).

**S-15 plug-in on SELECT:** the two `runs_select_active_*` policies are the guest leak. They must AND an audience predicate (or be replaced by: public+window for anon; public+window OR friends-only+window+`are_friends` OR invite-only+window+invite-row for authenticated). Organizer and admin SELECT stay unbounded so dashboard / S-06 delete keep working. Confirmed-participant archive SELECT must keep showing restricted runs the viewer sat on.

**Do not** call `is_run_in_active_window()` from a policy **on `runs`** — it SELECTs `runs` and recurses ([edit-run migration:5-6](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260820124849_runs_update_active_invariants.sql#L5-L6)). Inline the window expression, as today's active-window policies do.

**Related tables:**

- `run_participants`: anon/authenticated SELECT of **all confirmed rows with no join to run visibility** ([domain schema:257-267](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260729134008_run_domain_schema.sql#L257-L267)). Organizer auto-seat trigger inserts a confirmed row on every create ([`20260731111849`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260731111849_participant_apply_leave_and_organizer_seat.sql)). Tightening `runs` SELECT without tightening this policy still dumps every restricted `run_id` via PostgREST. INSERT pending (`run_participants_insert_self_pending`) also does **not** check run audience ([domain schema:294-302](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260729134008_run_domain_schema.sql#L294-L302)).
- `run_comments` / `run_comment_likes`: **no anon grant**; SELECT confirmed / admin / organizer ([`20260820092809`:78-105](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260820092809_run_comments.sql#L78-L105)). Out of feature-work scope, but must not be widened to "anyone who can see a friends-only run."
- `maps`: public catalog; no join through runs.

**Helpers (all DEFINER, execute to `authenticated` only, not `anon`):** `is_admin()`, `is_not_banned()`, `is_confirmed_participant(p_run_id)` (cycle break for archived SELECT), `is_run_organizer`, `is_run_in_active_window` (comment policies), `are_friends(a,b)` (S-15 hook, unused), `auto_join_run`.

**Cycle pattern:** `is_confirmed_participant` DEFINER-reads `run_participants` so `runs` policies never SELECT that table under RLS ([`20260817125800`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql)). `are_friends` is the same shape for `friend_requests`. An invite-membership helper, if used from `runs` policies, should be DEFINER too — do not inline `SELECT run_invites` under RLS if `run_invites` policies also join `runs`.

### 3. Create + edit run forms and APIs

**Create page:** [`src/pages/runs/new.astro`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/runs/new.astro) — protected, banned blocked in UI, passes `nickname` + `isVerified` into the form. **No verified gate** for create.

**Shared form:** [`CreateRunForm.tsx`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/components/runs/CreateRunForm.tsx) (create + edit). Action: `/api/runs` or `/api/runs/{id}`. Fields: optional nickname (unverified, no nick), optional title, `map_id`/`map_category` via `MapPicker`, required `starts_at`, capacity, min points, `join_mode`. Join mode sits at [`:239-263`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/components/runs/CreateRunForm.tsx#L239-L263) — natural home for a visibility select. Invitee multi-select would follow `MapPicker`'s hidden POST fields pattern; data from `listPublicFriends`.

**Create API:** [`src/pages/api/runs/index.ts`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/api/runs/index.ts) — parses title/map/starts/capacity/min_points/join_mode/nickname ([`:19-26`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/api/runs/index.ts#L19-L26)). Insert payload ([`:131-143`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/api/runs/index.ts#L131-L143)) has no visibility. Nickname rules: verified without nick → fail; unverified without nick → inline set. **Any member with a nickname can create.**

**Edit page:** [`src/pages/runs/[id]/edit.astro`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/runs/%5Bid%5D/edit.astro) — owner-only; 404 if not owner / not active; `joinModeLocked` = any non-organizer participant row. Reuses `CreateRunForm` with `edit` prop.

**Edit API:** `POST /api/runs/{id}` → `updateRun` ([`runs.ts:612-736`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/runs.ts#L612-L736)). Patch: title, map/category, starts_at, capacity, min_points, optional join_mode. Join-mode lock after any non-organizer participant (app + trigger `join_mode_locked`). Capacity floor vs confirmed roster (app + trigger `capacity_below_confirmed`). PRD open Q1 candidate: visibility / invite list remain editable on active runs.

**Verified gate for restricted modes:** new at API + RLS WITH CHECK. Unverified members keep creating **public** runs. Empty friends list: friends-only still valid per FR-027 (only organizer + admins see it until someone friends them); invite-only needs at least one picked friend per US-09.

### 4. Friends graph (S-11)

**Migration:** [`supabase/migrations/20260821130000_friend_requests.sql`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260821130000_friend_requests.sql)

| Artifact                      | Contract                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enum `friend_request_status`  | `pending`, `accepted`, `declined`                                                                                                                                                                                                                                                                                                               |
| Table `friend_requests`       | directed pair; unique unordered `(least, greatest)`; no self                                                                                                                                                                                                                                                                                    |
| Grants                        | `revoke` anon; SELECT/INSERT/UPDATE/DELETE to `authenticated` only ([`:30-31`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260821130000_friend_requests.sql#L30-L31))                                                                                                      |
| View `public_friendships`     | `security_invoker = false`; two rows per live edge; `user_id`, `friend_id` only; accepted + **both currently verified**; GRANT SELECT to **anon and authenticated** ([`:192-220`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260821130000_friend_requests.sql#L192-L220)) |
| `are_friends(a uuid, b uuid)` | STABLE DEFINER; accepted unordered pair AND both `public_profiles.is_verified`; execute to **authenticated only, not anon** ([`:228-261`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260821130000_friend_requests.sql#L228-L261))                                         |

Header comment: _"`are_friends()` is the S-15 hook; do not call it from policies on this table."_ ([`:3`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260821130000_friend_requests.sql#L3)). Recursion risk: helper SELECTs `friend_requests`.

**Live graph rule everywhere:** accepted + both currently verified. Unverify hides the edge without deleting the accepted row. Unfriend is **DELETE** of the accepted row (trigger forbids UPDATE of accepted).

**App service** [`src/lib/services/friends.ts`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/friends.ts):

- **"My friends":** `listPublicFriends(supabase, userId)` → `{ id, nickname }[]` from `public_friendships` + `public_profiles` ([`:146-179`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/friends.ts#L146-L179)). Invitee picker should reuse this.
- **"Is X my friend?":** `getRelationship` → `{ status, requestId }` where `accepted` means friends ([`:117-144`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/lib/services/friends.ts#L117-L144)). Unverified either party → `none`. **No `rpc('are_friends')` call in `src/`** — RLS should call the SQL helper; the picker does not need it.

APIs: `POST /api/friends/{request,accept,decline,cancel,unfriend}` via `postFriendMutation`. Surfaces: inbox on `/profile`; Add/Accept/Remove on `/players/{id}`. Pending names never on the public player page.

**`are_friends` is not used from any `runs` policy yet.** S-11 plan: _"`are_friends(organizer, viewer)` from runs policies later; this slice does not change runs."_

Friends-only visibility is **live** (unfriend or unverify drops access). Invite-only candidate default is a **snapshot** (unfriend after invite keeps access until the organizer edits the invite list). Those two modes must not share a single `are_friends`-only predicate.

### 5. Leak surfaces

If only `/runs` (or only `listActiveRuns` callers on that page) were filtered, guests and non-friends would still learn restricted runs exist.

**Must-fix with RLS (defense in depth):**

1. **`runs_select_active_anon` / `_authenticated`** — PostgREST `GET /rest/v1/runs` lists every active run. UI is not the boundary (F-01 publishable key).
2. **Landing `Welcome.astro`** — second public feed of `listActiveRuns`, links to `/runs/{id}`.
3. **Public `/runs/{id}`** — `getActiveRunById` 200 vs 404. Same 404 copy for missing/hidden (S-07: existence must not leak; do not 403). `<title>` and roster only render on 200.
4. **`run_participants_select_confirmed_anon`** — confirmed rows globally, including organizer auto-seat → every `run_id`. **Highest-priority sibling leak.** Scope confirmed SELECT to runs the viewer may see, or DEFINER-filter; do not leave "runs hidden, participants public."
5. **`loadActiveRunForMutation` + apply** — if SELECT succeeds, apply proceeds. Pending INSERT policy has no audience check. `auto_join_run` is DEFINER, locks by id, checks only active window + `join_mode` ([`:38-54`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260807123643_auto_join_run_rpc.sql#L38-L54)) — must add audience or a guessed UUID auto-joins a friends-only auto-join run.
6. **Error oracles if SELECT still succeeds:** kick/decide `"Only the organizer can…"` vs not-found; withdraw/leave "no application" / "not seated"; apply full/already-applied. After RLS hide: keep **uniform** `"Run not found or no longer active"` (lessons.md: never raw PostgREST in `?error=`).
7. **`is_run_in_active_window(uuid)`** — DEFINER `EXISTS` on `runs` **bypassing RLS**, granted to authenticated ([comments migration:22-41](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/supabase/migrations/20260820092809_run_comments.sql#L22-L41)). Signed-in UUID probe learns whether an **active** run exists. Comment INSERT already requires confirmed seat first (uniform denial). Planning should either encode audience in this helper or revoke/narrow execute. Do not call it from `runs` policies.

**Not leak surfaces today (still verify after RLS change):**

- Sitemap: `@astrojs/sitemap` is on, but **no `site`** in `astro.config.mjs`; SSR `/runs/{id}` is not enumerated. No `robots.txt`, RSS, OpenGraph, JSON-LD, GET list API, Realtime channels.
- `/players/{id}` does **not** list organized/joined runs.
- Map catalog has no "runs on this map" page.
- Comments: guests cannot SELECT the tables; page thread only if `canReadComments` (confirmed / archived participant / organizer / admin) ([`[id].astro:91-95`](https://github.com/Miigget/book_your_miggets/blob/0b7263d34e3538fe8f2cc97119d558a97d8476fe/src/pages/runs/%5Bid%5D.astro#L91-L95)). Non-seated comment POST is uniform "Only confirmed participants…".
- Guest apply → sign-in `returnTo=/runs/{uuid}` — UUID already known to the applicant; after login they must still 404 if not in audience.
- Invalid UUID: `"Invalid run"` / `"Invalid request"` — format oracle only.

**Surfaces that MUST keep seeing restricted runs:**

| Who                         | Where                                                                         | Why                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organizer                   | `/dashboard`, owned `/runs/{id}`, `/runs/{id}/edit`                           | FR-005 / FR-021; `runs_select_own_organizer`                                                                                                                                         |
| Invitee / friend (audience) | `/runs` (Friends/Invited sections), `/runs/{id}`, apply                       | FR-027 / FR-028                                                                                                                                                                      |
| Confirmed participant       | `/runs/history`, archived `/runs/{id}`                                        | FR-015; even after unfriend if they were seated                                                                                                                                      |
| Admin                       | `/runs`, `/runs/{id}`, S-06 delete control, `/admin/users/{id}` archived list | FR-010; `runs_select_admin`. There is **no admin run index** — "To delete a run, open its detail page." If `/runs` hid restricted rows from admins, delete loses its discovery path. |

`listActiveRuns` today applies the active window in SQL for **everyone including admins**. Admin discovery of **active** restricted runs is the public list + detail, via `runs_select_admin` OR-composed with the window policy. After S-15, admin must still match `runs_select_admin` (or an explicit admin branch in the active SELECT rewrite) so `listActiveRuns` / `getActiveRunById` return restricted rows for admins.

### 6. Historical decisions that constrain this slice

- **F-01** (`context/archive/2026-07-29-run-domain-schema/`): publishable key; RLS is the boundary. Anon SELECT on confirmed participants is global.
- **S-01** (`context/archive/2026-07-29-create-and-list-runs/`): `/runs` public; guest detail 404 if missing/archived.
- **S-04** (`context/archive/2026-08-07-run-archival-lifecycle/`): app **and** RLS share the 1h window so PostgREST cannot list past-grace rows. Restricted visibility **adds** an axis; it must not drop the window. Organizer/admin SELECT stay unbounded; **app** still applies the window on active UX. Research artifact: `context/archive/2026-08-07-run-archival-lifecycle/research.md`.
- **S-03** (`context/archive/2026-08-17-search-filter-runs/`): filters live in `listActiveRuns` (choke point); no GET `/api/runs`; `getActiveRunById` stays unfiltered. Visibility belongs in that choke point **and** RLS. Landing also calls `listActiveRuns`.
- **S-05** (`context/archive/2026-08-07-auto-join-mode/`): `auto_join_run` DEFINER is the single confirmed-insert authority; it already mirrors the active window and must gain audience. Research: `context/archive/2026-08-07-auto-join-mode/research.md`.
- **S-06** (`context/archive/2026-08-07-admin-moderation-tools/`): delete from **detail**, no duplicate admin runs table. Admins must see restricted runs. Research: `context/archive/2026-08-07-admin-moderation-tools/research.md`.
- **S-07** (`context/archive/2026-08-17-participant-archive-history/`): dual defense RLS + app 404; same `/runs/{id}` URL; same 404 copy; do not scan all RLS-visible archived rows on `/runs/history`.
- **S-08** (`context/archive/2026-08-18-my-runs-dashboard/`): organizer inventory by `organizer_id`, never by dumping RLS-visible archived rows. Restricted created runs stay on `/dashboard`.
- **S-11** (`context/archive/2026-08-21-add-friends/`): `are_friends` + `public_friendships` shipped as S-15 contract; live graph = accepted + both verified; unfriend DELETE because S-15 assumes a live graph; no anon on `friend_requests`; do not call `are_friends` from that table's policies. Friends-only/invite-only explicitly out of S-11.
- **S-12** (`context/archive/2026-08-20-run-comments/`): comment **read** is confirmed + admin + unseated organizer — **not** "anyone who can view the run." S-15 must not widen that. Mutations duplicate the active-window query.
- **S-13** (`context/archive/2026-08-20-edit-run/`): UPDATE RLS + trigger, not app-only; non-owner `/edit` 404; S-15 visibility edit was out of scope.
- **lessons.md:** only intentional strings in `?error=`; log raw Auth/PostgREST server-side.
- **Roadmap S-15 risk:** both modes share one RLS axis so they ship together; splitting duplicates leak-risk. Candidate defaults: distinct Friends/Invited sections; invite snapshot at create/edit.

## Code References

- `src/lib/services/runs.ts:52-76` — `RUN_SELECT`; no visibility column
- `src/lib/services/runs.ts:227-291` — `listActiveRuns` + `getActiveRunById` (public catalog)
- `src/lib/services/runs.ts:325-373` — `listRunsForOrganizer` (must keep restricted)
- `src/lib/services/participants.ts:158-215` — `loadActiveRunForMutation` + `auto_join_run` outcome mapping
- `src/lib/services/friends.ts:117-179` — `getRelationship` / `listPublicFriends`
- `src/lib/run-lifecycle.ts:1-19` — 1h grace app mirror
- `src/middleware.ts:6-7` — `/runs` not protected
- `src/components/Welcome.astro:10-13` — second public feed
- `src/components/runs/CreateRunForm.tsx:239-263` — join-mode control; visibility plug-in
- `src/pages/api/runs/index.ts:131-143` — create insert payload
- `src/pages/runs/[id].astro:57-140` — detail loader + uniform 404
- `supabase/migrations/20260807104348_run_active_window_select.sql:8-24` — guest/auth active SELECT
- `supabase/migrations/20260729134008_run_domain_schema.sql:204-223,257-302` — organizer/admin SELECT, insert, confirmed-participant leak
- `supabase/migrations/20260807123643_auto_join_run_rpc.sql:38-54` — DEFINER, audience-blind
- `supabase/migrations/20260820092809_run_comments.sql:22-41` — `is_run_in_active_window` existence oracle
- `supabase/migrations/20260821130000_friend_requests.sql:3,192-261` — `public_friendships` + `are_friends` S-15 hook
- `supabase/migrations/20260821120000_runs_map_category.sql:35-44` — UPDATE column-grant pattern to copy for `visibility`
- `src/types/database.ts:348-361,450` — `runs` columns; `are_friends` args

## Architecture Insights

1. **Two axes, one PERMISSIVE OR matrix.** Active window is axis 1; audience (public / friends-only / invite-only) is axis 2. Guest active SELECT today is axis 1 only. S-15 adds axis 2 without removing organizer/admin/archive extras.
2. **Choke points are shared.** `listActiveRuns` feeds `/runs` **and** landing. `getActiveRunById` is the public detail gate. `loadActiveRunForMutation` is every apply/withdraw/leave/kick/decide gate. Fixing one page is insufficient; fixing the three service functions without RLS is also insufficient.
3. **DEFINER helpers are the recursion pattern.** `is_confirmed_participant` for archive; `are_friends` for live friendship; a new `is_run_invitee` (or similar) if invite snapshot is a table that must not cycle with `runs`. Never call those helpers from policies on the table they read.
4. **Column grants are a second lock on UPDATE.** S-13/S-14 revoked table UPDATE then granted an explicit column list. Visibility (and possibly invite rows via a child table) need that grant plus `enforce_run_update_invariants` only if there are illegal transitions (e.g. invite-only → public after seats?).
5. **Search is post-fetch.** If RLS hides restricted rows, `?map=` cannot leak them. If RLS does not, nickname search finds friends-only runs by organizer nick.
6. **Join mode stays orthogonal.** Approval vs auto-join still applies among people who can see the run (PRD). Auto-join RPC must learn the same audience as SELECT.
7. **404, not 403.** Established for archived non-participants (S-07) and non-owner edit (S-13). Restricted non-audience should look like "missing or no longer active."

## Historical Context (from prior changes)

- `context/archive/2026-07-29-run-domain-schema/plan.md` — RLS is the authz boundary; anon confirmed-participant SELECT is global
- `context/archive/2026-08-07-run-archival-lifecycle/plan.md` — dual app+RLS active window; organizer/admin SELECT unbounded
- `context/archive/2026-08-07-run-archival-lifecycle/research.md` — planning-ready S-04 map of list/detail/mutation gates
- `context/archive/2026-08-17-search-filter-runs/plan.md` — `listActiveRuns` is the filter choke point; no public GET API
- `context/archive/2026-08-17-participant-archive-history/plan.md` — 404 copy; confirmed-ids-first history query
- `context/archive/2026-08-18-my-runs-dashboard/plan.md` — organizer inventory by `organizer_id`
- `context/archive/2026-08-07-admin-moderation-tools/plan-brief.md` — delete from detail, no admin run index
- `context/archive/2026-08-20-run-comments/crew-decisions.md` — comment readers narrower than PRD "can view the run"
- `context/archive/2026-08-20-edit-run/plan.md` — UPDATE invariants; visibility out of scope
- `context/archive/2026-08-21-add-friends/plan.md` — `are_friends` contract; live verified graph; S-15 deferred
- `context/archive/2026-08-21-add-friends/crew-decisions.md` — unfriend DELETE because S-15 assumes live graph; unverify keeps rows
- `context/foundation/prd.md` — FR-027/FR-028, US-08/US-09, Access Control v1.1
- `context/foundation/roadmap.md` — S-15 risk, candidate defaults, waits on S-11 (now archived)

## Related Research

- `context/archive/2026-08-07-run-archival-lifecycle/research.md` — active-window / derived-at-read (now shipped)
- `context/archive/2026-08-07-admin-moderation-tools/research.md` — admin delete/ban/verify surfaces
- `context/archive/2026-08-07-auto-join-mode/research.md` — `auto_join_run` DEFINER contract
- No prior `research.md` for S-11 add-friends (plan skipped research); the archived plan.md is the friends-graph source of truth

## Open Questions

These are planning inputs, not blockers for this research. Crew Lead already locked candidate defaults where noted.

1. **Friends-only list presentation** — distinct Friends / Invited sections vs highlight in one list. Owner: user. Candidate: distinct sections on `/runs` (`change.md`, roadmap Q5). Does not block planning.
2. **Invite-only after unfriend** — snapshot vs live. Owner: user. Candidate: snapshot at create/edit (`change.md`, roadmap Q6). Friends-only stays live `are_friends`.
3. **Invite storage** — child table `run_invites(run_id, user_id)` vs array column. Child table matches snapshot + RLS `EXISTS`; array is simpler but harder to index and to grant independently. Planning decision.
4. **`run_participants` confirmed SELECT rewrite** — required to stop PostgREST ID dump. Shape: DEFINER helper `can_view_run(id)` vs tightening USING to join audience. Must not reintroduce the runs↔participants RLS cycle (use DEFINER).
5. **`auto_join_run` + pending INSERT** — both need the same audience check as SELECT, or a guessed UUID still joins.
6. **`is_run_in_active_window` existence oracle** — encode audience, wrap behind confirmed-only callers, or accept authenticated UUID probing of _activity_ (not title) as residual. Prefer closing it.
7. **Admin active-list discovery** — keep restricted rows in admin `listActiveRuns` (via `runs_select_admin`) vs add an admin-only index. Historical S-06: no second list; prefer first.
8. **Visibility edits after seats** — PRD Q1 candidate allows invite list / visibility on active runs. Confirm whether public→restricted (hide from current pending applicants) and restricted→public are allowed; join_mode stays locked independently.
9. **Verified-only create of restricted modes** — PRD yes. Enforce in API + INSERT WITH CHECK (or trigger), not UI only. Unverified create of `public` stays.
10. **Comment feature work** — out of scope. Do not change comment SELECT policies except if a helper they call (`is_run_in_active_window`) is rewritten for audience; keep readers = confirmed + admin + organizer.
