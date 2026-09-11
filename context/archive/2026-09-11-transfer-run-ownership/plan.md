# Pass run ownership (S-29) Implementation Plan

## Overview

Let the run organizer (`runs.organizer_id`) pass ownership of an **audience-active** public / friends_only / invite_only run to another **confirmed** participant via `POST /api/runs/{id}/transfer`. The writer is a small DEFINER RPC (same family as `archive_run` / `complete_clan_run`). Do not GRANT UPDATE on `organizer_id`. Clan-only is out this slice.

## Current State Analysis

Organizer lifecycle chrome (`OrganizerRunLifecycleControls`) already mounts on run detail when `isOrganizer && !isArchived`. Archive / Complete / Extend / Delete live there. There is no Transfer.

Authenticated GRANT UPDATE on `runs` is the edit column list only — **not** `organizer_id`. `runs_update_own` WITH CHECK requires `organizer_id = auth.uid()` (cannot swap) and `is_run_roster_open_row` (would freeze a PostgREST transfer after Complete). The 5-cap trigger `runs_enforce_organizer_active_run_cap` is **BEFORE INSERT** only.

Confirmed roster is already loaded on `/runs/{id}` (`listConfirmedParticipants`). Pending applicants are a separate list. Restricted runs 404 for outsiders.

Clan-only Edit/Complete/verify still require `organizer_id` to be the current clan owner. Transferring a clan_only run to a member would break “inherits edit.”

## Desired End State

On an upcoming, in-progress, or completed (not archived) **non-clan** run, the organizer picks another confirmed participant, confirms, and `organizer_id` updates. The new owner sees Edit / Archive / Delete (and Complete only if they are also the clan owner — N/A here). The old owner stays on the roster if they had a confirmed seat. Clan-only has no Transfer control. A target already at 5 audience-active runs is refused.

### Key Discoveries:

- DEFINER RPC is required — `runs_update_own` cannot swap `organizer_id`, and `is_run_roster_open_row` would block transfer after Complete (`supabase/migrations/20260901083008_complete_clan_run.sql`).
- Cap trigger does not fire on UPDATE (`supabase/migrations/20260831131219_manual_archive_and_extend.sql`). RPC must lock namespace **8724** on the **new** organizer id and count their other audience-active rows.
- Delete chrome: `OrganizerRunLifecycleControls` + `POST /api/runs/{id}/delete`. Reuse that island and `archive.ts` POST guards.
- Run detail has no `?notice=` Banner (only `?error=` for organizer/admin). Success stays on `/runs/{id}`; “Organized by” + chrome disappearing is the proof.
- `is_not_banned()` is `auth.uid()`-only. Target ban/verified checks read `profiles` / `public_profiles` inside the RPC.

## What We're NOT Doing

- Transfer of `clan_only` runs (hide control; RPC fail closed).
- GRANT UPDATE on `organizer_id` / `completed_at` / `archived_at` / `extended_until` / `verified_at` / `clans.points`.
- Changing `runs_update_own`, the INSERT 5-cap trigger, participant rows, or Complete/verify RPCs.
- Officer / clan-owner / admin transfer. Dashboard cards. In-app notification. A second island.
- Vitest / Jest (repo has none).

## Implementation Approach

One vertical slice: DEFINER `transfer_run_ownership` → service + form-POST route mirroring `archive.ts` → Transfer picker on `OrganizerRunLifecycleControls` → `AGENTS.md`.

## Critical Implementation Details

**Do not use `is_run_roster_open_row`.** Transfer stays allowed after Complete (same window as owner-delete): `is_run_active_row(archived_at, extended_until)` only.

**Cap message is about the target**, not the caller. Do not reuse `ACTIVE_RUN_CAP_MESSAGE` (“You already have 5…”). Use a string such as “That player already has 5 active runs. They must archive one before they can take this run.”

**Restricted inherit-edit.** `runs_update_own` WITH CHECK requires `public_profiles.is_verified` when `visibility <> public`. RPC refuses an unverified target on friends_only / invite_only so the new owner can actually Edit.

---

## Phase 1: Organizer transfer

### Overview

RPC + service + `POST /api/runs/{id}/transfer` + detail-page Transfer control, with `AGENTS.md` so Complete-freeze and clan_only stay accurate.

### Changes Required:

#### 1. Transfer RPC

**File**: `supabase/migrations/YYYYMMDDHHmmss_transfer_run_ownership.sql` (new)

**Intent**: Organizer-only swap of `organizer_id` to a confirmed participant on an audience-active non-clan run, without widening column GRANT.

**Contract**: `transfer_run_ownership(p_run_id uuid, p_new_organizer_id uuid) returns text`. `SECURITY DEFINER`, `search_path = ''`. `REVOKE ALL` from `public, anon`; `GRANT EXECUTE` to `authenticated`. Do **not** rewrite GRANT UPDATE on `runs`. Copy the leak-safe load from `complete_clan_run` (missing / non-organizer → `not_found`; no admin bypass). Caller banned → `banned`. Not `is_run_active_row` → `not_active`. `visibility = clan_only` → `clan_only`. Target must be a **confirmed** `run_participants` row on this run, not equal to current `organizer_id`; pending/denied/missing → `not_confirmed`. Target `profiles.is_banned` → `target_banned`. If `visibility <> public` and target `public_profiles.is_verified` is not true → `not_verified`. Then `pg_advisory_xact_lock(8724, hashtext(p_new_organizer_id::text))`; if the target already has ≥ 5 audience-active runs (`is_run_active_row`, this row still owned by the caller so it is not in that count) → `active_run_cap`. Else `UPDATE runs SET organizer_id = p_new_organizer_id WHERE id = p_run_id` and return `transferred`. Do not touch `run_participants`. Do not stamp lifecycle columns.

#### 2. Types

**File**: `src/types/database.ts`

**Intent**: Typed `supabase.rpc("transfer_run_ownership", …)`.

**Contract**: Add `Functions.transfer_run_ownership` with `Args: { p_run_id: string; p_new_organizer_id: string }` and `Returns: string`.

#### 3. Transfer service

**File**: `src/lib/services/runs.ts`

**Intent**: Map RPC outcomes to intentional `RunError` strings (log raw PostgREST; `lessons.md`).

**Contract**: `transferRunOwnership(supabase, runId, newOrganizerId)`. Invalid uuid for either id → `RunError("Pick a confirmed participant on this run.")`. Switch: `transferred` ok; `not_found` / `not_authenticated` → “Run not found or no longer active”; `banned` → `BANNED_RUN_MUTATION_MESSAGE`; `not_active` → “This run is already archived.”; `clan_only` → “Clan-only runs cannot change owner.”; `not_confirmed` → “Pick a confirmed participant on this run.”; `target_banned` → “That player cannot take this run.”; `not_verified` → “That player must be verified to organize a restricted run.”; `active_run_cap` → the target-cap sentence above; default → “Could not transfer this run” (log outcome).

#### 4. Organizer transfer route

**File**: `src/pages/api/runs/[id]/transfer.ts` (new)

**Intent**: Organizer mutation, not under `/api/admin/`.

**Contract**: Uppercase `POST`. Copy guards from `src/pages/api/runs/[id]/archive.ts` (`isUuid`, cookie client, `commentUnauthorized`, `runFail` / `wantsJson`). Read `new_organizer_id` from form data (same `formString` trim as `decide.ts`). Call `transferRunOwnership`. Success → `/runs/{id}` (JSON `{ ok, redirect }`). `RunError` → fail on `/runs/{id}`. Do not add this path to `PROTECTED_ROUTES`.

#### 5. Transfer control on organizer chrome

**Files**: `src/components/runs/OrganizerRunLifecycleControls.tsx`, `src/pages/runs/[id].astro`

**Intent**: One picker next to Archive/Delete. Parent already hides the island when archived.

**Contract**: Pass candidates `{ userId, nickname }[]` = confirmed whose `userId !== organizerId`. Show Transfer only when `run.visibility !== "clan_only"` and candidates.length > 0. Native `<select name="new_organizer_id">` + submit. `window.confirm` that they will lose organizer tools. POST `/api/runs/{id}/transfer`. Reuse `postLifecycle` / `fetchFormJson`. shadcn `Button` (not destructive). Do not mount a second island. Do not add Transfer on Dashboard cards or clan_only.

#### 6. Hard-rules note

**File**: `AGENTS.md`

**Intent**: Record transfer so Complete-freeze, 5-cap, and clan_only stay accurate.

**Contract**: Organizer transfer is `POST /api/runs/{id}/transfer` (`runs.organizer_id` only; audience-active only; target confirmed participant, not pending, not self). DEFINER RPC; do not GRANT UPDATE on `organizer_id`. Clan-only cannot transfer. Recipient 5-cap applies (same ceiling as create). After Complete, freeze remains join/leave/decide/kick/withdraw/edit/extend — **delete and transfer are allowed**. Do not invent officer transfer.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`
- Migration applies: impersonated organizer transfers an audience-active public run to a confirmed other player (`organizer_id` updates; participant rows unchanged); pending target / self / clan_only / archived own run / non-owner / target at 5 actives all fail closed; authenticated `UPDATE runs SET organizer_id = …` still fails (GRANT); Complete freeze still blocks roster/edit, not this RPC

#### Manual Verification:

- Organizer on a public run with B confirmed: Transfer + confirm → still on `/runs/{id}`; “Organized by” is B; A’s chrome gone; B sees Archive/Edit/Delete
- Pending applicant is not in the select; posting their id fails
- Clan-only: no Transfer control; POST fails with the clan-only message
- Completed (not archived) non-clan run: Transfer still works
- Archived: no control; POST archived message
- Target already at 5 audience-active: refused with the target-cap sentence
- Non-owner (including clan officer who is not `organizer_id`) has no control; POST does not swap

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None — repo has no test runner (per AGENTS.md).

### Integration Tests:

- None automated; CI gate is `astro sync` + `npm run lint` + `npm run build`. SQL smoke in Phase 1 automated list.

### Manual Testing Steps:

1. `npx supabase start` + `npm run dev`; users A (organizer) and B (confirmed) on a public run.
2. As A: open `/runs/{id}`, Transfer to B, cancel confirm → still A; confirm → organized by B; A has no chrome; B can Archive.
3. As A on a second run: pending C is not listed; curling POST with C’s id (with Origin) fails.
4. Clan-only run as clan owner: no Transfer; POST fails closed. Complete/verify path unchanged.
5. Completed non-clan (if available) or in-progress after start: Transfer still works. Archived: no control.
6. B already has 5 audience-active runs: Transfer to B is refused.

## Performance Considerations

Single-row UPDATE plus one advisory lock on the recipient. No list-query change.

## Migration Notes

Additive RPC only. Rollback = drop `transfer_run_ownership` and revert the app files. No backfill. No new secrets. Do not re-issue GRANT UPDATE.

## References

- Organizer POST pattern: `src/pages/api/runs/[id]/archive.ts`, `src/pages/api/runs/[id]/delete.ts`
- DEFINER writer: `complete_clan_run` in `supabase/migrations/20260901083008_complete_clan_run.sql`
- 5-cap lock: `enforce_organizer_active_run_cap` in `supabase/migrations/20260831131219_manual_archive_and_extend.sql`
- Chrome: `src/components/runs/OrganizerRunLifecycleControls.tsx`, `src/pages/runs/[id].astro`
- Owner-delete (just shipped): `context/archive/2026-09-11-owner-delete-run/plan.md`
- PRD: `context/foundation/prd-v2.md` FR-011, US-01
- Roadmap S-29: `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Organizer transfer

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 5474f3f
- [x] 1.2 Production build passes: `npm run build` — 5474f3f
- [x] 1.3 Migration applies: impersonated organizer transfers an audience-active public run to a confirmed other player (`organizer_id` updates; participant rows unchanged); pending target / self / clan_only / archived own run / non-owner / target at 5 actives all fail closed; authenticated `UPDATE runs SET organizer_id = …` still fails (GRANT); Complete freeze still blocks roster/edit, not this RPC — 5474f3f

#### Manual

- [ ] 1.4 Organizer on a public run with B confirmed: Transfer + confirm → still on `/runs/{id}`; “Organized by” is B; A’s chrome gone; B sees Archive/Edit/Delete
- [ ] 1.5 Pending applicant is not in the select; posting their id fails
- [ ] 1.6 Clan-only: no Transfer control; POST fails with the clan-only message
- [ ] 1.7 Completed (not archived) non-clan run: Transfer still works
- [ ] 1.8 Archived: no control; POST archived message
- [ ] 1.9 Target already at 5 audience-active: refused with the target-cap sentence
- [ ] 1.10 Non-owner (including clan officer who is not `organizer_id`) has no control; POST does not swap
