# Edit an active run (S-13) Implementation Plan

## Overview

Give the creating organizer a way to change an **active** run (upcoming or in-progress grace) so the public list and detail views show the new values (FR-021 / US-06). Archived runs stay immutable except admin delete. Join-mode and capacity rules stay aligned with S-02/S-05: lock `join_mode` after any non-organizer participant row, and never drop `max_participants` below the confirmed roster (including the organizer auto-seat).

## Current State Analysis

Create already writes `title`, `map_id`, `starts_at`, `max_participants`, `min_points`, and `join_mode` via `/runs/new` + `POST /api/runs` (`src/pages/api/runs/index.ts`, `CreateRunForm.tsx`). List, detail, and dashboard only **read** those columns (`RunListItem` in `src/lib/services/runs.ts`). There is no app-layer `.from("runs").update()`, no `/runs/[id]/edit` page, and no Edit control on dashboard or detail.

RLS already has `runs_update_own` (organizer + `is_not_banned()`, `supabase/migrations/20260729134008_run_domain_schema.sql`) and `runs_update_admin`, but **no active-window predicate**. A JWT holder can PATCH an archived run (and locked fields) through PostgREST. Archival is derived at read (`archived_at` stays null; `isRunActive` / `activeWindowStartsAfter` in `src/lib/run-lifecycle.ts`). Participant mutations share that window via private `loadActiveRunForMutation` (`src/lib/services/participants.ts`).

Insert always seats the organizer as `confirmed` (`seat_organizer_on_run_insert`). A literal “lock after first confirmation” would freeze join mode at create. `min_points` is display + list filter only — apply does not enforce it. Category and visibility columns do not exist (S-14 / S-15). Repo APIs are POST + `?error=` redirect; there is no test runner (CI = `astro sync` + lint + build). `lessons.md` forbids putting raw PostgREST/`Error.message` in `?error=`. Create still does that on insert failure — do not copy it.

## Desired End State

The organizer opens **Edit** from an active run they created (detail + dashboard active cards), lands on `/runs/{id}/edit` (auth required), and saves allowed fields. Guests are sent to sign-in. Everyone else — including admins and the owner of an archived run — sees the same 404 shell as a missing run. Public `/runs` and `/runs/{id}` show the new title, start, map, min points, capacity, and (when still unlocked) join mode. Saving never archives the run, never drops capacity below confirmed count, and never flips join mode after someone else has applied, pending, or been denied.

Verify by: creating a run, editing before anyone else applies (including join mode), applying from a second account, confirming join mode is locked, shrinking capacity down to confirmed but not below, rescheduling during grace without leaving the active window, and confirming archived `/edit` 404s.

### Key Discoveries:

- Organizer auto-seat means “first confirmation” is not a useful lock trigger; lock on **any non-organizer** `run_participants` row (`pending` | `confirmed` | `denied`).
- Postgres RLS UPDATE is a **silent no-op** when `USING` fails (zero rows, no error). The service must treat an empty update as failure after app-level validation so the user does not get a bogus success or a generic “not found” for a starts_at that would archive.
- Do **not** call `is_run_in_active_window(run_id)` from a policy **on** `public.runs` — that helper SELECTs `runs` and will recurse (same class of bug as inlining `run_participants` on comments). Inline `archived_at is null AND starts_at > now() - interval '1 hour'` on OLD/NEW columns.
- `PROTECTED_ROUTES` is prefix `startsWith`. Adding `/runs` would lock the public list. Match `/runs/{uuid}/edit` with a dedicated check.
- `src/pages/api/runs/[id]/` is already a directory, so the mutation route is `src/pages/api/runs/[id]/index.ts` (`POST /api/runs/:id`), not a sibling `[id].ts` file.
- `countConfirmedParticipants` is already exported from `participants.ts`; `getActiveRunById` is the **public** active loader and must not be the edit-page gate (any signed-in viewer of a public run could pass it).

## What We're NOT Doing

- Category-only create/edit (S-14) and friends/invite visibility (S-15) — columns do not exist.
- Admin edit of runs (admin keeps delete on detail only).
- Migrating, auto-denying, or deleting pending rows when capacity shrinks.
- Hard capacity on organizer Accept (S-02 soft overfill stays).
- Organizer delete/cancel of a run.
- Notifications that a run changed.
- Enforcing `min_points` on apply.
- Vitest/Jest, PATCH verbs, JSON dual-mode on this route (redirect-only, same as create).
- Extending `safeRunReturnTo` so sign-in returns to `/edit` (middleware today sends `/auth/signin` with no `returnTo` for all protected pages).
- Changing `runs_update_admin` or stamping `archived_at`.

## Implementation Approach

Three phases, DB-first (schema → service/API → UI), matching auto-join and comments:

1. Close the UPDATE hole in Postgres: active-window `USING`/`WITH CHECK`, column-level UPDATE grants, and a `BEFORE UPDATE` trigger for join-mode lock + capacity floor + `updated_at`.
2. `RunError` + `updateRun` in `runs.ts` and `POST /api/runs/[id]` that validate like create, then map RLS no-ops and trigger tokens to user-facing copy.
3. `/runs/[id]/edit` page, reuse/extend `CreateRunForm`, middleware protection, Edit links on detail and dashboard active cards.

App service owns messages. DB is the backstop for PostgREST. Last-write-wins if the organizer double-submits.

## Critical Implementation Details

**RLS no-op vs trigger raise.** Validate starts_at (`isRunActive(newStartsAt, null)`), capacity vs confirmed, and join-mode lock in the service **before** `.update()`. Then `.update().select("id").maybeSingle()`. Zero rows → `RunError("Run not found or no longer active")` (archived, not owner, or a race out of the window). Trigger exceptions use stable tokens `join_mode_locked` and `capacity_below_confirmed`; map those to `RunError` copy; `console.error` the raw error; never put PostgREST text in `?error=`.

**Create form’s future-only clock.** `CreateRunForm` rejects `starts_at <= now()`. That rule must not run in edit mode or grace reschedules are impossible. Edit client/server share `isRunActive`.

**File vs directory.** Pages: `src/pages/runs/[id].astro` (file) can sit beside `src/pages/runs/[id]/edit.astro` (directory `[id]/`). If the bundler errors, move detail to `src/pages/runs/[id]/index.astro` with no behavior change. API cannot use `api/runs/[id].ts`; use `api/runs/[id]/index.ts`.

## Phase 1: UPDATE RLS, grants, and invariant trigger

### Overview

Make organizer UPDATE of `runs` safe at the database: only active rows, only editable columns, join-mode and capacity invariants even if the app is bypassed.

### Changes Required:

#### 1. New migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_runs_update_active_invariants.sql` (timestamp at implement time; same header/section style as `20260807123643_auto_join_run_rpc.sql`)

**Intent**: Replace `runs_update_own` with an active-window policy; restrict authenticated UPDATE columns; add a DEFINER trigger that stamps `updated_at` and rejects illegal join_mode / capacity changes.

**Contract**:

- `DROP POLICY "runs_update_own"` and recreate for `TO authenticated`:
  - `USING`: `(select auth.uid()) = organizer_id AND public.is_not_banned() AND archived_at IS NULL AND starts_at > now() - interval '1 hour'`
  - `WITH CHECK`: same predicates on the **new** row (so a save cannot stamp `archived_at` or move `starts_at` out of the window)
- Do not call `is_run_in_active_window` from this policy.
- Leave `runs_update_admin` unchanged.
- `REVOKE UPDATE ON public.runs FROM authenticated;` then `GRANT UPDATE (title, map_id, starts_at, max_participants, min_points, join_mode) ON public.runs TO authenticated;` — INSERT/DELETE/SELECT grants unchanged. Trigger may still assign `NEW.updated_at`.
- Trigger function `public.enforce_run_update_invariants()` — `SECURITY DEFINER`, `set search_path = ''`, `revoke all from public`, **no** execute grant to `authenticated` (trigger-only, same posture as `seat_organizer_on_run_insert`):
  - `NEW.updated_at := now();`
  - If `NEW.join_mode IS DISTINCT FROM OLD.join_mode` and a `run_participants` row exists for this run with `user_id <> NEW.organizer_id`, `RAISE EXCEPTION 'join_mode_locked' USING ERRCODE = 'P0001'`
  - If `NEW.max_participants` is less than `count(*)` of `run_participants` for this run with `status = 'confirmed'`, `RAISE EXCEPTION 'capacity_below_confirmed' USING ERRCODE = 'P0001'`
- `BEFORE UPDATE ON public.runs` row trigger calling that function.
- Tokens `join_mode_locked` and `capacity_below_confirmed` are the Phase 2 mapping contract.

#### 2. Generated types

**File**: `src/types/database.ts` (via `npm run db:types` only)

**Intent**: Keep generated types in lockstep if the new function appears in the schema dump.

**Contract**: No hand-edits. Commit the diff if `db:types` changes the file.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the new migration cleanly
- `npm run db:types` succeeds (commit generated diff if any)
- `npm run lint` passes

#### Manual Verification:

- As organizer, SQL/PostgREST UPDATE of `title` on an upcoming run succeeds and `updated_at` changes
- UPDATE of an organizer-owned run whose `starts_at` is past grace affects 0 rows
- Changing `join_mode` after inserting a non-organizer participant row is rejected with `join_mode_locked`
- Setting `max_participants` below confirmed count (organizer seat counts) is rejected with `capacity_below_confirmed`
- Changing `join_mode` while only the organizer seat exists still succeeds
- Updating `archived_at` or `organizer_id` as authenticated is rejected (grant and/or WITH CHECK)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: `updateRun` service and POST `/api/runs/[id]`

### Overview

Add the app mutation: domain errors, the same field validation as create with edit-specific clocks and locks, redirect-only HTTP.

### Changes Required:

#### 1. Domain service

**File**: `src/lib/services/runs.ts`

**Intent**: Organizer-only update of an active run with user-facing `RunError` messages; DB remains the backstop.

**Contract**:

- Export `class RunError extends Error` with `this.name = "RunError"` (same shape as `ParticipantError` / `ProfileError`).
- Export `updateRun(supabase, userId, runId, input)` that:
  - Rejects invalid UUID
  - Loads the run with `organizer_id = userId`, `archived_at` null, `starts_at > activeWindowStartsAfter()` (duplicate that filter here; do **not** import `loadActiveRunForMutation`)
  - Missing row → `RunError("Run not found or no longer active")` (covers non-owner)
  - Validates `title` (trim empty → null), `map_id` (same UUID + maps lookup as create), `starts_at` (required, valid, `isRunActive(startsAt, null)`), `max_participants` (int > 0 and ≥ `countConfirmedParticipants`), `min_points` (int ≥ 0)
  - Join mode: if any `run_participants` row has `user_id <> organizer_id`, **do not send** `join_mode` in the patch (ignore POST). Else require `isJoinMode` and include it
  - `.update({ title, map_id, starts_at, max_participants, min_points, join_mode? }).eq("id", runId).select("id").maybeSingle()`
  - Zero rows → `RunError("Run not found or no longer active")`
  - On PostgREST error, if message/details contain `join_mode_locked` → `RunError("Join mode cannot be changed after someone has applied")`; `capacity_below_confirmed` → `RunError("Capacity cannot be below the confirmed roster")`; otherwise log and throw `RunError("Could not save this run")`
- Do not update `organizer_id`, `archived_at`, `created_at`, or `id`.

#### 2. API route

**File**: `src/pages/api/runs/[id]/index.ts`

**Intent**: Form POST from the edit page, same fail/success redirect style as create, without leaking infrastructure errors.

**Contract**:

- `export const POST`
- Parse the same form keys as create (`title`, `map_id`, `starts_at`, `max_participants`, `min_points`, `join_mode`) via a local `formString` helper
- Unauthenticated → `/auth/signin`
- Invalid run id → redirect `/runs`
- `fail(message)` → `/runs/{id}/edit?error=` (encodeURIComponent)
- Success → `/runs/{id}`
- Catch `RunError` → `fail(err.message)`; anything else → `console.error` + `fail("Could not save this run")`
- Banned POST already handled by middleware
- No `wantsJson` on this route

### Success Criteria:

#### Automated Verification:

- `npx astro sync` succeeds
- `npm run lint` passes

#### Manual Verification:

- Authenticated organizer POST of valid fields redirects to `/runs/{id}` and the row changed
- POST with `max_participants` below confirmed count returns the capacity `RunError` copy in `?error=`, not PostgREST text
- POST as a different signed-in user does not change the row and does not reveal that the run exists beyond the same not-found copy
- POST with a `starts_at` that would leave the active window is rejected with explicit copy before/instead of a silent no-op
- POST that includes a new `join_mode` after a non-organizer row leaves `join_mode` unchanged (service ignore; trigger if a bug sends it)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Edit page, form, middleware, and entry links

### Overview

Organizer-facing edit surface. Public pages stay read-only except the new Edit links for the owner of an **active** run.

### Changes Required:

#### 1. Protected path matching

**File**: `src/middleware.ts`

**Intent**: Require auth for the edit page without locking public `/runs` or `/runs/{id}`.

**Contract**: Keep the existing `PROTECTED_ROUTES` prefixes. Treat a path as protected if it is a current prefix **or** matches `/^\/runs\/[^/]+\/edit\/?$/`. Guest → `/auth/signin` (same as `/runs/new`; no `returnTo` change). Do not add `/runs` as a prefix. `/admin` 404 behavior unchanged.

#### 2. Edit page

**File**: `src/pages/runs/[id]/edit.astro`

**Intent**: Auth-only editor for the creating organizer of an active run; 404 shell otherwise.

**Contract**:

- `?error=` into `ServerError` like `new.astro`
- Banned → same banner as create (“cannot create” copy adapted to cannot edit)
- Loader: user required (middleware); load run **owned by** `user.id`; if missing or `!isRunActive` → same 404 markup/status as `runs/[id].astro` missing (`Astro.response.status = 404`, “Run not found”)
- Load maps via `listMapsForPicker`; confirmed count via `countConfirmedParticipants`; `joinModeLocked` = exists non-organizer participant
- Back link to `/runs/{id}`
- Render the shared form island with edit initial values
- Do not use `getActiveRunById` as the ownership gate

#### 3. Shared create/edit form

**File**: `src/components/runs/CreateRunForm.tsx` (extend in place, or extract a shared fields component used by create and edit — one layout, not a third copy)

**Intent**: Same fields as create, minus nickname; edit uses a different action, clock rule, optional locked join mode, and capacity floor.

**Contract**:

- Create behavior unchanged (future `starts_at`, nickname gates, `action="/api/runs"`, “Create run”)
- Edit: `action={/api/runs/{id}}`, prefill title/map/starts/capacity/min_points/join_mode, no nickname UI, submit “Save changes”
- When `joinModeLocked`: `<select disabled>` plus helper that join mode cannot change after someone has applied; disabled controls are not posted — server keeps the stored value
- Edit client validation: `isRunActive` for starts_at (not future-only); capacity integer > 0 and ≥ confirmed count; min_points ≥ 0
- Map remains optional (clear allowed)

#### 4. Entry points

**Files**: `src/pages/runs/[id].astro`, `src/pages/dashboard.astro`

**Intent**: Owner of an active run can reach the editor from the two organizer surfaces they already use.

**Contract**:

- Detail: if `isOrganizer && !isArchived`, show an Edit link to `/runs/{id}/edit` in the header (guest/other members never see it)
- Dashboard: Edit link on **active** cards only, not the past section
- Styling: existing text-link treatment (title links), not a new button system

#### 5. AGENTS protected-route list

**File**: `AGENTS.md`

**Intent**: Keep the agent onboarding list accurate (`lessons.md`: update stale docs in the same turn).

**Contract**: Mention `/runs/{id}/edit` next to the current `PROTECTED_ROUTES` list (`/dashboard`, `/runs/new`, `/admin`, `/runs/history`, `/profile`).

### Success Criteria:

#### Automated Verification:

- `npx astro sync` succeeds
- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification:

- Organizer sees Edit on dashboard active cards and on run detail; archived/past cards have no Edit
- Guest hitting `/runs/{id}/edit` is redirected to sign-in
- Signed-in non-owner and archived owner see the same 404 shell as a missing run (not a form)
- Saving title, map (including unset), min points, start (still active), and capacity (≥ confirmed) updates `/runs` and `/runs/{id}`
- After a second account applies, join mode is a disabled select with helper; save does not change `join_mode`
- During in-progress grace, a start time that stays inside the 1h window saves; a start that would archive is rejected
- Banned organizer sees the banned banner; POST is blocked by middleware

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None. No test runner in `package.json`; do not add Vitest for this slice.

### Integration Tests:

- None automated. Phase 1 uses SQL/PostgREST smokes; Phases 2–3 use form POST and UI.

### Manual Testing Steps:

1. Create a run as A. Open dashboard + detail — Edit is present. Change title, map, min points, start (future), capacity, join mode. Confirm public list/detail match.
2. As B, apply (pending). As A, join mode is locked; shrinking capacity to confirmed count works; shrinking below confirmed fails with the capacity message.
3. Accept B. Capacity floor is now 2 (A+B). Raising min points does not remove B.
4. Move start into the last hour (in-progress) still editable; move start ≥1h ago rejected; archived `/edit` 404s; detail remains readable from dashboard.
5. As C (other member) and as admin, `/edit` 404s; admin can still delete from detail.
6. Confirm `?error=` never shows a Postgres/PostgREST sentence.

## Performance Considerations

Single-row UPDATE plus two head counts (confirmed, non-organizer existence). No list-query or cache invalidation layer exists — SSR reread on the next page load is enough.

## Migration Notes

Forward-only SQL. No backfill (every run already has an organizer seat). Rollback is `supabase db reset` to the previous migration locally; production goes out with the next `/gh-release` tag (`cd_trigger: tag`). Column-level UPDATE grants are the one operational surprise: a client that PATCHes `archived_at` will start failing, which is intended.

## References

- PRD: `context/foundation/prd.md` — US-06, FR-021, Business Logic (capacity ≥ confirmed, archived immutable)
- Roadmap: `context/foundation/roadmap.md` — S-13
- Create: `src/pages/api/runs/index.ts`, `src/components/runs/CreateRunForm.tsx`
- Lifecycle: `src/lib/run-lifecycle.ts`
- RLS UPDATE today: `supabase/migrations/20260729134008_run_domain_schema.sql`
- Auto-join lock lesson: `context/archive/2026-08-07-auto-join-mode/plan.md` (no join_mode edit there)
- Error rule: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: UPDATE RLS, grants, and invariant trigger

#### Automated

- [x] 1.1 `npx supabase db reset` applies the new migration cleanly — 8056c74
- [x] 1.2 `npm run db:types` succeeds (commit generated diff if any) — 8056c74
- [x] 1.3 `npm run lint` passes — 8056c74

#### Manual

- [x] 1.4 As organizer, SQL/PostgREST UPDATE of `title` on an upcoming run succeeds and `updated_at` changes — 8056c74
- [x] 1.5 UPDATE of an organizer-owned run whose `starts_at` is past grace affects 0 rows — 8056c74
- [x] 1.6 Changing `join_mode` after inserting a non-organizer participant row is rejected with `join_mode_locked` — 8056c74
- [x] 1.7 Setting `max_participants` below confirmed count (organizer seat counts) is rejected with `capacity_below_confirmed` — 8056c74
- [x] 1.8 Changing `join_mode` while only the organizer seat exists still succeeds — 8056c74
- [x] 1.9 Updating `archived_at` or `organizer_id` as authenticated is rejected (grant and/or WITH CHECK) — 8056c74

### Phase 2: `updateRun` service and POST `/api/runs/[id]`

#### Automated

- [x] 2.1 `npx astro sync` succeeds
- [x] 2.2 `npm run lint` passes

#### Manual

- [x] 2.3 Authenticated organizer POST of valid fields redirects to `/runs/{id}` and the row changed
- [x] 2.4 POST with `max_participants` below confirmed count returns the capacity `RunError` copy in `?error=`, not PostgREST text
- [x] 2.5 POST as a different signed-in user does not change the row and does not reveal that the run exists beyond the same not-found copy
- [x] 2.6 POST with a `starts_at` that would leave the active window is rejected with explicit copy before/instead of a silent no-op
- [x] 2.7 POST that includes a new `join_mode` after a non-organizer row leaves `join_mode` unchanged (service ignore; trigger if a bug sends it)

### Phase 3: Edit page, form, middleware, and entry links

#### Automated

- [ ] 3.1 `npx astro sync` succeeds
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `npm run build` succeeds

#### Manual

- [ ] 3.4 Organizer sees Edit on dashboard active cards and on run detail; archived/past cards have no Edit
- [ ] 3.5 Guest hitting `/runs/{id}/edit` is redirected to sign-in
- [ ] 3.6 Signed-in non-owner and archived owner see the same 404 shell as a missing run (not a form)
- [ ] 3.7 Saving title, map (including unset), min points, start (still active), and capacity (≥ confirmed) updates `/runs` and `/runs/{id}`
- [ ] 3.8 After a second account applies, join mode is a disabled select with helper; save does not change `join_mode`
- [ ] 3.9 During in-progress grace, a start time that stays inside the 1h window saves; a start that would archive is rejected
- [ ] 3.10 Banned organizer sees the banned banner; POST is blocked by middleware
