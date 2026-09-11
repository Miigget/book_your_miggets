# Owner deletes a run (S-30) Implementation Plan

## Overview

Let the run organizer (`runs.organizer_id`) hard-delete an **audience-active** run they own via `POST /api/runs/{id}/delete`. Reuse admin’s cookie-client `.from("runs").delete()` + FK cascade. Do not archive. Admin delete stays on `/api/admin/runs/{id}/delete`.

## Current State Analysis

Admin delete already ships: `deleteRunAsAdmin` (`src/lib/services/admin.ts`) issues `.from("runs").delete().eq("id").select("id")`; `POST /api/admin/runs/[id]/delete.ts` redirects to `/runs?notice=Run deleted`. The only DELETE policy is `runs_delete_admin` (`is_admin()`). `GRANT DELETE` on `runs` to `authenticated` already exists. Child rows (`run_participants`, `run_comments`, `run_maps`, `run_invites`, `run_map_polls`) cascade.

Organizer lifecycle chrome (`OrganizerRunLifecycleControls`) already mounts on run detail when `isOrganizer && !isArchived` (`src/pages/runs/[id].astro`). `isArchived` is `lifecyclePhase === "archived"` → `!isRunActive` (stamped archive **or** elapsed extend). Archive / Complete / Extend live there; there is no owner Delete. After Complete, join/leave/decide/kick/withdraw/edit/extend freeze; delete is **not** in that list.

Participant archive history (S-07) is the run + participant rows. Hard-delete removes them together (same as admin). Restricting owner delete to audience-active leaves archived Recent cards intact.

## Desired End State

The organizer of an upcoming, in-progress, or completed (not archived) run sees a destructive **Delete run** control next to Archive/Complete, confirms, and lands on `/runs` with `Run deleted`. The run and cascaded rows are gone. Archived runs keep history; the owner has no Delete there (admin still can). Non-owners cannot delete. Officers / clan owners are not a delete role.

### Key Discoveries:

- RLS cannot allow organizer DELETE today — only `runs_delete_admin`. A new `runs_delete_organizer` policy is required; no RPC.
- Audience-active SQL helper is `is_run_active_row(archived_at, extended_until)` (`20260831131219`). Do **not** use `is_run_roster_open_row` — that folds `completed_at` and would freeze delete after Complete.
- Child FKs already `ON DELETE CASCADE`. No new GRANT.
- Dashboard has no `?notice=` Banner; `/runs` does. Success redirect stays `/runs?notice=Run deleted`.
- Comment-screenshot Storage objects are **not** cascaded today on admin delete. Same gap for owner delete.

## What We're NOT Doing

- Changing admin delete route, `AdminRunControls`, or `deleteRunAsAdmin`.
- Officer delete, clan-owner delete, or Dashboard card delete.
- Owner delete of archived / elapsed-extend runs (admin still may).
- Soft-delete, archive-on-delete, or a new SECURITY DEFINER RPC.
- Screenshot Storage cleanup (same residual as admin).
- Vitest / Jest (repo has none).

## Implementation Approach

One vertical slice: add organizer DELETE RLS (`is_run_organizer` identity + `is_not_banned()` + `is_run_active_row`), a `deleteRunAsOrganizer` service that performs the same PostgREST delete as admin after an audience-active/owner check, a form-POST route mirroring `archive.ts` with admin’s success URL, and a Delete button on `OrganizerRunLifecycleControls`. Document the new mutation in `AGENTS.md`.

## Critical Implementation Details

**Complete vs audience-active.** Policy `USING` must call `is_run_active_row(archived_at, extended_until)` with **column args** (do not `SELECT` `runs` from the policy). Do not call `is_run_roster_open_row` — completed clan runs must remain deletable by the organizer.

**Friendly errors.** Non-owner and missing run → the same “Run not found or no longer active” shape as other organizer mutations (do not advertise). Owned but not audience-active → “This run is already archived.” Zero-row DELETE after RLS → generic “Could not delete this run” (log PostgREST server-side; `lessons.md`).

---

## Phase 1: Organizer hard-delete

### Overview

Policy + service + `POST /api/runs/{id}/delete` + detail-page Delete control, with `AGENTS.md` updated so later slices do not fold delete into the Complete freeze.

### Changes Required:

#### 1. Organizer DELETE policy

**File**: `supabase/migrations/YYYYMMDDHHmmss_runs_delete_organizer.sql` (new)

**Intent**: Let `authenticated` delete a row they organize while it is audience-active and they are not banned. Leave `runs_delete_admin` unchanged.

**Contract**: New policy `runs_delete_organizer` `FOR DELETE` `TO authenticated` `USING` (`organizer_id = (select auth.uid())` AND `is_not_banned()` AND `is_run_active_row(archived_at, extended_until)`). No new GRANT. No RPC. Do not drop or alter `runs_delete_admin`.

#### 2. Organizer delete service

**File**: `src/lib/services/runs.ts`

**Intent**: App-layer owner + audience-active check, then the same `.from("runs").delete().eq("id").select("id")` as `deleteRunAsAdmin`. Throw `RunError` with intentional messages.

**Contract**: `deleteRunAsOrganizer(supabase, runId, userId)`. Load the run; missing or `organizer_id !== userId` → `RunError("Run not found or no longer active")`; `!isRunActive(...)` → `RunError("This run is already archived.")`; then DELETE; DB error or zero rows → `RunError("Could not delete this run")` (raw error logged). Do not import `AdminError` / `deleteRunAsAdmin`.

#### 3. Organizer delete route

**File**: `src/pages/api/runs/[id]/delete.ts` (new)

**Intent**: Organizer mutation endpoint, not under `/api/admin/`.

**Contract**: Uppercase `POST`. Copy guards from `src/pages/api/runs/[id]/archive.ts` (`isUuid`, cookie client, `commentUnauthorized`, `runFail` / `wantsJson`). Call `deleteRunAsOrganizer` with `locals.user.id`. Success → `/runs?notice=Run deleted` (same string as admin; JSON `{ ok, redirect }` when `wantsJson`). `RunError` → fail on `/runs/{id}`. Do not add this path to `PROTECTED_ROUTES`.

#### 4. Delete control on organizer chrome

**File**: `src/components/runs/OrganizerRunLifecycleControls.tsx`

**Intent**: One destructive control next to Archive/Complete. Parent already hides the island when archived.

**Contract**: Native form `POST` to `/api/runs/{id}/delete`. `window.confirm` copy matches admin: `Delete this run permanently? Confirmed participants will be removed.` Use shadcn `Button` `variant="destructive"` + `Trash2`. Reuse existing `postLifecycle` / `fetchFormJson`. Do not mount a second island. Do not add Delete on Dashboard cards or archived detail (`[id].astro` stays `isOrganizer && !isArchived`).

#### 5. Hard-rules note

**File**: `AGENTS.md`

**Intent**: Record organizer delete so Complete-freeze and archive-vs-delete stay accurate.

**Contract**: Organizer delete is `POST /api/runs/{id}/delete` (`runs.organizer_id` only; audience-active only). Admin delete stays `POST /api/admin/runs/{id}/delete`. After Complete, freeze remains join/leave/decide/kick/withdraw/edit/extend — **delete is allowed**. Delete ≠ archive. Do not invent officer delete.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`
- Migration applies: `npx supabase db query` (or local SQL) as impersonated organizer deletes an audience-active own run (participants cascade); organizer DELETE of archived own run affects 0 rows; member DELETE of another’s run affects 0 rows; admin DELETE of archived run still succeeds

#### Manual Verification:

- Organizer on an upcoming run: Delete + confirm → `/runs` with “Run deleted”; run gone from list/dashboard; participant rows gone
- Completed (not archived) clan run: Delete still available and succeeds
- Archived run (organizer can open it): no Delete control; POST is rejected with the archived message
- Non-owner (including clan officer who is not `organizer_id`) has no control; POST does not delete
- Admin Delete on archived still works; owner and admin both seeing detail still keep the Admin section as-is
- After owner-delete of an active run, that run is absent from player Recent (not a dead link); an archived run the owner did **not** delete still appears on Recent

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None — repo has no test runner (per AGENTS.md).

### Integration Tests:

- None automated; CI gate is `astro sync` + `npm run lint` + `npm run build`. SQL smoke in Phase 1 automated list.

### Manual Testing Steps:

1. `npx supabase start` + `npm run dev`; two users; A organizes a public run with B confirmed.
2. As A: open `/runs/{id}`, Delete, cancel confirm → run remains; confirm → `/runs?notice=Run deleted`; B’s Recent does not show that run.
3. As A: complete a clan-only run (do not archive) → Delete still works.
4. As A: archive a second run → Past/detail has no Delete; curling POST (with Origin) returns the archived message; Recent still lists it.
5. As B: no Delete on A’s run; POST does not remove it.
6. As admin: Delete still removes an archived run.

## Performance Considerations

Single-row DELETE; cascade is existing FKs. No list-query change.

## Migration Notes

Additive policy only. Rollback = drop `runs_delete_organizer` and revert the app files. No backfill. No new secrets.

## References

- Admin delete: `src/lib/services/admin.ts` (`deleteRunAsAdmin`), `src/pages/api/admin/runs/[id]/delete.ts`, `src/components/runs/AdminRunControls.tsx`
- Organizer POST pattern: `src/pages/api/runs/[id]/archive.ts`
- Audience-active: `src/lib/run-lifecycle.ts` (`isRunActive`), `public.is_run_active_row`
- Archived admin-moderation plan: `context/archive/2026-08-07-admin-moderation-tools/plan.md`
- PRD: `context/foundation/prd-v2.md` FR-012, US-01
- Roadmap S-30: `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Organizer hard-delete

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — cc2a768
- [x] 1.2 Production build passes: `npm run build` — cc2a768
- [x] 1.3 Migration applies: impersonated organizer deletes an audience-active own run (participants cascade); organizer DELETE of archived own run affects 0 rows; member DELETE of another’s run affects 0 rows; admin DELETE of archived run still succeeds — cc2a768

#### Manual

- [ ] 1.4 Organizer on an upcoming run: Delete + confirm → `/runs` with “Run deleted”; run gone from list/dashboard; participant rows gone
- [ ] 1.5 Completed (not archived) clan run: Delete still available and succeeds
- [ ] 1.6 Archived run (organizer can open it): no Delete control; POST is rejected with the archived message
- [ ] 1.7 Non-owner (including clan officer who is not `organizer_id`) has no control; POST does not delete
- [ ] 1.8 Admin Delete on archived still works; owner and admin both seeing detail still keep the Admin section as-is
- [ ] 1.9 After owner-delete of an active run, that run is absent from player Recent (not a dead link); an archived run the owner did not delete still appears on Recent
