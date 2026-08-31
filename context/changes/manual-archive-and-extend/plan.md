# Manual archive, extend, and active-run cap Implementation Plan

## Overview

Ship S-24 / PRD v2 FR-002, FR-003, FR-004, FR-008, FR-024: replace the derived 1-hour auto-archive with a stamp (`archive_run`) and an optional one-shot `extended_until` (≤ now+6h). Organizer or admin archives any non-archived run via a button; organizer extends in-progress only. At most 5 audience-active runs per organizer; archiving or an elapsed extend frees a slot. Guests still browse/filter the public active list.

## Current State Analysis

The 1-hour window is derived at read time in app + RLS. Nothing stamps `archived_at`. `authenticated` UPDATE grants omit it (S-13). There is no archive button, no extend column, no max-5 cap, and no cron.

**Live “audience active”** (guest list, join, edit, invites, comment write): `archived_at IS NULL AND starts_at > now() - interval '1 hour'`.

**Privilege SELECT** (organizer / admin / confirmed) is unbounded. The app then splits Incoming vs Past with `isRunActive` (stamp **or** past grace).

**In-progress** exists only in `src/lib/run-lifecycle.ts` (`RUN_GRACE_MS`). Postgres has no in-progress encoding.

**Live SQL is split across two files** — do not retarget S-15 alone:

| Object | Live definition |
|--------|-----------------|
| `can_view_run`, `runs_select_active_authenticated`, `runs_update_own` | `supabase/migrations/20260831123822_clan_only_run_rls.sql` (includes `clan_only` / `is_same_clan`) |
| `runs_select_active_anon`, `auto_join_run`, `is_run_in_active_window`, `run_invites_*_organizer_active`, `create_invite_only_run` | `supabase/migrations/20260824101006_restricted_run_visibility.sql` |

`mapRunRow` keys phase off `starts_at` only and drops `"archived"` rows; inventory uses `isRunActive` (stamp + grace). A stamp while still inside the old window would be dropped by `mapRunRow` unless that drift is fixed.

Research: `context/changes/manual-archive-and-extend/research.md`. Predecessor S-04: `context/archive/2026-08-07-run-archival-lifecycle/`.

## Desired End State

- **Audience-active** ⇔ `archived_at IS NULL AND (extended_until IS NULL OR extended_until > now())`. No `starts_at + 1h` anywhere in live predicates.
- **Upcoming** = audience-active and `now < starts_at`. **In-progress** = audience-active and `now >= starts_at` (unbounded until stamp or elapsed extend). **Archived** = not audience-active.
- Organizer (header) or admin (Admin section) can Archive any non-archived run. Organizer can one-shot Extend an in-progress run by 1/2/3/6 hours. Admin cannot extend. Hard-delete stays.
- Creating a 6th audience-active run fails in SQL and in `POST /api/runs` with a fixed friendly error. Archiving or an elapsed extend frees a slot.
- Guests still see only public audience-active runs on `/runs` (FR-024). Restricted still 404s like missing. Comment read ACL unchanged. S-08 unseated organizer still opens archive. Confirmed + admin still reopen archive.
- Cutover: rows that were already past the old 1h window with `archived_at` null are stamped in the same migration so they do not reappear on the public list or occupy the cap.

### Key Discoveries:

- Dual “active” meanings must survive: audience list/mutations vs unbounded privilege SELECT (`research.md` Architecture Insight 1). App filters on active UX remain mandatory after RLS change.
- Do not call `is_run_in_active_window` from a policy **on** `public.runs` (S-13 / edit-run: that helper SELECTs `runs` → `42P17`).
- Column GRANT UPDATE is the lock that S-13 used for `archived_at`; keep `extended_until` off that list too (DEFINER RPCs only).
- `mapRunRow` vs `isRunActive` drift (`runs.ts` ~176–185): active DTOs must honor stamp **and** elapsed extend, not time-only phase.
- `list_player_public_runs` currently RETURNS `archived_at` but not `extended_until`; `listPlayerProfileRuns` seeds `byId` from the RPC first — replace the function (still no time predicate) and map the column in `runRowFromPublicRpc`.
- Newest migration stamp to beat: `20260831123822`. Types are generated (`npm run db:types`); do not hand-edit `src/types/database.ts`.
- Mutation UI pattern: `AdminRunControls` + `fetchFormJson` + `runFail` opaque `?error=` (`src/lib/comment-mutation-http.ts`). Organizer edit is classic form POST; do not bolt Archive/Extend onto `CreateRunForm`.

## What We're NOT Doing

- Un-archive / clearing `archived_at` or `extended_until`
- Cron, pg_cron, Cloudflare `scheduled`, or lazy stamp on read (elapsed extend stays derived)
- Admin extend (FR-004 is organizer-only)
- Owner hard-delete (S-30); admin Delete stays as shipped
- Changing comment **read** ACL; guests / pending / unconfirmed friends-or-invitees still cannot read
- 403 instead of 404 for restricted or archived-hidden runs
- S-25 (capacity 64 / 1-year schedule bound) or S-26 team-size
- A DB lifecycle enum / `status` column
- Vitest/Jest/pgTAP (no runner in `package.json`)
- Prefix-protecting `/runs` or `/clans`
- Clan pages listing runs (S-21)

## Implementation Approach

One additive migration (column + backfill + shared row predicate + retarget every live 1h site + DEFINER `archive_run` / `extend_run` + cap trigger) → regenerate types → rewrite `run-lifecycle.ts` and every app gate that used `activeWindowStartsAfter` / `RUN_GRACE_MS` → POST routes + React islands on `/runs/{id}` → create-form cap UX + AGENTS/prd.md stale 1h copy.

Canonical **audience-active** predicate (SQL and TS must match):

`archived_at IS NULL AND (extended_until IS NULL OR extended_until > now())`

## Critical Implementation Details

**Cutover order (same transaction):** `ADD COLUMN extended_until`, then backfill `archived_at = starts_at + interval '1 hour'` where `archived_at IS NULL AND starts_at <= now() - interval '1 hour'`, **then** replace policies/functions. Reversing that order resurrects every past-grace run on the guest list for the rest of the migration.

**Rewrite from the live clan_only file, not S-15.** `can_view_run` and `runs_select_active_authenticated` already have a `clan_only` + `is_same_clan` branch in `20260831123822_clan_only_run_rls.sql`. Copying the S-15 bodies would drop clan-only audience. Anon SELECT and invite/auto_join helpers still live in S-15 — retarget those too.

**Organizer/admin SELECT stays unbounded.** `listActiveRuns`, `getActiveRunById`, `loadActiveRunForMutation`, `requireActiveRun`, and edit loaders must apply the new audience-active predicate in the query (and `isRunActive` after fetch). RLS alone will not hide elapsed-extend or unstamped in-progress rows from those roles.

**`mapRunRow` must call `isRunActive` (stamp + extend), not `getRunLifecyclePhase(starts_at)` alone.** Otherwise a stamped or elapsed-extend row can leak into active DTOs, or a still-active in-progress row can be dropped.

**Do not GRANT UPDATE (`archived_at`, `extended_until`).** RPCs are the only app writers of those columns after cutover backfill. Do not call `is_run_in_active_window(run_id)` from `runs` policies — inline `is_run_active_row(archived_at, extended_until)` (column args, no `SELECT` on `runs`).

## Phase 1: SQL contract — column, backfill, RLS, RPCs, cap

### Overview

Land the new audience-active predicate in Postgres, stamp already-derived-archived rows, add one-way archive/extend RPCs, and enforce the 5-cap so PostgREST cannot skip it.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_manual_archive_and_extend.sql` (via `npx supabase migration new manual_archive_and_extend`; stamp after `20260831123822`)

**Intent**: Make archive a stamp, extend an optional deadline, drop the 1h auto-archive, and cap organizers at 5 audience-active runs without opening column grants.

**Contract**:

- `ALTER TABLE public.runs ADD COLUMN extended_until timestamptz` (nullable, no default required). Comment that it is a scheduled audience-exit, not a grace on every run.
- Backfill (before policy rewrite):

  `UPDATE public.runs SET archived_at = starts_at + interval '1 hour' WHERE archived_at IS NULL AND starts_at <= (now() - interval '1 hour');`

- Helper `public.is_run_active_row(p_archived_at timestamptz, p_extended_until timestamptz) RETURNS boolean`, `LANGUAGE sql STABLE`, **not** DEFINER, no `SELECT` from `runs`: `p_archived_at IS NULL AND (p_extended_until IS NULL OR p_extended_until > now())`. `REVOKE ALL FROM public`; `GRANT EXECUTE` to `anon` and `authenticated` (anon SELECT policy uses it).
- Replace the 1h conjunct with `is_run_active_row(archived_at, extended_until)` (or the inlined equivalent) on every **live** object:

  - `can_view_run` — `CREATE OR REPLACE` from the **clan_only** body; `SELECT` `extended_until`; privilege paths (admin / organizer / confirmed) still return true before the audience check; `v_in_window := public.is_run_active_row(v_archived_at, v_extended_until)`.
  - `runs_select_active_anon` (drop/create; keep `visibility = 'public'`).
  - `runs_select_active_authenticated` (drop/create; keep public / friends_only+`are_friends` / invite_only+`is_run_invitee` / clan_only+`is_same_clan`).
  - `runs_update_own` USING **and** WITH CHECK — keep organizer, `is_not_banned()`, verified-for-non-public, clan_only owner exists; replace the 1h window with `is_run_active_row(archived_at, extended_until)` on both OLD (USING) and NEW (WITH CHECK).
  - `run_invites_insert_organizer_active` / `run_invites_delete_organizer_active` — exists run: organizer + `is_run_active_row`.
  - `is_run_in_active_window(p_run_id)` — exists run with `is_run_active_row` **AND** `can_view_run` (still DEFINER; still not used from `runs` policies).
  - `auto_join_run` — `'not_active'` when missing, `NOT is_run_active_row(...)`, or `NOT can_view_run`.
- `create_invite_only_run`: before INSERT, if the organizer already has 5 audience-active rows, `RAISE EXCEPTION 'active_run_cap' USING ERRCODE = 'P0001'`. Insert may omit `extended_until` (null). This pre-check stays UX — no advisory lock here; the BEFORE INSERT trigger serializes concurrent creates.
- BEFORE INSERT trigger on `public.runs` (organizer cap): at start, `pg_advisory_xact_lock(8724, hashtext(NEW.organizer_id::text))` (namespace `8724` is this slice’s organizer-cap lock — comment it in the migration so later advisory locks do not collide), **then** count. If `(SELECT count(*) FROM public.runs r WHERE r.organizer_id = NEW.organizer_id AND public.is_run_active_row(r.archived_at, r.extended_until)) >= 5` then raise `active_run_cap` / `P0001`. Count existing rows only (the new row is not visible yet). Function `REVOKE ALL FROM public` (trigger-only).
- `archive_run(p_run_id uuid) RETURNS text`, `SECURITY DEFINER`, `SET search_path = ''`. Grant `EXECUTE` to `authenticated` only. Soft codes (no raise for business cases), same family as `auto_join_run`: `not_authenticated` / `not_found` / `banned` / `already_archived` / `archived`. Load the row; if `auth.uid()` is neither `organizer_id` nor `is_admin()`, return `not_found` (do not leak restricted runs). If the caller is the organizer and `NOT is_not_banned()`, return `banned` (admin caller skips this — admin archive still works). If `archived_at IS NOT NULL`, `already_archived`. Else `SET archived_at = now()` where still null; return `archived`. Allowed on upcoming and in-progress. Do not require a confirmed seat. Do not exempt `POST /api/runs/{id}/archive` from the existing middleware banned POST gate (`src/middleware.ts`: all `POST /api/*` except `/api/auth/`).
- `extend_run(p_run_id uuid, p_hours integer) RETURNS text`, `SECURITY DEFINER`, `SET search_path = ''`. Grant `EXECUTE` to `authenticated` only. Codes: `not_authenticated` / `not_found` / `banned` / `not_in_progress` / `not_active` / `already_extended` / `invalid_hours` / `extended`. Organizer only (`auth.uid() = organizer_id`; admin who is not organizer → `not_found`). Require `is_not_banned()`, audience-active, `now() >= starts_at`, `extended_until IS NULL`, `p_hours IN (1, 2, 3, 6)`. Set `extended_until = now() + (p_hours * interval '1 hour')`.
- Re-assert column grants: `REVOKE UPDATE ON public.runs FROM authenticated`; `GRANT UPDATE (title, map_id, map_category, starts_at, max_participants, min_points, join_mode, visibility)` only — **not** `archived_at`, **not** `extended_until`, **not** `organizer_id`.
- Leave `runs_select_own_organizer`, `runs_select_admin`, `runs_select_confirmed_participant`, `runs_update_admin`, and comment SELECT policies unchanged in behavior.
- `CREATE OR REPLACE list_player_public_runs`: add `extended_until timestamptz` to `RETURNS TABLE` (after `archived_at`) and to the `SELECT` (`r.extended_until`). Keep the query unfiltered — still no time predicate; still `visibility = 'public'` + organizer-or-confirmed. Grants unchanged (`anon`, `authenticated`). “Unchanged behavior” means still no audience-active filter; the new column is for the app Incoming/Recent split.

#### 2. Generated types

**File**: `src/types/database.ts` (via `npm run db:types` only)

**Intent**: Expose `extended_until` and the new RPCs to the app.

**Contract**: After the migration applies locally, regenerate. `runs` Row/Insert/Update include `extended_until`. Functions include `archive_run` and `extend_run`. `list_player_public_runs` Returns includes `extended_until`. No hand-edits.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration up` (or project equivalent) applies this migration on a clean local DB
- `npm run db:types` — `extended_until` on `runs`; `archive_run` / `extend_run` present; `list_player_public_runs` Returns includes `extended_until`; file not hand-edited
- SQL smoke: `pg_get_functiondef` / `pg_policies` for `can_view_run`, `is_run_in_active_window`, `auto_join_run`, `runs_select_active_anon`, `runs_select_active_authenticated`, `runs_update_own` contain `is_run_active_row` (or the equivalent conjunct) and **no** `interval '1 hour'` audience window
- SQL smoke: backfill — a seed/fixture row with `starts_at` 2h ago and `archived_at` null becomes stamped; a row with `starts_at` 10 minutes ago stays `archived_at` null
- SQL smoke: `anon` SELECT sees public audience-active only; public row with elapsed `extended_until` is hidden; stamped row hidden; confirmed/organizer/admin still SELECT archived
- SQL smoke: 5th audience-active INSERT succeeds; 6th INSERT and 6th `create_invite_only_run` raise `active_run_cap`; archiving one then INSERT succeeds; elapsed-extend unstamped row does not count toward the 5
- SQL smoke: `archive_run` as organizer stamps; second call `already_archived`; non-owner non-admin `not_found`; banned organizer → `banned`; admin (non-owner, including of a banned organizer’s run) stamps; `extended_until` / `archived_at` UPDATE via PostgREST as `authenticated` fails (grant)
- SQL smoke: `extend_run` 1/2/3/6 succeeds once on in-progress organizer; upcoming → `not_in_progress`; second call `already_extended`; hours 4 or 7 → `invalid_hours`; admin non-owner → `not_found`
- SQL smoke: clan_only audience branch still present on `can_view_run` and `runs_select_active_authenticated`
- SQL smoke: `list_player_public_runs` RETURNS TABLE / SELECT includes `extended_until`; query still has no time predicate (public + organizer-or-confirmed only)
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification:

- Local Studio: `runs.extended_until` exists; UPDATE grant list omits `archived_at` and `extended_until`
- Local Studio: `archive_run` / `extend_run` / `is_run_active_row` exist with expected grants

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: App lifecycle, services, and create cap

### Overview

Make TypeScript the same contract as Phase 1: lists, detail, mutations, inventory splits, and create all use audience-active (stamp + optional elapsed extend). No Archive/Extend buttons yet.

### Changes Required:

#### 1. Shared lifecycle helpers

**File**: `src/lib/run-lifecycle.ts`

**Intent**: Stop treating clock+1h as archive. Phase is stamp/extend first, then upcoming vs in-progress from `starts_at`.

**Contract**:

- Remove `RUN_GRACE_MS` as the archive trigger. Remove `activeWindowStartsAfter` and `archiveDeadlineAt` (or stop exporting them — no remaining callers).
- Export `MAX_ACTIVE_RUNS_PER_ORGANIZER = 5`.
- `isRunActive(startsAt, archivedAt, extendedUntil, now?)`: false if `archivedAt != null`; false if `extendedUntil` is non-null and `now >= extendedUntil`; else true. `startsAt` is unused for the boolean (keep the arg so call sites stay readable / future-proof) — do **not** time-archive from `starts_at`.
- `getRunLifecyclePhase(startsAt, archivedAt, extendedUntil, now?)`: if `!isRunActive(...)` → `"archived"`; else if `now < starts_at` → `"upcoming"`; else `"in_progress"`.
- Callers pass `extendedUntil` (null on create validation).

#### 2. Run services — select, map, list, inventory, edit

**File**: `src/lib/services/runs.ts`

**Intent**: Active UX never returns a stamped or elapsed-extend run; Past/Recent use the same predicate; `mapRunRow` no longer ignores `archived_at`.

**Contract**:

- Add `extended_until` to `RUN_SELECT`, `RunRow`, and active/archived DTOs (`extendedUntil: string | null`).
- `runRowFromPublicRpc`: map `row.extended_until` onto `RunRow.extended_until` (same field as `RUN_SELECT` rows). Do not leave it undefined — guest Incoming/Recent seeds `byId` from the RPC first.
- `mapRunRow`: if `!isRunActive(starts_at, archived_at, extended_until, now)` return null; else attach `lifecyclePhase` from `getRunLifecyclePhase(...)`. Never decide archive from `starts_at` alone.
- `mapArchivedRunRow`: inverse (`isRunActive` → null).
- `listActiveRuns` / `getActiveRunById` / `getOwnedActiveRunForEdit` / `updateRun` load / `prepareOwnedActiveRunPatch`: drop `.gt("starts_at", activeWindowStartsAfter())`. Filter `.is("archived_at", null)` and exclude elapsed extend (query `.or("extended_until.is.null,extended_until.gt.<nowIso>")` **or** equivalent post-filter via `isRunActive`). Organizer/admin bypass RLS — the app filter is mandatory.
- `listRunsForOrganizer` / `listRunsForParticipant` / `listPlayerProfileRuns` / `listArchivedRunsForParticipant`: split on `isRunActive(..., extended_until)`. `list_player_public_runs` still has no time predicate (Phase 1 adds `extended_until` to RETURNS TABLE / SELECT); app split stays.
- `canOpenArchivedRunDetail` unchanged (admin OR organizer OR confirmed).
- Archived loaders (`getArchivedRunForParticipant` / `ForOrganizer` / `ForAdmin`) still require `!isRunActive`. Participant loader still requires current confirmed seat. Organizer loader still has **no** seat requirement (S-08).
- Edit `starts_at` check: `isRunActive(newStartsAt, null, existingExtendedUntil)` replaces `isRunActive(newStartsAt, null)`. Create still requires `starts_at` in the future (unchanged). With unbounded in-progress, a past `starts_at` on edit is allowed while the run stays audience-active — that is intended (q5).
- `countAudienceActiveRunsForOrganizer(supabase, organizerId): Promise<number>` — same predicate, used by create API and `/runs/new`.
- `archiveRun(supabase, runId)` → `rpc("archive_run")`. Map `archived` → void; `already_archived` / `not_found` / `banned` / other → `RunError` with fixed strings (“This run is already archived.” / “Run not found or no longer active” / banned copy matching other run mutations). Never put PostgREST text in `RunError.message`.
- `extendRun(supabase, runId, hours: 1 | 2 | 3 | 6)` → `rpc("extend_run")`. Map `extended` → void; domain codes → fixed `RunError` strings (in-progress only, one-shot, invalid hours, not found, banned).

#### 3. Participant and comment mutation gates

**Files**: `src/lib/services/participants.ts`; `src/lib/services/comments.ts`

**Intent**: Apply / leave / decide / withdraw / auto-join / comment write fail when the run is not audience-active, with the same user-facing “no longer active” copy as today.

**Contract**: `loadActiveRunForMutation` and `requireActiveRun` drop the `starts_at` lower bound; require `archived_at` null and not elapsed extend. Do not import each other’s private helpers. `auto_join_run` already returns `not_active` from Phase 1.

#### 4. Create cap (API + invite RPC mapping)

**Files**: `src/pages/api/runs/index.ts`; `src/lib/services/runs.ts` (`createInviteOnlyRun` / insert error mapper)

**Intent**: Friendly fail before/at insert; SQL trigger remains the source of truth.

**Contract**: After profile/nickname gates, if `countAudienceActiveRunsForOrganizer >= 5`, `fail` with the fixed string **“You already have 5 active runs. Archive one to create another.”** Map trigger/`create_invite_only_run` `active_run_cap` / `P0001` to that same string (never raw PostgREST). Direct `.insert()` path and invite-only RPC both covered.

#### 5. Create form edit-mode validation

**File**: `src/components/runs/CreateRunForm.tsx`

**Intent**: Client edit check follows the new `isRunActive` signature (needs `extendedUntil` from the loaded run).

**Contract**: Replace `isRunActive(d, null)` with the four-arg helper. Create mode keeps “start must be in the future”; do not use `isRunActive` as a substitute for that create rule.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0
- `npm run build` exits 0
- No remaining `RUN_GRACE_MS` / `activeWindowStartsAfter` / `archiveDeadlineAt` callers under `src/`
- `mapRunRow` / `runRowFromPublicRpc` / inventory splits use `isRunActive` including `extended_until`
- Create API contains the 5-active fail string; `archiveRun` / `extendRun` exist

#### Manual Verification:

- Guest `/runs`: public upcoming + in-progress (including started >1h ago if unstamped and not elapsed-extend); no stamped rows; no elapsed-extend rows
- Signed-in `/runs` sections still Public vs Friends vs Invited vs admin Restricted (S-15/S-21 partition unchanged)
- Detail 404 copy for guests on archived / restricted (“missing or no longer active”); never 403
- Organizer without a confirmed seat still opens their archived detail (S-08)
- Confirmed participant Past and admin player-archive still reopen
- Comment **read** on archived still works for confirmed / organizer / admin; comment **write** / like fail when not audience-active
- Apply/join on an elapsed-extend or stamped run fails “no longer active”
- Sixth create (public insert and invite-only) shows the 5-active string; after archiving one, create succeeds
- Edit of an in-progress unstamped run still loads (`/runs/{id}/edit` not 404 solely because start is >1h ago)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: HTTP, UI, and docs

### Overview

Wire Archive / Extend buttons and admin Archive vs Delete, surface the cap on `/runs/new`, and update agent/product docs so the 1h contract is not rediscovered.

### Changes Required:

#### 1. Organizer archive + extend APIs

**Files**: `src/pages/api/runs/[id]/archive.ts` (new); `src/pages/api/runs/[id]/extend.ts` (new)

**Intent**: Cookie-session POST endpoints that call Phase 2 RPCs and never echo infrastructure errors.

**Contract**:

- Both `export const POST`. Invalid UUID → existing `commentInvalidRun`. No session → `commentUnauthorized`. Use `runFail` / `wantsJson` / `commentJson` like admin delete. Do not exempt `/api/runs/{id}/archive` (or `/api/admin/runs/{id}/archive`) from the existing middleware banned POST gate.
- Archive: `archiveRun`; success redirect `/runs/{id}` (now archived for organizer/admin; guest would 404). JSON `{ ok: true, redirect }`.
- Extend: form field `hours` in `{1,2,3,6}` (reject otherwise with a fixed string). `extendRun`; success redirect `/runs/{id}`.
- `RunError` → `runFail(err.message)`. Other errors → `console.error` + fixed “Could not archive this run” / “Could not extend this run”.

#### 2. Admin archive API

**File**: `src/pages/api/admin/runs/[id]/archive.ts` (new)

**Intent**: Same stamp as organizer, but admin-gated like Delete; not an extend path.

**Contract**: Copy `delete.ts` auth (`profile.role === "admin"`, JSON 403 / redirect `/` for non-admin). Call `archiveRun` (RPC already allows `is_admin()`). Success: stay on `/runs/{id}` so the admin sees archived detail. Do not remove Delete.

#### 3. Organizer lifecycle island

**File**: `src/components/runs/OrganizerRunLifecycleControls.tsx` (new)

**Intent**: Archive + optional extend next to Edit, mirroring `AdminRunControls` (confirm + `fetchFormJson` + `ServerError`).

**Contract**: Props: `runId`, `lifecyclePhase`, `extendedUntil`. React island, no Next.js directives, `cn()` if classes are merged. Archive: `window.confirm` that the run leaves the active list and can be reopened from Dashboard → Past; POST `/api/runs/{id}/archive`. Extend: only if `lifecyclePhase === "in_progress"` **and** `extendedUntil == null`; four buttons/fields for 1 / 2 / 3 / 6 hours; confirm that the run will leave the active list in N hours; POST `/api/runs/{id}/extend`. If `extendedUntil` is set and still in the future, show a single line that a leave-active time is scheduled (no second extend). 401 → `signIn`. Merge classes with `cn()`.

#### 4. Detail page placement

**File**: `src/pages/runs/[id].astro`

**Intent**: Organizer header gets Archive/Extend; Admin section gets Archive next to Delete with distinct copy.

**Contract**: When `isOrganizer && !isArchived`, render `OrganizerRunLifecycleControls` beside the Edit link (`~168–177`). When `isAdmin && !isArchived`, pass a `showArchive` (or equivalent) into `AdminRunControls` so Archive appears in the red Admin block **above** Delete. Copy must not say “delete”. An admin who is also organizer may see Archive twice (accepted). `?error=` banner: organizers should see archive/extend failures (page already has `serverError` — do not hide it behind admin-only). Do not add apply/approve/leave on archived. In-progress / archived status copy stays.

#### 5. Admin controls

**File**: `src/components/runs/AdminRunControls.tsx`

**Intent**: Archive is a session-end; Delete remains destructive.

**Contract**: Optional `showArchive`. Archive confirm + POST `/api/admin/runs/{id}/archive` via `fetchFormJson`. Button label “Archive run” (not Delete). Delete unchanged.

#### 6. Create page cap UX

**Files**: `src/pages/runs/new.astro`; `src/components/runs/CreateRunForm.tsx` (only if needed for a banner slot)

**Intent**: At 5 audience-active runs, the organizer sees why create is blocked without waiting on submit, and submit still fails if they race.

**Contract**: When signed-in and not banned, count via `countAudienceActiveRunsForOrganizer`. If `>= 5`, show the same 5-active string and do not render a working submit (hide the form or disable it). Server `?error=` from Phase 2 still works if they POST anyway. Do not add the cap to `PROTECTED_ROUTES`.

#### 7. Docs (stale 1h contract)

**Files**: `AGENTS.md`; `context/foundation/prd.md`

**Intent**: Agents and v1 PRD stop teaching auto-archive after 1 hour (`lessons.md`: update stale docs in the same change).

**Contract**:

- `AGENTS.md` Hard Rules: organizer/admin archive via `POST /api/runs/{id}/archive` and `POST /api/admin/runs/{id}/archive`; organizer extend `POST /api/runs/{id}/extend` (1/2/3/6h, in-progress, one-shot); audience-active ⇔ stamp null and not elapsed extend; max 5 audience-active runs per organizer; do not GRANT UPDATE on `archived_at` / `extended_until`. Keep 404-not-403, comment ACL, `/runs` public, S-08 organizer archive loader.
- `context/foundation/prd.md`: rewrite the Guardrails bullet and US-01 **Then** that still say runs auto-archive 1 hour after start so they match PRD v2 (manual archive / optional extend ≤ 6h / 5-cap). Do not renumber v1 FRs; `prd-v2.md` is already correct — do not duplicate a full PRD rewrite.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0
- `npm run build` exits 0
- `AGENTS.md` documents archive/extend POST paths and the 5-cap; `PROTECTED_ROUTES` still does not prefix-protect `/runs`
- `prd.md` Guardrails / US-01 Then no longer claim a 1-hour auto-archive

#### Manual Verification:

- Organizer upcoming: Archive visible, Extend hidden; Archive → leaves `/runs`, appears Dashboard Past, create slot frees
- Organizer in-progress: Extend 1/2/3/6; after extend, badges stay in-progress until deadline; after deadline (or by waiting / DB tweak in Studio), run leaves guest `/runs` without a stamp; second extend fails
- Admin non-organizer: Archive in Admin section, no header Extend; Archive works; Delete still present and still distinct
- Guest cannot archive/extend (no controls; POST unauthenticated → sign-in)
- Non-participant friend/invitee still 404s an archived restricted run
- `/runs/new` at cap shows the 5-active message; after archive, form returns
- Player `/players/{id}` Incoming vs Recent follows `isRunActive`; Recent href still only if `canOpenArchivedRunDetail`
- Home `Welcome.astro` preview still uses public active list only

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`. Do not add Vitest in this slice.

### Integration Tests:

- Phase 1 SQL smoke (policies, RPCs, cap, backfill, grants, clan_only branch) is the regression harness.
- `npm run lint` and `npm run build` on every phase.

### Manual Testing Steps:

1. Guest `/runs` and `/` preview: public audience-active only; filter still works (FR-024).
2. Organizer at 4 active: create 5th OK; 6th blocked; archive upcoming 5th; create again.
3. In-progress >1h after start, never extended: still on list, still editable, still joinable/commentable; Archive ends it.
4. Extend 2h; confirm public list drops it after `extended_until` without `archived_at` set; dashboard Past shows it; cap slot frees.
5. Restricted friends-only: outsider 404 active and archived; never 403.
6. Unseated organizer archived detail; confirmed teammate comments readable, not writable.
7. Admin Archive vs Delete on someone else’s run.

## Performance Considerations

Audience lists lose the `starts_at > now()-1h` selectivity. The 5-cap bounds how many rows one organizer can keep active; unbounded in-progress is an accepted product risk (forgotten runs stay until Archive or elapsed extend). Do not add indexes speculatively; a composite `(archived_at, extended_until, starts_at)` is optional only if list queries regress in Studio.

Worker `Date` vs Postgres `now()` on `extended_until` can disagree by seconds (same class as S-04). Acceptable; no skew compensation.

## Migration Notes

- Forward-only. Backfill is one-way (cannot later distinguish “was derived-archived” from a manual stamp).
- Rollback = revert the migration + app; restored 1h window would treat stamped rows as archived via the existing `archived_at` short-circuit (`isRunActive`), which is compatible.
- Local: apply migration, `npm run db:types`, then Phase 2. Production CD already pushes migrations on `v*` tags (`/gh-release`), not on merge to `main`.
- `create_invite_only_run` and the insert trigger must agree on the count predicate or the 6th invite-only create will throw an unmapped error.

## References

- Related research: `context/changes/manual-archive-and-extend/research.md`
- Crew decisions (locked ⭐): complexity HIGH; backfill; DEFINER `archive_run`; unbounded in-progress + optional `extended_until`; mutations while audience-active; dual-defense 5-cap; 1/2/3/6h extend UI; derived-only elapsed extend; DEFINER `extend_run`; admin Archive in Admin section; archive upcoming or in-progress; F1 `list_player_public_runs` RETURNS `extended_until` (still unfiltered); F2 cap trigger `pg_advisory_xact_lock(8724, …)` then count; F3 archive follows `is_not_banned()` / banned POST gate (no exemption)
- Predecessor: `context/archive/2026-08-07-run-archival-lifecycle/` (replace derived 1h; preserve retain-not-delete, 404-not-403, app+RLS dual defense)
- Live RLS to copy from: `supabase/migrations/20260831123822_clan_only_run_rls.sql`, `supabase/migrations/20260824101006_restricted_run_visibility.sql`
- UI pattern: `src/components/runs/AdminRunControls.tsx`, `src/lib/comment-mutation-http.ts`
- Lessons: opaque `?error=`; update stale 1h docs in this change

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: SQL contract — column, backfill, RLS, RPCs, cap

#### Automated

- [x] 1.1 npx supabase migration up applies this migration on a clean local DB
- [x] 1.2 npm run db:types — extended_until on runs; archive_run / extend_run present; file not hand-edited
- [x] 1.3 SQL smoke: live can_view_run, is_run_in_active_window, auto_join_run, runs_select_active_anon, runs_select_active_authenticated, runs_update_own use is_run_active_row (or equivalent) and have no interval '1 hour' audience window
- [x] 1.4 SQL smoke: backfill stamps starts_at 2h ago; starts_at 10 minutes ago stays unstamped
- [x] 1.5 SQL smoke: anon SELECT public audience-active only; elapsed extend and stamp hidden; confirmed/organizer/admin still SELECT archived
- [x] 1.6 SQL smoke: 5th INSERT ok; 6th INSERT and 6th create_invite_only_run raise active_run_cap; archive then INSERT ok; elapsed-extend unstamped does not count
- [x] 1.7 SQL smoke: archive_run organizer/admin/not_found/already_archived; authenticated cannot UPDATE archived_at or extended_until
- [x] 1.8 SQL smoke: extend_run 1/2/3/6 one-shot; upcoming / already_extended / invalid_hours / admin non-owner
- [x] 1.9 SQL smoke: clan_only branch still on can_view_run and runs_select_active_authenticated
  (N/A on origin/main: `clan_only` lives on feature/clan-runs. Adapted from S-15; S-21 must retarget `is_run_active_row` when it merges.)
- [x] 1.10 npm run lint exits 0
- [x] 1.11 npm run build exits 0
- [x] 1.14 SQL smoke: list_player_public_runs RETURNS TABLE includes extended_until; query still unfiltered (no time predicate)

#### Manual

- [ ] 1.12 Local Studio: runs.extended_until exists; UPDATE grant list omits archived_at and extended_until
- [ ] 1.13 Local Studio: archive_run / extend_run / is_run_active_row exist with expected grants

### Phase 2: App lifecycle, services, and create cap

#### Automated

- [ ] 2.1 npm run lint exits 0
- [ ] 2.2 npm run build exits 0
- [ ] 2.3 No remaining RUN_GRACE_MS / activeWindowStartsAfter / archiveDeadlineAt callers under src/
- [ ] 2.4 mapRunRow / inventory splits use isRunActive including extended_until
- [ ] 2.5 Create API contains the 5-active fail string; archiveRun / extendRun exist

#### Manual

- [ ] 2.6 Guest /runs: public upcoming + in-progress (including started >1h ago if unstamped); no stamped or elapsed-extend rows
- [ ] 2.7 Signed-in /runs sections still Public vs Friends vs Invited vs admin Restricted
- [ ] 2.8 Detail 404 copy for guests on archived / restricted; never 403
- [ ] 2.9 Organizer without a confirmed seat still opens their archived detail (S-08)
- [ ] 2.10 Confirmed participant Past and admin player-archive still reopen
- [ ] 2.11 Comment read on archived for confirmed / organizer / admin; write/like fail when not audience-active
- [ ] 2.12 Apply/join on elapsed-extend or stamped run fails no longer active
- [ ] 2.13 Sixth create (public and invite-only) shows the 5-active string; after archiving one, create succeeds
- [ ] 2.14 Edit of in-progress unstamped run still loads when start is >1h ago

### Phase 3: HTTP, UI, and docs

#### Automated

- [ ] 3.1 npm run lint exits 0
- [ ] 3.2 npm run build exits 0
- [ ] 3.3 AGENTS.md documents archive/extend POST paths and the 5-cap; PROTECTED_ROUTES still does not prefix-protect /runs
- [ ] 3.4 prd.md Guardrails / US-01 Then no longer claim a 1-hour auto-archive

#### Manual

- [ ] 3.5 Organizer upcoming: Archive visible, Extend hidden; Archive leaves /runs, appears Dashboard Past, frees a slot
- [ ] 3.6 Organizer in-progress: Extend 1/2/3/6; stays in-progress until deadline; after deadline leaves guest /runs without a stamp; second extend fails
- [ ] 3.7 Admin non-organizer: Archive in Admin section, no header Extend; Archive works; Delete still present and distinct
- [ ] 3.8 Guest cannot archive/extend; POST unauthenticated → sign-in
- [ ] 3.9 Non-participant friend/invitee still 404s an archived restricted run
- [ ] 3.10 /runs/new at cap shows the 5-active message; after archive, form returns
- [ ] 3.11 Player /players/{id} Incoming vs Recent follows isRunActive; Recent href only if canOpenArchivedRunDetail
- [ ] 3.12 Home Welcome.astro preview still uses public active list only
