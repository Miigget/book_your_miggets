# Restricted run visibility Implementation Plan

## Overview

Ship S-15 / FR-027 / FR-028 / US-08 / US-09: a verified organizer can create a **friends-only** or **invite-only** run. Guests and everyone outside the audience must not see those runs on landing, `/runs`, `/runs/{id}`, PostgREST, or sibling tables. RLS is the real boundary (publishable anon key); the app matches it and 404s like a missing run.

## Current State Analysis

Every active run is world-readable. There is no `visibility` column and no invite table. Guest and signed-in default SELECT share the FR-013 active window. Organizer, admin, and archived-confirmed-participant policies sit beside that window as extra PERMISSIVE OR paths.

`listActiveRuns` feeds `/runs` (one flat `ActiveRunCard` list) and landing `Welcome.astro` (first 6). `getActiveRunById` is the public detail gate (HTTP 404, copy "This run is missing or no longer active."). `loadActiveRunForMutation` is every apply/withdraw/leave/kick/decide gate.

S-11 already shipped `are_friends(a, b)` (`STABLE` / `SECURITY DEFINER`, `authenticated` only) and `listPublicFriends`. Neither is used from `runs` policies or `src/` run code.

Sibling leaks if only the UI is filtered: global confirmed `run_participants` SELECT (organizer auto-seat dumps every `run_id`), `auto_join_run` DEFINER (audience-blind), `is_run_in_active_window` existence oracle, kick/decide organizer-only error strings when SELECT still succeeds.

No test runner — verification is migration apply, `npm run db:types` / lint / build, SQL smoke, and UI.

## Desired End State

A verified organizer creates a public, friends-only, or invite-only run (invite-only with ≥1 picked friend). Unverified members still create **public** runs only.

Guests see only public active runs (list, landing preview, detail, PostgREST). A signed-in friend sees the organizer's friends-only runs in a **Friends** section on `/runs`, never mixed into Public. An invitee sees invite-only runs in **Invited**. An admin who is not in that audience sees leftovers in an admin-only **Restricted** section. Missing audience → same 404 as a missing run, never 403.

Friends-only uses live `are_friends(organizer, viewer)`. Invite-only is a snapshot in `run_invites` (unfriend does not drop access until the organizer edits the list). Confirmed participants keep SELECT after unfriend / invite removal / public→restricted. Pending non-audience get 404; their rows are not auto-deleted.

Admins still open any restricted detail and use S-06 delete. Comment read ACL stays confirmed + admin + unseated organizer.

### Key Discoveries:

- `listActiveRuns` (`src/lib/services/runs.ts:227-268`) and `getActiveRunById` (`:271-291`) are the public catalog choke points; landing is a second caller (`src/components/Welcome.astro:10-13`)
- Active-window SELECT policies (`supabase/migrations/20260807104348_run_active_window_select.sql:8-24`) must AND audience; do **not** call `is_run_in_active_window()` from a policy **on `runs`** (it SELECTs `runs` and recurses — `20260820124849_runs_update_active_invariants.sql:5-6`)
- `are_friends` is the live-graph hook (`20260821130000_friend_requests.sql:228-261`); an invite helper must DEFINER-read `run_invites` only so `runs` policies do not cycle
- Confirmed `run_participants` SELECT is global (`20260729134008_run_domain_schema.sql:257-267`) — highest-priority sibling leak
- `auto_join_run` locks a run by id with no audience check (`20260807123643_auto_join_run_rpc.sql:38-54`)
- Latest UPDATE column grant is `20260821120000_runs_map_category.sql:35-44` — `visibility` must be appended the same way
- Join-mode UI at `CreateRunForm.tsx:239-262` is the natural home for a visibility `<select>`; MapPicker hidden fields are the invitee POST pattern
- `/runs` sectioning should copy dashboard `gap-10` + `h2` (`src/pages/dashboard.astro:58-60`)
- `loadActiveRunForMutation` already 404s with `"Run not found or no longer active"` when SELECT misses (`participants.ts:158-182`) — tightening `runs` SELECT closes kick/decide oracles without new copy
- `requireActiveRun` in comments uses a `runs` SELECT, not the window RPC (`comments.ts:63-79`); tightening SELECT 404s hidden runs without widening comment read ACL

## What We're NOT Doing

- Comments feature work or widening comment SELECT (confirmed + admin + organizer stays)
- Player labels (S-17) or admin profile edits (S-16)
- A new `/admin` runs index (S-06 delete stays on detail)
- Mixing restricted rows into the public/guest stack (including for admins)
- Live friendship checks on invite-only after unfriend
- Locking visibility after seats (join_mode lock stays independent)
- Auto-deleting pending rows when audience shrinks
- Prefix-protecting `/runs` or adding `/runs/{id}` to `PROTECTED_ROUTES`
- Vitest/Jest / pgTAP
- Hand-editing `src/types/database.ts` (use `npm run db:types`)
- Friend activity feeds, DMs, or blocking

## Implementation Approach

Add a `visibility` axis beside the existing active window, in one migration, so both restricted modes share the leak-close. Postgres RLS is authoritative; app loaders match it; hidden runs 404.

Phase 1 lands schema + helpers + policy rewrites + sibling leak closes with **no user-visible UI** (existing rows default `public`), including the two named invite-only INVOKER RPCs and the verified conjunct on both INSERT and UPDATE. Phase 2 is create/edit + verified gate + invite picker (invite-only writes only via those RPCs). Phase 3 is `/runs` sections, public-only landing and guest `/runs` (`publicOnly`), and visibility on cards/detail.

## Critical Implementation Details

**Helpers vs `runs` policies.** `can_view_run(p_run_id)` DEFINER-reads `runs` and must **not** be called from policies on `runs` (same recursion as `is_run_in_active_window`). `runs` SELECT uses inline window + `visibility` + `are_friends(organizer_id, (select auth.uid()))` + `is_run_invitee(id)` + existing organizer/admin/confirmed policies. Sibling tables, `auto_join_run`, pending INSERT, and `is_run_in_active_window` call `can_view_run`.

**`can_view_run` window is one-way.** `can_view_run` must **inline** `archived_at is null and starts_at > now() - interval '1 hour'` and must **never** call `is_run_in_active_window`. After Phase 1, `is_run_in_active_window` ANDs `can_view_run`; a reverse call recurses (42P17). Direction is only: window helper → `can_view_run`.

**Unverified restricted writes.** Copy the INSERT audience conjunct onto `runs_update_own` WITH CHECK: `visibility = 'public'` OR organizer currently verified via `public_profiles.is_verified`. After unverify, any save that leaves the row restricted fails (title-only included) until they switch visibility to `public`. `runs_update_admin` stays unbounded.

**Invite-only ≥1 cannot be a non-deferrable CHECK on `runs` INSERT.** PostgREST commits each statement; invite rows cannot exist before the run row, and the organizer has no DELETE policy to compensate. Phase 1 **requires** two named `SECURITY INVOKER` RPCs (drop “may”): `create_invite_only_run` and `set_run_visibility_and_invites`. Invite-only create/edit must use them; never pair `updateRun` + `sync_run_invites` (or any invite replace) as separate Worker statements. Public and friends-only create/edit keep `.from("runs").insert()` / `updateRun`.

**`is_run_in_active_window` oracle.** Do not revoke `EXECUTE` (comment policies still need it). Change the body to existing window **AND** `can_view_run(p_run_id)` so a UUID probe of a hidden active run returns false, same as missing. Confirmed seats still pass because `can_view_run` includes `is_confirmed_participant`.

**RLS initPlan.** Wrap `(select auth.uid())` and row-independent DEFINER calls. Do not wrap `is_run_invitee(id)` / `is_confirmed_participant(id)` as a statement-level `select` — they depend on the row.

---

## Phase 1: Schema, RLS, and sibling leak closes

### Overview

Land `visibility`, `run_invites`, cycle-safe helpers, rewritten `runs` / `run_participants` policies, audience-aware `auto_join_run` and `is_run_in_active_window`, **required** `create_invite_only_run` / `set_run_visibility_and_invites`, and the verified conjunct on both `runs_insert_own` and `runs_update_own`. Existing public runs keep behaving. No create-form UI yet.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_restricted_run_visibility.sql` (create with `npx supabase migration new restricted_run_visibility`; keep the suffix)

**Intent**: Add the visibility axis and invite snapshot, then make SELECT and join paths honor audience so PostgREST cannot list or join hidden runs.

**Contract**:

- Enum `run_visibility`: `public`, `friends_only`, `invite_only`
- `runs.visibility` `not null default 'public'` (backfill existing rows)
- Table `run_invites`: `run_id` → `runs(id)` ON DELETE CASCADE, `user_id` → `profiles(id)` ON DELETE CASCADE, `created_at`, PK `(run_id, user_id)`; index on `user_id`; `revoke all` from `public`/`anon`; `grant select, insert, delete` to `authenticated`; RLS enabled
- `run_invites` policies `TO authenticated` with `(select auth.uid())`: SELECT organizer (EXISTS own `runs` row), invitee (`user_id = uid`), admin (`is_admin()`); INSERT/DELETE organizer of an **active** run (same window expression as `runs_update_own`, not `is_run_in_active_window()`). Do not inline `SELECT run_invites` from `runs` policies
- `is_run_invitee(p_run_id uuid) returns boolean` — `STABLE` `SECURITY DEFINER` `search_path = ''`; EXISTS `run_invites` for `(p_run_id, auth.uid())`; revoke from `public`/`anon`; grant `authenticated` only. Do not call from policies on `run_invites`
- `can_view_run(p_run_id uuid) returns boolean` — `STABLE` `SECURITY DEFINER` `search_path = ''`; grant **anon and authenticated**. True when: `is_admin()`; or `auth.uid() = organizer_id`; or `is_confirmed_participant(p_run_id)`; or **inlined** active window (`archived_at is null and starts_at > now() - interval '1 hour'`) **and** (`visibility = public` OR (`friends_only` AND `are_friends(organizer_id, uid)`) OR (`invite_only` AND invite row for uid)). Anon: only public + inlined window (do not call `are_friends`). **Never** used from `runs` policies. **Never** call `is_run_in_active_window` from `can_view_run` (one-way: window helper → `can_view_run` only)
- Replace `runs_select_active_anon` USING: window AND `visibility = 'public'`
- Replace `runs_select_active_authenticated` USING: window AND (`public` OR (`friends_only` AND `are_friends(organizer_id, (select auth.uid()))`) OR (`invite_only` AND `is_run_invitee(id)`))
- Keep `runs_select_own_organizer` and `runs_select_admin` unbounded
- Drop/recreate the archived confirmed policy as `runs_select_confirmed_participant`: `is_confirmed_participant(id)` with **no** archive/window conjunct (seated viewers keep SELECT on active restricted runs after unfriend / invite removal / public→restricted)
- `runs_insert_own` WITH CHECK: existing organizer + `is_not_banned()`, plus `visibility = 'public'` OR organizer is currently verified via `public_profiles.is_verified`
- `runs_update_own` WITH CHECK: keep organizer + `is_not_banned()` + active window, **plus the same audience conjunct as INSERT** (`visibility = 'public'` OR organizer currently verified via `public_profiles.is_verified`). USING stays organizer + not banned + window (no verified conjunct on OLD). After unverify, any UPDATE that leaves `NEW.visibility` restricted fails until they set `public`
- `GRANT UPDATE` on `runs`: revoke/re-grant the map_category list **plus `visibility`**
- Do **not** add a visibility lock to `enforce_run_update_invariants` (join_mode lock unchanged; unverified-restricted is the WITH CHECK conjunct, not a trigger)
- `run_participants_select_confirmed_anon` / `_authenticated`: AND `can_view_run(run_id)` (closes the auto-seat `run_id` dump; guests lose PostgREST dump of archived public rosters — intentional)
- Leave `run_participants_select_own` unchanged (own pending after audience loss is residual; they already know the UUID)
- `run_participants_insert_self_pending` WITH CHECK: add `can_view_run(run_id)`
- `auto_join_run`: after the row lock, if `not can_view_run(p_run_id)` return `not_active` (same as missing — no new oracle)
- `is_run_in_active_window`: window AND `can_view_run(p_run_id)`; keep grant to `authenticated` only
- **Required** INVOKER RPCs (create in this migration; not optional). INVOKER so `runs` / `run_invites` RLS still apply. Grant `EXECUTE` to `authenticated`; revoke `public`/`anon`.
  - `create_invite_only_run(...) RETURNS uuid` — full insert column list matching today’s create payload (`p_title, p_map_id, p_map_category, p_starts_at, p_max_participants, p_min_points, p_join_mode`) plus `p_invitee_ids uuid[]`. Sets `visibility = 'invite_only'`, `organizer_id = auth.uid()`, `archived_at = null`. Inserts the run and replaces `run_invites` in **one transaction**. Returns the new `runs.id`.
  - `set_run_visibility_and_invites(p_run_id uuid, p_visibility run_visibility, p_invitee_ids uuid[], p_title text, p_map_id uuid, p_map_category text, p_starts_at timestamptz, p_max_participants int, p_min_points int, p_join_mode text)` — identifying triple plus the same patchable columns as today’s `updateRun`. `p_join_mode` null = leave `join_mode` unchanged. Because Phase 2 invite-only edits call this **instead of** `updateRun` (never after it), the function UPDATEs those columns on the run row in the same statement so S-13 `enforce_run_update_invariants` still fires. Replaces `run_invites` in the same transaction. Raise `invite_list_empty` **before mutating** if `p_visibility` is `invite_only` and the array is empty.
  - Do **not** expose a Worker-called `sync_run_invites` as a separate write. Invite replace lives inside these two RPCs only (a SQL-internal helper is fine).
  - Each **new** invitee must be `are_friends(organizer, invitee)` at write time; invitee ≠ organizer; invite-only with empty array raises a `P0001` name the app can map (e.g. `invite_list_empty`). Replacing the snapshot does **not** require remaining invitees to still be friends (unfriended snapshot members stay until the organizer removes them)

#### 2. Generated types

**File**: `src/types/database.ts` via `npm run db:types`

**Intent**: Expose the enum, column, table, and RPCs to the typed client.

**Contract**: `Enums.run_visibility`, `runs.Row.visibility`, `run_invites` table, `can_view_run` / `is_run_invitee` / `create_invite_only_run` / `set_run_visibility_and_invites` args. Do not hand-edit. Both writer RPCs must appear in generated `Functions`.

### Success Criteria:

#### Automated Verification:

- Migration exists under `supabase/migrations/` with RLS per operation on `run_invites`, no anon grant on that table, `visibility` default `public`
- `npx supabase db reset` (or project-equivalent apply) succeeds locally
- `npm run db:types` includes `run_visibility`, `runs.visibility`, `run_invites`, `can_view_run`, `is_run_invitee`, `create_invite_only_run`, `set_run_visibility_and_invites`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- SQL: anon SELECT `runs` returns only `visibility = public` rows inside the active window; a friends-only/invite-only seed is absent
- SQL: authenticated non-friend non-invitee non-admin cannot SELECT a restricted active run; organizer, admin, and confirmed participant can
- SQL: `are_friends` true → friends-only SELECT succeeds; after DELETE of the accepted friend row, non-seated friend loses SELECT; seated confirmed still SELECTs
- SQL: invitee SELECT invite-only succeeds after unfriend; non-invitee friend does not
- SQL: anon/authenticated confirmed `run_participants` SELECT does not return organizer auto-seats for a hidden run
- SQL: `auto_join_run` on a hidden UUID returns `not_active` (not `confirmed`)
- SQL: `is_run_in_active_window(hidden_id)` is false for a non-audience authenticated user; true for a confirmed seat on that active run
- SQL: unverified INSERT `friends_only` / `invite_only` fails WITH CHECK; unverified INSERT `public` succeeds
- SQL: invite-only writer rejects 0 invitees; accepts ≥1 current friend; keeping an unfriended snapshot id on replace succeeds; `create_invite_only_run` and `set_run_visibility_and_invites` exist and are the writers used in smoke (not a separate Worker-facing `sync_run_invites`)
- PostgREST as anon: `GET /rest/v1/runs` does not include restricted ids
- SQL: unverified UPDATE of an owned public run to `friends_only` / `invite_only` fails WITH CHECK; unverified UPDATE that keeps or sets `public` succeeds; after unverify, a title-only save that leaves the row restricted fails until visibility is `public`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Create and edit visibility + invite picker

### Overview

Verified organizers can set visibility and (for invite-only) pick friends. APIs and RLS WITH CHECK / RPCs enforce what the form cannot. Unverified create **and edit** stay public-only (same `?error=` string; `runs_update_own` WITH CHECK). Visibility and invite list stay editable on active runs; join_mode lock is unchanged. Invite-only create/edit use the Phase 1 named RPCs only.

### Changes Required:

#### 1. Run DTOs and update path

**File**: `src/lib/services/runs.ts`

**Intent**: Carry `visibility` through `RUN_SELECT` / `RunListItem` / `RunDetail` and allow organizers to patch it on active owned runs.

**Contract**: Add `visibility` to `RUN_SELECT`, `RunRow`, `RunListItem` (hence detail, dashboard, archive list items). Add `VISIBILITIES` + `isVisibility` beside `isJoinMode` (`:535-539`). Extend `UpdateRunInput` and the update patch with `visibility` (always patchable when the run is owned+active — not gated by `joinModeLocked`). Public/friends-only edits use this patch; invite-only edits must **not** go through `updateRun` (they use `set_run_visibility_and_invites`). Map RPC/trigger `invite_list_empty` / `invitee_not_friend` to `RunError` messages. `getOwnedActiveRunForEdit` keeps owner+active gating.

#### 2. Invite snapshot service

**File**: `src/lib/services/runs.ts` (or a small sibling in the same folder if the file gets unwieldy — prefer keeping run-audience writes next to `updateRun`)

**Intent**: Load the current snapshot for the edit form and replace it atomically with the Phase 1 RPCs.

**Contract**: `listRunInviteeIds(supabase, runId)` → `string[]` from `run_invites` (organizer SELECT). Invite-only create calls `create_invite_only_run` only (not `.insert()` then a second invite write). Invite-only edit calls `set_run_visibility_and_invites` **instead of** `updateRun` (the RPC UPDATEs the run row so S-13 triggers still fire); never call `updateRun` then the RPC, and never pair `updateRun` + `sync_run_invites` as separate statements. Public/friends-only keep `.insert()` / `updateRun`. New ids must be in `listPublicFriends`; ids already on the snapshot may remain even if no longer friends.

#### 3. Create API

**File**: `src/pages/api/runs/index.ts`

**Intent**: Accept `visibility` and `invitee_ids`; reject restricted modes for unverified organizers; create invite-only atomically.

**Contract**: Parse `visibility` (default `public`) and `invitee_ids` via `FormData.getAll`. Unverified + non-public → `fail` with a fixed string (e.g. "Verify your account to create friends-only or invite-only runs") — **reuse this exact `?error=` string on edit**. Invite-only with `<1` id → `fail` before the DB. Public/friends-only: existing `.insert()` plus `visibility`. Invite-only: `create_invite_only_run` in one transaction (never insert + separate invite write); map domain errors through `fail()`. Success still redirects to `/runs/${id}`. Log raw PostgREST with `console.error`; only intentional strings in `?error=`.

#### 4. Edit API

**File**: `src/pages/api/runs/[id]/index.ts` + `updateRun`

**Intent**: Let the organizer change visibility and the invite snapshot on an active run without touching the join_mode lock; keep unverified organizers from PATCHing into restricted.

**Contract**: Parse `visibility` + `invitee_ids`. Unverified + non-public → `fail` with the **same** `?error=` string as create (redirect still `/runs/{id}/edit?error=`). Result `invite_only`: call `set_run_visibility_and_invites` **instead of** `updateRun` (RPC UPDATEs visibility + the same patchable columns + replaces invites in one transaction so S-13 triggers fire). Do not call `updateRun` on this path, and do not call the RPC _after_ `updateRun`. Result `public` / `friends_only`: `updateRun` (including `visibility`); do not pair it with a separate invite-sync statement. Failed invite-only edit leaves the previous snapshot. `join_mode` still omitted from POST when locked (`CreateRunForm` already does this). Errors via `/runs/{id}/edit?error=`.

#### 5. Create/edit form

**File**: `src/components/runs/CreateRunForm.tsx`

**Intent**: Visibility control next to join mode; invitee multi-select only when invite-only and the organizer is verified.

**Contract**: New prop `friends: { id: string; nickname: string | null }[]` (from `listPublicFriends` on new + edit pages). Edit payload includes `visibility` and `inviteeIds`. Unverified create: only `public` (select disabled or omitted; hidden `visibility=public`). Invite-only UI: checkboxes/hidden `invitee_ids` for current friends **plus** snapshot ids not in the friends list (still selected, removable). On edit, load `public_profiles.nickname` for snapshot invitee ids missing from `listPublicFriends` (same join as `listPublicFriends`) so leftovers are not raw UUIDs. Client validate invite-only ≥1. Do not lock visibility after seats.

#### 6. Pages that mount the form

**Files**: `src/pages/runs/new.astro`, `src/pages/runs/[id]/edit.astro`

**Intent**: Pass friends + current visibility/invitees into the island.

**Contract**: `new.astro` already loads `isVerified`; also `listPublicFriends` when verified (else `[]`). `edit.astro` loads friends, `run.visibility`, and `listRunInviteeIds`. For snapshot ids missing from `listPublicFriends`, fetch nicknames from `public_profiles` (same `id, nickname` select as `listPublicFriends`) and merge into the `friends` prop so the island can label leftovers. Keep passing `isVerified={false}` on edit for the nickname gate; visibility editing is allowed regardless of that stub (the unverified-restricted gate is API + `runs_update_own` WITH CHECK, not this stub).

### Success Criteria:

#### Automated Verification:

- Create and edit APIs parse `visibility` / `invitee_ids`; unverified non-public is rejected in **both** the create handler and the edit handler with the same `?error=` string
- `CreateRunForm` posts `visibility` and (when invite-only) `invitee_ids`; unverified create cannot post restricted values
- `updateRun` patches `visibility` independently of `joinModeLocked` on public/friends-only edits; invite-only edits call `set_run_visibility_and_invites` instead of `updateRun` (never `updateRun` then RPC / `sync_run_invites`)
- `npm run lint` passes
- `npm run build` passes
- Edit form/page loads `public_profiles` nicknames for snapshot invitee ids missing from `listPublicFriends`

#### Manual Verification:

- Unverified `/runs/new`: only public; submitting friends-only (tampered POST) fails with a friendly `?error=`
- Unverified owner `/runs/{id}/edit`: tampered POST to friends-only/invite-only fails with that same `?error=` string; after unverify, a save that leaves the run restricted fails until they switch to public
- Verified create public: still appears on guest `/runs`
- Verified create friends-only with 0 friends: succeeds; guest `/runs` and `/runs/{id}` 404; organizer dashboard and detail work
- Verified create invite-only with 0 picks: rejected, no new run row
- Verified create invite-only with ≥1 friend: invitee can open detail and apply; another friend of the organizer cannot; guest 404
- Edit: public→friends-only hides from guests; invite list add/remove; removing the last invitee on invite-only fails and keeps the previous list; leftover unfriended invitees show nicknames not UUIDs
- Edit: join_mode still locks after a non-organizer participant; visibility remains editable
- Unfriend after invite-only: invitee still opens `/runs/{id}`; friends-only unfriend (non-seated) 404s
- http://localhost:4321/runs/new and http://localhost:4321/runs/{id}/edit (after `npm run dev` + local Supabase)

---

## Phase 3: `/runs` sections, public landing, detail 404

### Overview

Signed-in `/runs` shows Public / Friends / Invited (and admin-only Restricted) without mixing restricted rows into Public. Landing preview is public-only even for signed-in viewers. Detail stays uniform 404. Cards/detail show visibility so the audience can tell why a run is in a section.

### Changes Required:

#### 1. List partition

**Files**: `src/lib/run-list-sections.ts` (new), `src/pages/runs/index.astro`

**Intent**: One `listActiveRuns` fetch (filters unchanged); presentational sections from visibility + viewer facts; never mix restricted into Public, including for admins.

**Contract**: Helper partitions into `{ publicRuns, friendsRuns, invitedRuns, restrictedAdminRuns }`:

- Public: `visibility === "public"`
- Friends: `friends_only` AND viewer is organizer OR live friend of organizer OR confirmed on that run
- Invited: `invite_only` AND viewer is organizer OR on `run_invites` OR confirmed on that run
- Restricted: `isAdmin` AND not public AND not already in Friends or Invited (friend-admin sees the run only under Friends)
- Guest: only Public (RLS already hides the rest; still do not render other headings). Guest `/runs` always calls `listActiveRuns(..., { publicOnly: true })` (or equivalent). Signed-in `/runs` never passes `publicOnly`.

Load viewer facts in the page (not N+1 per card): `public_friendships` for the viewer, `run_invites` where `user_id = viewer`, confirmed `run_participants` for listed ids. `isAdmin` from `Astro.locals.profile?.role === "admin"`. Omit empty Friends / Invited / Restricted headings. Page-level empty states stay as today when every section is empty (`No active runs yet` / `No runs match these filters`). Section chrome copies dashboard: `flex flex-col gap-10` + `h2` (`src/pages/dashboard.astro`). Headings: **Public**, **Friends**, **Invited**, **Restricted** (admin-only subtitle that guests cannot see these). Do not add a visibility URL filter.

#### 2. Landing public preview

**File**: `src/components/Welcome.astro`

**Intent**: The home preview must not show restricted runs to anyone who should not see them; signed-in friends discover those on `/runs`, not mixed into "Recent Runs".

**Contract**: After `listActiveRuns`, keep only `visibility === "public"` **by calling the loader with `publicOnly: true`** (do not rely on a post-filter alone if the flag exists) before `.slice(0, 6)`. Do not add Friends/Invited on landing.

#### 3. Dual-defense guest catalog

**File**: `src/lib/services/runs.ts` — `listActiveRuns`; callers `src/pages/runs/index.astro`, `src/components/Welcome.astro`

**Intent**: If RLS regresses, guests and landing still do not preview restricted rows. Signed-in `/runs` must still receive friends-only / invite-only rows.

**Contract**: Support `publicOnly?: boolean` (or equivalent). **Welcome always** passes it. **Guest `/runs` always** passes it. **Signed-in `/runs` never** passes it (Friends/Invited would vanish). `getActiveRunById` stays unfiltered in the app; RLS + 404 handle audience.

#### 4. Cards and detail

**Files**: `src/components/runs/ActiveRunCard.astro`, `src/pages/runs/[id].astro`, dashboard inline cards if they list visibility-relevant fields

**Intent**: Audience can see that a run is friends-only or invite-only; non-audience still get the existing 404.

**Contract**: Badge or `<dl>` line using the same tone as join mode / "In progress" (`ActiveRunCard.astro:24,41-44`). Detail 404 status/copy **unchanged** (`[id].astro:102-140`: H1 "Run not found", body "This run is missing or no longer active."). Do not add 403. `canReadComments` stays confirmed / archived participant / organizer / admin — do not switch it to "can view the run". `<title>` still only renders on 200.

#### 5. AGENTS.md hard rule

**File**: `AGENTS.md`

**Intent**: Stop later slices from 403ing hidden runs or mixing them into the public list.

**Contract**: Short bullet: restricted runs are 404 not 403; `/runs` stays publicly routable; list Public vs Friends vs Invited vs admin Restricted; do not widen comment read ACL.

### Success Criteria:

#### Automated Verification:

- `/runs` partitions with Public / Friends / Invited / admin Restricted and does not put `friends_only` / `invite_only` into Public
- `Welcome.astro` always calls `listActiveRuns` with `publicOnly`; guest `/runs` always does; signed-in `/runs` never does
- Detail 404 copy is unchanged; `canReadComments` is not "anyone who can view"
- `PROTECTED_ROUTES` still does not prefix-protect `/runs`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest `/` and `/runs`: only public cards; guess UUID of a friends-only run → 404 same copy
- Friend of organizer: friends-only in **Friends**, not Public; invite-only they were not picked for is absent
- Invitee: invite-only in **Invited**; apply still respects join mode
- Organizer: own restricted runs in Friends or Invited (not Public); dashboard still lists them
- Admin non-friend: leftover restricted in **Restricted** only; friend-admin sees that run under Friends only (no duplicate); S-06 delete on detail still works
- Filters (`?map=` / date / join): apply across sections; cannot surface a hidden run
- Kick/decide/apply on a hidden UUID: `?error=` is "Run not found or no longer active" (or existing uniform mutation miss), never "Only the organizer can…"
- Comment thread still hidden from pending/guest on a friends-only run the viewer can see but is not seated on
- http://localhost:4321/runs , http://localhost:4321/ , http://localhost:4321/runs/{id}

---

## Testing Strategy

### Unit Tests:

- None — no runner in `package.json`. Pure partition helper may be sanity-checked by SQL + UI, not a new framework.

### Integration Tests:

- Phase 1 SQL smoke (anon / authenticated / organizer / friend / invitee / seated / admin / unverified insert and update) is the integration suite
- `npx supabase db reset` + `npm run build` on each phase

### Manual Testing Steps:

1. Seed two verified friends (A organizer, B friend) and C verified non-friend; create public, friends-only, invite-only (B only)
2. Guest + C: only public on `/` and `/runs`; restricted UUIDs 404
3. B: Friends section has friends-only; Invited has the invite; apply works
4. Unfriend A–B: friends-only 404s for B if not seated; invite-only still works until A edits the list
5. Confirm B on friends-only, then unfriend: B still opens detail; comments still follow seated ACL
6. Admin (not friend): Restricted section + delete from detail
7. Unverified create public OK; restricted POST on create **and** edit rejected with the same `?error=` string
8. Tamper PostgREST as anon listing `runs` and `run_participants` — no restricted `run_id`s

## Performance Considerations

MVP volumes are small. `are_friends` / `is_run_invitee` / `can_view_run` are `STABLE` DEFINER lookups with existing unique pair index plus `run_invites` PK and `user_id` index. `/runs` loads viewer friend ids + invite ids + seated ids in batch, not per card. Do not add caching.

## Migration Notes

Existing `runs` rows default to `public` — no backfill script. Rollback is `supabase db reset` locally or revert the migration before production tag; after release, dropping `visibility` would re-expose rows if policies were also reverted — ship policies and column together. Invite-only RPCs are required from the first write path; do not create invite-only rows from the app insert alone. `create_invite_only_run` and `set_run_visibility_and_invites` are the only invite-only writers.

## References

- Related research: `context/changes/restricted-run-visibility/research.md`
- PRD: `context/foundation/prd.md` (FR-027, FR-028, US-08, US-09, Access Control v1.1)
- Roadmap S-15: `context/foundation/roadmap.md`
- Lessons: `context/foundation/lessons.md` (`?error=` must be intentional strings)
- `are_friends` contract: `supabase/migrations/20260821130000_friend_requests.sql:228-261`
- Cycle-break twin: `supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql`
- UPDATE grant twin: `supabase/migrations/20260821120000_runs_map_category.sql:35-44`
- Join-mode form plug-in: `src/components/runs/CreateRunForm.tsx:239-262`
- Catalog choke points: `src/lib/services/runs.ts:227-291`
- Mutation gate: `src/lib/services/participants.ts:158-214`
- 404 copy: `src/pages/runs/[id].astro:102-140`
- Section chrome: `src/pages/dashboard.astro`
- Supabase RLS: wrap `(select auth.uid())`; DEFINER helpers use `set search_path = ''` and revoke `EXECUTE` from `public`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, RLS, and sibling leak closes

#### Automated

- [x] 1.1 Migration exists under supabase/migrations/ with RLS per operation on run_invites, no anon grant on that table, visibility default public — e6199ed
- [x] 1.2 npx supabase db reset (or project-equivalent apply) succeeds locally — e6199ed
- [x] 1.3 npm run db:types includes run_visibility, runs.visibility, run_invites, can_view_run, is_run_invitee, create_invite_only_run, set_run_visibility_and_invites — e6199ed
- [x] 1.4 npm run lint passes — e6199ed
- [x] 1.5 npm run build passes — e6199ed

#### Manual

- [x] 1.6 SQL: anon SELECT runs returns only visibility = public rows inside the active window; a friends-only/invite-only seed is absent — e6199ed
- [x] 1.7 SQL: authenticated non-friend non-invitee non-admin cannot SELECT a restricted active run; organizer, admin, and confirmed participant can — e6199ed
- [x] 1.8 SQL: are_friends true → friends-only SELECT succeeds; after DELETE of the accepted friend row, non-seated friend loses SELECT; seated confirmed still SELECTs — e6199ed
- [x] 1.9 SQL: invitee SELECT invite-only succeeds after unfriend; non-invitee friend does not — e6199ed
- [x] 1.10 SQL: anon/authenticated confirmed run_participants SELECT does not return organizer auto-seats for a hidden run — e6199ed
- [x] 1.11 SQL: auto_join_run on a hidden UUID returns not_active (not confirmed) — e6199ed
- [x] 1.12 SQL: is_run_in_active_window(hidden_id) is false for a non-audience authenticated user; true for a confirmed seat on that active run — e6199ed
- [x] 1.13 SQL: unverified INSERT friends_only / invite_only fails WITH CHECK; unverified INSERT public succeeds — e6199ed
- [x] 1.14 SQL: invite-only writer rejects 0 invitees; accepts ≥1 current friend; keeping an unfriended snapshot id on replace succeeds; create_invite_only_run and set_run_visibility_and_invites exist and are the writers used in smoke (not a separate Worker-facing sync_run_invites) — e6199ed
- [x] 1.15 PostgREST as anon: GET /rest/v1/runs does not include restricted ids — e6199ed
- [x] 1.16 SQL: unverified UPDATE of an owned public run to friends_only / invite_only fails WITH CHECK; unverified UPDATE that keeps or sets public succeeds; after unverify, a title-only save that leaves the row restricted fails until visibility is public — e6199ed

### Phase 2: Create and edit visibility + invite picker

#### Automated

- [x] 2.1 Create and edit APIs parse visibility / invitee_ids; unverified non-public is rejected in both the create handler and the edit handler with the same ?error= string — 6e4bdbc
- [x] 2.2 CreateRunForm posts visibility and (when invite-only) invitee_ids; unverified create cannot post restricted values — 6e4bdbc
- [x] 2.3 updateRun patches visibility independently of joinModeLocked on public/friends-only edits; invite-only edits call set_run_visibility_and_invites instead of updateRun (never updateRun then RPC / sync_run_invites) — 6e4bdbc
- [x] 2.4 npm run lint passes — 6e4bdbc
- [x] 2.5 npm run build passes — 6e4bdbc
- [x] 2.15 Edit form/page loads public_profiles nicknames for snapshot invitee ids missing from listPublicFriends — 6e4bdbc

#### Manual

- [ ] 2.6 Unverified /runs/new: only public; submitting friends-only (tampered POST) fails with a friendly ?error=
- [ ] 2.7 Verified create public: still appears on guest /runs
- [ ] 2.8 Verified create friends-only with 0 friends: succeeds; guest /runs and /runs/{id} 404; organizer dashboard and detail work
- [ ] 2.9 Verified create invite-only with 0 picks: rejected, no new run row
- [ ] 2.10 Verified create invite-only with ≥1 friend: invitee can open detail and apply; another friend of the organizer cannot; guest 404
- [ ] 2.11 Edit: public→friends-only hides from guests; invite list add/remove; removing the last invitee on invite-only fails and keeps the previous list; leftover unfriended invitees show nicknames not UUIDs
- [ ] 2.12 Edit: join_mode still locks after a non-organizer participant; visibility remains editable
- [ ] 2.13 Unfriend after invite-only: invitee still opens /runs/{id}; friends-only unfriend (non-seated) 404s
- [ ] 2.14 http://localhost:4321/runs/new and http://localhost:4321/runs/{id}/edit (after npm run dev + local Supabase)
- [ ] 2.16 Unverified owner /runs/{id}/edit: tampered POST to friends-only/invite-only fails with that same ?error= string; after unverify, a save that leaves the run restricted fails until they switch to public

### Phase 3: /runs sections, public landing, detail 404

#### Automated

- [x] 3.1 /runs partitions with Public / Friends / Invited / admin Restricted and does not put friends_only / invite_only into Public
- [x] 3.2 Welcome.astro always calls listActiveRuns with publicOnly; guest /runs always does; signed-in /runs never does
- [x] 3.3 Detail 404 copy is unchanged; canReadComments is not "anyone who can view"
- [x] 3.4 PROTECTED_ROUTES still does not prefix-protect /runs
- [x] 3.5 npm run lint passes
- [x] 3.6 npm run build passes

#### Manual

- [ ] 3.7 Guest / and /runs: only public cards; guess UUID of a friends-only run → 404 same copy
- [ ] 3.8 Friend of organizer: friends-only in Friends, not Public; invite-only they were not picked for is absent
- [ ] 3.9 Invitee: invite-only in Invited; apply still respects join mode
- [ ] 3.10 Organizer: own restricted runs in Friends or Invited (not Public); dashboard still lists them
- [ ] 3.11 Admin non-friend: leftover restricted in Restricted only; friend-admin sees that run under Friends only (no duplicate); S-06 delete on detail still works
- [ ] 3.12 Filters (?map= / date / join): apply across sections; cannot surface a hidden run
- [ ] 3.13 Kick/decide/apply on a hidden UUID: ?error= is uniform not-found, never Only the organizer can…
- [ ] 3.14 Comment thread still hidden from pending/guest on a friends-only run the viewer can see but is not seated on
- [ ] 3.15 http://localhost:4321/runs , http://localhost:4321/ , http://localhost:4321/runs/{id}
