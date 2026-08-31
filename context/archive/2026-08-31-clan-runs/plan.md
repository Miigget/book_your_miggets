# Clan-only runs Implementation Plan

## Overview

Ship S-21 / FR-020 / FR-028: a **clan owner** can create a **clan-only** run on the existing run entity. Current clan members (live `clan_members` graph) and admins can find it; guests and non-members never see it as public. Friends-only and invite-only must not leak. Also fix Dashboard `"Could not load your runs."` after archived friends-only / invite-only runs by rewriting the recursive organizer participant SELECT — not a catch-only paper-over.

## Current State Analysis

S-15 already shipped `run_visibility` as `public | friends_only | invite_only`. Guest catalog is dual-defense (`visibility = 'public'` in RLS and `publicOnly` in app). Signed-in `/runs` partitions Public / Friends / Invited / admin Restricted and never puts non-public rows into Public. Hidden runs 404 with the missing-run copy, never 403.

Friends-only is a live DEFINER helper (`are_friends(organizer_id, uid)`) plus plain insert/`updateRun`. Invite-only is a frozen `run_invites` snapshot written only via RPCs. There is no clan check on create. `clan_members` has no role column; owner is `clans.owner_id`. No `runs.clan_id`.

Dashboard load wraps `listRunsForOrganizer` and `listRunsForParticipant` in one try/catch. After archived restricted rows exist, `confirmedCountsForRuns` issues a confirmed `run_participants` head-count per id. `run_participants_select_organizer` still INVOKER-`EXISTS` into `runs`, the 42P17 graph S-07 broke for run SELECT but not for this policy. `is_run_organizer(p_run_id)` already exists as DEFINER (comment policies) and is unused here.

`formatVisibility` is an exhaustive switch: a new enum value 500s cards after a successful load unless the case is added in the same change as `npm run db:types`.

## Desired End State

A verified clan **owner** creates or edits a run with visibility `clan_only` (same form and `/api/runs` as public/friends-only). Current members of that organizer’s clan can list it in a **Clan** section on signed-in `/runs`, open `/runs/{id}`, and apply/auto-join with existing join_mode. Guests, non-members, and anon PostgREST see it as missing (404 / empty), never mixed into Public. Admins who are not in that clan still see leftovers in **Restricted**. Friends-only / invite-only behavior is unchanged.

Dashboard Incoming and Past load for an organizer of archived friends-only and invite-only runs (no `"Could not load your runs."`). Clan-only cards render **"Clan only"**.

Comment read ACL stays confirmed / archived participant / organizer / admin — seeing a clan-only run as a member does not open comments. `list_player_public_runs` stays public-only.

### Key Discoveries:

- Enum lives only in `supabase/migrations/20260824101006_restricted_run_visibility.sql`; app mirrors `VISIBILITIES` / `formatVisibility` in `src/lib/services/runs.ts`
- `runs_select_active_authenticated` and `can_view_run` are the two audience choke points; a clan helper used FROM `runs` policies must DEFINER-read `clan_members` only — never `runs` (same rule as `are_friends` / `is_run_invitee`)
- `can_view_run` is never called from policies on `runs`; it is the sibling choke (`run_participants` confirmed SELECT, pending INSERT, `auto_join_run`, `is_run_in_active_window`)
- Create: unverified + non-public → `RESTRICTED_VISIBILITY_UNVERIFIED`; `invite_only` → RPC; `public` / `friends_only` → `.insert()`. Clan-only follows the friends-only insert/`updateRun` branch
- `updateRun` already rejects only `invite_only`; once the enum exists, `clan_only` is patchable there
- `getClanMembershipForUser` is membership, not ownership — owner gate is `clans.owner_id`
- Dashboard throw site is `confirmedCountsForRuns` (`src/lib/services/runs.ts`); the same head-count is used by `countConfirmedParticipants` and player-profile extras — fixing `run_participants_select_organizer` fixes all of them
- Postgres 17 (`supabase/config.toml` `major_version = 17`): `ALTER TYPE … ADD VALUE` inside a transaction cannot use the new label until commit (https://www.postgresql.org/docs/17/sql-altertype.html). Two migrations, not one

## What We're NOT Doing

- Officers appointment UI or an officer role (`clan_members` has no role; create/edit is **owner-only**)
- `runs.clan_id` (S-23 may add a FK later; audience is live `is_same_clan(organizer_id, uid)`)
- Invite-only snapshot RPC / frozen member picker / copying `run_invites` or `clan_invites` for clan-run SELECT
- S-22 complete-clan-run, S-23 verified-finish / clan points
- Prefix-protecting `/runs` or `/clans`
- Mixing `clan_only` (or friends/invite) into Public, including for admins
- Widening comment SELECT to unseated clan members
- Changing `list_player_public_runs` (stays `visibility = public`)
- Dashboard catch-only / skipping archived queries / putting PostgREST `Error.message` in `?error=`
- Vitest/Jest / pgTAP
- Hand-editing `src/types/database.ts` (use `npm run db:types`)
- Clan leave / owner transfer (does not exist; do not invent)

## Implementation Approach

Extend the S-15 visibility axis with `clan_only`, copying the **friends-only** live-graph pattern (DEFINER helper + plain insert/`updateRun` + verified conjunct), plus an **owner** WITH CHECK so non-owners cannot POST `clan_only`. Fix dashboard recursion in the same RLS migration as the audience branch so restricted archives and new clan runs share one policy graph.

Postgres RLS remains the authz boundary (publishable anon key). App loaders match it; hidden runs 404.

Phase 1: two migrations (enum value, then helper/policies/42P17) + generated types + `formatVisibility`. Phase 2: owner gate, create/edit form and APIs. Phase 3: signed-in **Clan** section + AGENTS.md.

## Critical Implementation Details

**Two migrations for the enum.** Supabase applies each file in a transaction. After `ALTER TYPE public.run_visibility ADD VALUE 'clan_only'`, policies and function bodies cannot write `'clan_only'::public.run_visibility` until that transaction commits. File 1 is ADD VALUE only. File 2 (later timestamp) is helper, SELECT/`can_view_run`, INSERT/UPDATE WITH CHECK, and `run_participants_select_organizer`.

**Helper vs `runs` policies.** `is_same_clan(a uuid, b uuid)` is `STABLE` `SECURITY DEFINER` `search_path = ''`, reads `clan_members` only (join both user ids on `clan_id`). Grant `authenticated` only. Do not grant anon. Do not call it from policies on `clan_members`. Do **not** add `a is distinct from b` (unlike `are_friends` — an owner is a member of their own clan). Inline on `runs_select_active_authenticated` as `is_same_clan(organizer_id, (select auth.uid()))`. Never call `can_view_run` from a policy on `runs`.

**`can_view_run` clan branch.** Add after the existing `uid is null → false` guard (guests never call `is_same_clan`) and after friends/invite branches: if `clan_only` then `is_same_clan(v_organizer, v_uid)`. Keep the one-way rule: `can_view_run` never calls `is_run_in_active_window`.

**Dashboard 42P17.** Drop/recreate `run_participants_select_organizer` to `USING (public.is_run_organizer(run_id))` — same DEFINER helper comment policies already use. Do not change `dashboard.astro` catch copy as the fix. Do not skip archived ids in `confirmedCountsForRuns`.

**Types vs exhaustive switch.** `npm run db:types` makes `formatVisibility` fail typecheck until the `clan_only` case exists. Land that case in Phase 1 with the types regen. `VISIBILITIES` / API / form wait for Phase 2 so accidental POSTs still fail `isVisibility` until the owner gate exists.

---

## Phase 1: Enum, RLS, and dashboard recursion fix

### Overview

Add `clan_only` to `run_visibility`, land a cycle-safe live clan helper, extend SELECT / `can_view_run` / owner WITH CHECK, and rewrite `run_participants_select_organizer` so archived restricted head-counts no longer 42P17. Regen types and teach `formatVisibility` the new label. No create-form UI yet.

### Changes Required:

#### 1. Enum-value migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_run_visibility_add_clan_only.sql` (create with `npx supabase migration new run_visibility_add_clan_only`; keep the suffix)

**Intent**: Commit the new enum label in its own transaction so the following migration can legally use it.

**Contract**: `ALTER TYPE public.run_visibility ADD VALUE 'clan_only';` only. No policies, no functions, no table rewrites in this file.

#### 2. RLS migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_clan_only_run_rls.sql` (later timestamp than file 1; `npx supabase migration new clan_only_run_rls`)

**Intent**: Audience = current clan members + existing organizer/admin/confirmed extras; guests stay on public; non-owners cannot insert/update `clan_only`; organizer participant counts stop recursing.

**Contract**:

- `is_same_clan(a uuid, b uuid) returns boolean` — `STABLE` `SECURITY DEFINER` `search_path = ''`; true when both ids are non-null and share a `clan_members.clan_id`. Revoke `public`/`anon`; grant `authenticated` only. Do not SELECT `runs`. Do not call from `clan_members` policies.
- Replace `runs_select_active_authenticated` USING: keep window; add OR `(visibility = 'clan_only' AND is_same_clan(organizer_id, (select auth.uid())))`. Anon policy unchanged (`visibility = public` only). Organizer/admin/confirmed policies unchanged.
- Replace `can_view_run`: same early admin/organizer/confirmed/window/public/anon exits; add `clan_only` → `is_same_clan(v_organizer, v_uid)` before the final `return false`.
- `runs_insert_own` / `runs_update_own` WITH CHECK: keep organizer + not banned (+ window on UPDATE) + existing verified conjunct for non-public; **additionally** if `visibility = 'clan_only'` then `EXISTS (SELECT 1 FROM public.clans c WHERE c.owner_id = organizer_id)`. Verified non-owners may still write friends-only / invite-only. `runs_update_admin` stays unbounded.
- Drop/recreate `run_participants_select_organizer` `TO authenticated` `USING (public.is_run_organizer(run_id))`. Do not INVOKER-`SELECT` `runs` from this policy.
- No new UPDATE column grant (`visibility` already granted). No `clan_id` column. No `run_invites` / `clan_invites` changes. Clan table policies must still not SELECT `runs`.

#### 3. Generated types and card label

**File**: `src/types/database.ts` (via `npm run db:types` only)

**Intent**: App enums match the database after migrate.

**Contract**: `Enums<"run_visibility">` and the generated constants array include `clan_only`. Do not hand-edit.

**File**: `src/lib/services/runs.ts` (`formatVisibility`)

**Intent**: Cards and detail do not 500 on the new value after types regen.

**Contract**: Exhaustive switch gains `case "clan_only": return "Clan only";`. Do not add `clan_only` to `VISIBILITIES` in this phase.

### Success Criteria:

#### Automated Verification:

- Both new migrations apply on local Supabase (`npx supabase db reset` or migrate from current)
- `npm run db:types` includes `clan_only` on `run_visibility`
- `formatVisibility` compiles with the exhaustive `clan_only` case
- SQL smoke as **authenticated organizer** of an archived `friends_only` and an archived `invite_only` run: confirmed `run_participants` head-count (same filter as `confirmedCountsForRuns`) succeeds — not SQLSTATE 42P17
- SQL smoke as **anon**: `SELECT id FROM runs WHERE visibility = 'clan_only'` returns no rows (after a service-role/owner insert of a clan-only run for the probe)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Signed-in organizer of archived friends-only and invite-only runs: `/dashboard` Incoming and Past load; no `"Could not load your runs."` (http://localhost:4321/dashboard and `?tab=past`; local app + Supabase running)

**Implementation Note**: After this phase’s automated checks pass, pause for the dashboard manual load before Phase 2.

---

## Phase 2: Owner gate, create/edit APIs, CreateRunForm

### Overview

Clan-only is a first-class create/edit visibility like friends-only: same insert/`updateRun` path, hide the option unless the viewer owns a clan (keep it on edit if current visibility is `clan_only`), two honest `?error=` strings, invite RPCs untouched.

### Changes Required:

#### 1. Visibility constants and owner lookup

**File**: `src/lib/services/runs.ts`

**Intent**: Parse and label clan-only; keep invite-only on the RPC path; user-facing errors stay intentional copy.

**Contract**:

- `VISIBILITIES` includes `"clan_only"` so `isVisibility` accepts it
- `RESTRICTED_VISIBILITY_UNVERIFIED` becomes `Verify your account to create friends-only, invite-only, or clan-only runs`
- New constant e.g. `CLAN_ONLY_OWNER_REQUIRED` = `Only a clan owner can create a clan-only run` (create and edit both use it)
- `updateRun` still throws on `invite_only` only — `clan_only` patches via `.from("runs").update()`
- Do not call `create_invite_only_run` / `set_run_visibility_and_invites` for `clan_only`

**File**: `src/lib/services/clans.ts`

**Intent**: Pages and APIs can ask “does this user own a clan?” without treating membership as ownership.

**Contract**: Add `userOwnsClan(supabase, userId): Promise<boolean>` — `clans` SELECT `id` where `owner_id = userId` `maybeSingle`; throw `ClanError`/`CLAN_LOAD_FAILED` on error; `false` when no row. Do not reuse `getClanMembershipForUser` as the owner gate.

#### 2. Create and edit APIs

**File**: `src/pages/api/runs/index.ts`

**Intent**: Unverified and non-owner POSTs fail with the right string; owners insert `clan_only` like `friends_only`.

**Contract**: After `isVisibility` / unverified non-public check: if `visibilityRaw === "clan_only"` and `!(await userOwnsClan(...))` then `fail(CLAN_ONLY_OWNER_REQUIRED)`. `clan_only` uses the existing `.insert({ … visibility })` branch, not the invite RPC. Log infrastructure errors; never put `insertError.message` in `?error=`.

**File**: `src/pages/api/runs/[id]/index.ts`

**Intent**: Same gates on edit; `clan_only` goes through `updateRun`.

**Contract**: Same unverified + owner checks. `visibilityRaw === "invite_only"` still calls `setRunVisibilityAndInvites`; every other visibility including `clan_only` calls `updateRun`.

#### 3. CreateRunForm and page props

**File**: `src/components/runs/CreateRunForm.tsx`

**Intent**: Verified owners can pick clan-only; everyone else does not see a dead option (except editing an existing clan-only run).

**Contract**:

- `CreateRunFormVisibility` includes `"clan_only"`
- New prop `ownsClan?: boolean` (default `false`)
- Show the clan-only `<option>` iff `ownsClan || edit?.visibility === "clan_only"`
- Hint copy when selected: only current clan members can find the run (no invitee checkboxes; `showInvitePicker` stays `invite_only` only)
- Unverified create still posts hidden `visibility=public`

**File**: `src/pages/runs/new.astro`

**Intent**: Pass owner fact into the island; do not load `public_friendships` for this fact.

**Contract**: When verified, also `userOwnsClan`; pass `ownsClan` into `CreateRunForm`. Friends list loading unchanged (invite-only).

**File**: `src/pages/runs/[id]/edit.astro`

**Intent**: Edit picker can keep clan-only when that is the current value even if `ownsClan` is false.

**Contract**: Load `userOwnsClan` for the signed-in owner; pass `ownsClan`. `isVerified={false}` on edit may stay (picker already shows because `isEdit`). `edit.visibility` remains the run’s current value.

### Success Criteria:

#### Automated Verification:

- `isVisibility("clan_only")` is true; invite-only create/edit still uses the existing RPCs only
- Create/edit API: unverified + `clan_only` → updated `RESTRICTED_VISIBILITY_UNVERIFIED`; verified non-owner → `CLAN_ONLY_OWNER_REQUIRED`; owner insert/`updateRun` succeeds
- CreateRunForm: clan-only option hidden unless `ownsClan` or current edit visibility is `clan_only`; no invitee fieldset for clan-only
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Clan owner creates clan-only: member opens `/runs/{id}` and can apply/auto-join per join_mode; guest and non-member get the same 404 copy as a missing run
- Verified non-owner: option hidden; tampered POST returns `CLAN_ONLY_OWNER_REQUIRED`
- Unverified: picker hidden; tampered `clan_only` POST returns the updated unverified string
- Owner edit: `public` ↔ `friends_only` ↔ `clan_only` via `updateRun`; switching **to** clan-only without owning a clan fails the owner string; `invite_only` still uses the invite RPC
- http://localhost:4321/runs/new and http://localhost:4321/runs/{id}/edit (dev server + local Supabase running)

**Implementation Note**: After automated checks pass, pause for the create/edit/404 manual pass before Phase 3.

---

## Phase 3: Signed-in Clan section and AGENTS.md

### Overview

Partition clan-only rows into a **Clan** section for members/organizer/confirmed; admin leftovers stay Restricted; guests stay `publicOnly`. Document the axis in AGENTS.md so later slices do not mix clan-only into Public.

### Changes Required:

#### 1. Partition and viewer facts

**File**: `src/lib/run-list-sections.ts`

**Intent**: Presentational split matches RLS; never put `clan_only` into Public.

**Contract**:

- `PartitionedActiveRuns` gains `clanRuns`
- `RunListViewerFacts` gains enough to test same-clan (viewer’s `clan_id` plus organizer → `clan_id` for listed organizers). World SELECT on `clan_members` is already allowed; do not load `public_friendships` extra times; do not query `public_friendships` for guests
- `inClanSection`: `visibility === "clan_only"` and viewer is organizer **or** same clan as organizer **or** confirmed on that run
- `partitionActiveRuns`: `public` first (only `visibility === "public"`); then friends; invited; clan; leftover non-public + `facts.isAdmin` → Restricted. A friend-admin who is also a clan member sees that run under Clan only (no duplicate in Restricted) — same “first matching bucket wins” order as Friends vs Restricted today

**File**: `src/pages/runs/index.astro`

**Intent**: Signed-in catalog shows Clan; guest catalog unchanged.

**Contract**: Signed-in still calls `listActiveRuns` **without** `publicOnly`; guests still `publicOnly: true`. `hasAnyRuns` includes `clanRuns`. Sections: Public, Friends, Invited, **Clan**, Restricted (`"Guests cannot see these."` stays on Restricted only). Do not add `/runs` to `PROTECTED_ROUTES`.

**File**: `src/middleware.ts`

**Intent**: `/runs` list and detail stay public routes.

**Contract**: No change unless a drive-by already prefix-protected `/runs` — do not add it.

#### 2. Agent onboarding copy

**File**: `AGENTS.md`

**Intent**: Later agents treat clan-only like other restricted visibilities.

**Contract**: Restricted-run sentence names friends-only / invite-only / **clan-only** (404 not 403). Signed-in `/runs` sections are Public vs Friends vs Invited vs **Clan** vs admin Restricted; never mix `clan_only` into Public. Note owner-only create (not officers). Do not prefix-protect `/runs`.

### Success Criteria:

#### Automated Verification:

- `partitionActiveRuns` never places `clan_only` in `publicRuns`; members/organizer/confirmed land in `clanRuns`; admin-only leftovers land in `restrictedAdminRuns`
- Guest `/runs` and landing still pass `publicOnly`; signed-in `/runs` does not
- `PROTECTED_ROUTES` still does not prefix-protect `/runs`
- AGENTS.md names the Clan section and clan-only 404
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest `/` and `/runs`: no clan-only cards; guessed clan-only UUID → 404 same copy as missing
- Clan member: clan-only in **Clan**, not Public; friends-only / invite-only still in Friends / Invited
- Signed-in non-member: clan-only absent from `/runs`
- Admin who is not a member: leftover clan-only in **Restricted** only
- Organizer: own clan-only in **Clan**, not Public
- Unseated clan member can open detail but comment thread stays hidden (`canReadComments` unchanged)
- Dashboard lists clan-only created/joined; cards show **Clan only**
- http://localhost:4321/runs , http://localhost:4321/ , http://localhost:4321/runs/{id} , http://localhost:4321/dashboard

**Implementation Note**: After automated checks pass, pause for the catalog/404/comments/dashboard manual pass.

---

## Testing Strategy

### Unit Tests:

None. No test runner in `package.json`; do not add Vitest/Jest in this slice.

### Integration Tests:

None (no pgTAP). Phase 1 SQL smoke under `authenticated` / `anon` roles is the automated RLS bar. Use local JWT claims (`request.jwt.claims` / `authenticated` role), not the `postgres` superuser — superuser bypasses RLS and cannot prove 42P17 or anon emptiness.

### Manual Testing Steps:

1. Archive a friends-only and an invite-only run as organizer → Dashboard Incoming and Past load.
2. As clan owner, create clan-only (approval and auto-join). Member finds it under Clan, opens detail, applies or auto-joins. Guest and non-member 404. Anon PostgREST list does not include it.
3. Verified non-owner and unverified tamper POSTs get the two distinct strings.
4. Edit visibility among public / friends-only / clan-only; invite-only still requires invitees + RPC.
5. Admin non-member sees leftover clan-only only under Restricted. Comment thread still organizer/confirmed/admin.

## Performance Considerations

`is_same_clan` is two PK lookups on `clan_members` (`user_id` is the primary key). `/runs` viewer facts add at most one `clan_members` select for the viewer and one `in (organizer ids)` for listed clan-only organizers — same order of magnitude as today’s friendships + invites queries. No new N+1 beyond existing `confirmedCountsForRuns`.

## Migration Notes

- File 1 then file 2; never combine ADD VALUE with `'clan_only'::run_visibility` literals in one transaction.
- Existing rows stay `public`. No backfill.
- Rollback: drop policies/function in reverse, then you still cannot easily remove an enum value — treat ADD VALUE as forward-only; revert app + policies and leave the unused label if aborting after Phase 1.
- Production ships with `/gh-release` (tag `v*`), not merge to `main`.

## References

- Related research: `context/changes/clan-runs/research.md`
- Crew decisions: `context/changes/clan-runs/crew-decisions.md`
- Similar implementation: `context/archive/2026-08-24-restricted-run-visibility/plan.md`
- 42P17 history: `supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql`
- `is_run_organizer`: `supabase/migrations/20260820092809_run_comments.sql`
- `are_friends` analog: `supabase/migrations/20260821130000_friend_requests.sql`
- Lessons: never put PostgREST `Error.message` in `?error=` (`context/foundation/lessons.md`)
- Postgres 17 ADD VALUE: https://www.postgresql.org/docs/17/sql-altertype.html

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Enum, RLS, and dashboard recursion fix

#### Automated

- [x] 1.1 Both new migrations apply on local Supabase — 9547b93
- [x] 1.2 npm run db:types includes clan_only on run_visibility — 9547b93
- [x] 1.3 formatVisibility compiles with the exhaustive clan_only case — 9547b93
- [x] 1.4 SQL smoke as authenticated organizer: archived friends_only and invite_only confirmed head-count succeeds (no 42P17) — 9547b93
- [x] 1.5 SQL smoke as anon: SELECT clan_only runs returns no rows — 9547b93
- [x] 1.6 npm run lint passes — 9547b93
- [x] 1.7 npm run build passes — 9547b93

#### Manual

- [ ] 1.8 Dashboard Incoming and Past load for organizer of archived friends-only and invite-only runs (no "Could not load your runs.")

### Phase 2: Owner gate, create/edit APIs, CreateRunForm

#### Automated

- [x] 2.1 isVisibility("clan_only") is true; invite-only still uses existing RPCs only — 138405f
- [x] 2.2 Create/edit API unverified vs non-owner vs owner gates behave as specified — 138405f
- [x] 2.3 CreateRunForm hides clan_only unless ownsClan or edit visibility is clan_only; no invitee fieldset — 138405f
- [x] 2.4 npm run lint passes — 138405f
- [x] 2.5 npm run build passes — 138405f

#### Manual

- [ ] 2.6 Owner creates clan-only; member can open and join; guest and non-member 404
- [ ] 2.7 Verified non-owner: option hidden; tampered POST returns CLAN_ONLY_OWNER_REQUIRED
- [ ] 2.8 Unverified tampered clan_only POST returns updated RESTRICTED_VISIBILITY_UNVERIFIED
- [ ] 2.9 Owner edit public ↔ friends_only ↔ clan_only; TO clan_only without owning fails; invite_only stays on RPC
- [ ] 2.10 http://localhost:4321/runs/new and /runs/{id}/edit with local app + Supabase

### Phase 3: Signed-in Clan section and AGENTS.md

#### Automated

- [x] 3.1 partitionActiveRuns never puts clan_only in publicRuns; members in clanRuns; admin leftovers in Restricted — f6c60ff
- [x] 3.2 Guest /runs and landing still publicOnly; signed-in /runs does not — f6c60ff
- [x] 3.3 PROTECTED_ROUTES still does not prefix-protect /runs — f6c60ff
- [x] 3.4 AGENTS.md names Clan section and clan-only 404 — f6c60ff
- [x] 3.5 npm run lint passes — f6c60ff
- [x] 3.6 npm run build passes — f6c60ff

#### Manual

- [ ] 3.7 Guest / and /runs: no clan-only cards; guessed UUID 404s like missing
- [ ] 3.8 Clan member: clan-only in Clan not Public; friends/invite sections unchanged
- [ ] 3.9 Signed-in non-member: clan-only absent from /runs
- [ ] 3.10 Admin non-member: leftover clan-only in Restricted only
- [ ] 3.11 Organizer: own clan-only in Clan not Public
- [ ] 3.12 Unseated clan member: detail visible, comments hidden
- [ ] 3.13 Dashboard lists clan-only with "Clan only" label
- [ ] 3.14 http://localhost:4321/runs , / , /runs/{id} , /dashboard
