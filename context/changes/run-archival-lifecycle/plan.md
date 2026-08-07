# Run archival lifecycle Implementation Plan

## Overview

Implement FR-013 / S-04: derive run lifecycle from `starts_at` at read time — mark runs in-progress during a 1-hour grace after scheduled start, then exclude them from the guest/member active list (retain rows; do not delete or stamp `archived_at` in this slice).

## Current State Analysis

Lifecycle is stubbed. “Active” means only `archived_at IS NULL` in RLS (`runs_select_active_anon` / `runs_select_active_authenticated`), `listActiveRuns` / `getActiveRunById`, and `loadActiveRunForMutation`. Create always writes `archived_at: null`. There is no grace constant, phase DTO, time filter, or in-progress UI. Past-start runs remain on `/runs` forever. Guest detail already 404s when `archived_at` is set; organizer/admin SELECT policies still see those rows.

Research (`research.md`) and prior archives locked: retain not delete; guest archived → 404 until S-07; mutations reject non-active; cron vs derived left to this plan. Infra prefers derived-at-read for MVP (`infrastructure.md`).

## Desired End State

A guest browsing `/runs` sees only runs still inside the active window (`archived_at IS NULL` and `now < starts_at + 1h`). During grace (`starts_at ≤ now < starts_at + 1h`) list and detail show an in-progress / already-started label. After grace, list omits the run and direct detail URL 404s for guests/non-privileged paths. Apply/approve/leave/withdraw still work during grace; they fail as “not active” after grace. S-07/S-09 inherit a documented time-based archived predicate without requiring a stamped column yet.

### Key Discoveries:

- Service choke point: `src/lib/services/runs.ts:151-187` and `participants.ts` `loadActiveRunForMutation` — change filters here before pages diverge
- Organizer/admin SELECT policies still return past-grace rows — app-layer time gates remain mandatory even after RLS time predicates on the default active policies
- No shared date util; `formatStart` is duplicated on list + detail — centralize with grace helpers
- Cloudflare cron would need a custom Worker entry (`wrangler.jsonc` stock Astro `main`) — avoided for MVP

## What We're NOT Doing

- Writing `archived_at` (cron, pg_cron, or lazy write-on-read)
- Custom Cloudflare Worker `scheduled` handler / `triggers.crons`
- Guest or confirmed-participant archive history UI (S-07)
- Admin player-archive profile view (S-09)
- Soft-disabling apply/approve during grace
- Adding a DB `status` / lifecycle enum column
- Dashboard / profile run history (S-08+)
- Deleting or retention-tiering archived runs

## Implementation Approach

**Derived-at-read (option A)** with matching app + RLS filters.

1. Introduce shared lifecycle helpers (`GRACE_MS = 3_600_000`, phase derivation, active-window predicate, archive-deadline instant) used by services and UI.
2. Narrow “active” queries and mutation gate: `archived_at IS NULL` **and** `starts_at > now - 1h` (equivalent: still inside grace-or-upcoming window). Gate apply / leave / decide / withdraw through the same active-window check. Attach `lifecyclePhase: "upcoming" | "in_progress"` on active DTOs.
3. Migrate default guest/auth SELECT policies to the same time window so PostgREST bypass cannot list past-grace rows. Leave organizer/admin SELECT unchanged.
4. Surface in-progress on list + detail (colored span pattern from `RunParticipantActions`, no new shadcn Badge required) and fix the list subtitle’s “upcoming-only” wording.
5. Document S-07 handoff: archived ⇔ `archived_at IS NOT NULL OR starts_at + 1 hour ≤ now()`; do not open guest SELECT of archived rows.

## Critical Implementation Details

**Organizer/admin RLS bypass:** After updating only `runs_select_active_*`, organizers and admins can still SELECT past-grace rows via their policies. `listActiveRuns`, `getActiveRunById`, and `loadActiveRunForMutation` must enforce the time window in the query (or after fetch) so organizers do not keep mutating or viewing past-grace runs through the active UX.

**Clock source:** Grace math uses UTC instants from `starts_at` (timestamptz). Prefer a single `now` passed into helpers (or `Date.now()` once per request) so list mapping and filters agree. Postgres `now()` in RLS and Worker `Date` can differ by seconds — acceptable for MVP; do not add clock-skew compensation.

**Mutation SELECT shape:** `loadActiveRunForMutation` today selects only `id, join_mode, organizer_id`. Extend the filter (and select `starts_at` only if a post-fetch check is used) so past-grace fails with the existing “Run not found or no longer active” message.

## Phase 1: Lifecycle helpers and active-service contract

### Overview

Define the grace/phase contract in code and make list, detail, and participant mutations honor the active window.

### Changes Required:

#### 1. Shared run-lifecycle helpers

**File**: `src/lib/run-lifecycle.ts` (new)

**Intent**: Single source for the 1-hour grace constant, phase derivation, and “still active” / archive-deadline helpers so services and pages cannot drift.

**Contract**: Export `RUN_GRACE_MS` (1 hour), `RunLifecyclePhase` (`"upcoming" | "in_progress" | "archived"`), `getRunLifecyclePhase(startsAt, now?)`, `isRunActive(startsAt, archivedAt, now?)`, and `activeWindowStartsAfter(now?)` (ISO lower bound for `starts_at` queries: `now - GRACE_MS`). Treat non-null `archivedAt` as archived even if still inside the time window.

#### 2. Active run DTOs and queries

**File**: `src/lib/services/runs.ts`

**Intent**: Active list/detail only return runs inside the FR-013 window and expose phase for UI badges.

**Contract**: Extend `RunListItem` / `RunDetail` with `lifecyclePhase: "upcoming" | "in_progress"` (active helpers never return `"archived"`). `listActiveRuns` and `getActiveRunById` keep `.is("archived_at", null)` and add a `starts_at` lower-bound filter using `activeWindowStartsAfter()`. Map phase via `getRunLifecyclePhase` in `mapRunRow` (or equivalent). Do not add `archived_at` to `RUN_SELECT` unless needed for the archived-column short-circuit in helpers.

#### 3. Mutation gate

**File**: `src/lib/services/participants.ts`

**Intent**: Apply / leave / decide / withdraw fail after grace the same way they fail when `archived_at` is set.

**Contract**: `loadActiveRunForMutation` enforces the same active window as `getActiveRunById` (query filter and/or `starts_at` check). Call it from `applyToRun`, `leaveTeamAsOrganizer`, `decideParticipant`, and `withdrawApplication` (today withdraw skips the gate — fix that). Past-grace → existing `ParticipantError("Run not found or no longer active")`. Grace period remains fully mutable.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `src/lib/run-lifecycle.ts` exists and is imported by `runs.ts` and `participants.ts`
- `listActiveRuns` / `getActiveRunById` / `loadActiveRunForMutation` filter by active window (grep/`starts_at` bound or equivalent)

#### Manual Verification:

- With a run whose `starts_at` is ~30 minutes ago and `archived_at` null: appears in list via service, detail loads, apply/withdraw still work (if otherwise eligible)
- With a run whose `starts_at` is >1 hour ago and `archived_at` null: omitted from list, detail returns null, mutation gate rejects (including withdraw)
- Create-run path unchanged (future `starts_at`, `archived_at: null`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: RLS active-window policies

### Overview

Align default guest/authenticated SELECT policies with the app’s active window so API bypass cannot read past-grace rows while `archived_at` is still null.

### Changes Required:

#### 1. Migration replacing active SELECT predicates

**File**: `supabase/migrations/YYYYMMDDHHmmss_run_active_window_select.sql` (new; timestamp at implement time)

**Intent**: Encode FR-013 active window in RLS for anon and authenticated default SELECT, without changing organizer/admin visibility.

**Contract**: Drop and recreate (or `alter policy` if preferred and supported) `runs_select_active_anon` and `runs_select_active_authenticated` so `using` is equivalent to:

`archived_at is null and starts_at > (now() - interval '1 hour')`

Leave `runs_select_own_organizer` and `runs_select_admin` unchanged. No `service_role` usage. Do not stamp `archived_at`.

#### 2. Local verify note

**File**: (none — implementer procedure)

**Intent**: Prove migration applies on local Supabase before relying on tag deploy `db push`.

**Contract**: After apply, anon/authenticated cannot SELECT a past-grace row with null `archived_at`; organizer can still SELECT own past-grace row via organizer policy.

### Success Criteria:

#### Automated Verification:

- Migration file present under `supabase/migrations/` with the active-window predicates
- `npm run lint` and `npm run build` still pass (no app regression)

#### Manual Verification:

- `npx supabase db reset` or migrate applies cleanly locally
- As anon: past-grace run not returned by PostgREST select on `runs`
- As organizer JWT: own past-grace run still selectable; app active helpers still hide it (Phase 1)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: In-progress UX, copy, and handoff docs

### Overview

Show lifecycle on list/detail, fix misleading “upcoming” copy, share date formatting, and lock the derived-archive decision in foundation docs for later slices.

### Changes Required:

#### 1. List and detail UI

**Files**: `src/pages/runs/index.astro`, `src/pages/runs/[id].astro`

**Intent**: Guests see in-progress / already-started during grace; list copy reflects active (upcoming + in-progress), not upcoming-only.

**Contract**: Render a visible lifecycle label when `lifecyclePhase === "in_progress"` (reuse colored-span pattern from `RunParticipantActions`; no requirement to add shadcn `Badge`). Update the list subtitle that says “Browse upcoming …” (empty state already says “No active runs yet” — leave unless it drifts). Prefer shared `formatStart` (extract to `src/lib/format-date.ts` or export from `run-lifecycle` adjacent util) instead of duplicated locals. Detail 404 copy for post-grace remains acceptable (“missing or no longer active”).

#### 2. Foundation doc lock-in

**Files**: `context/foundation/tech-stack.md`, `context/foundation/bootstrap-verification.md` (FR-013 sentences only)

**Intent**: Stop leaving cron-vs-derived open now that S-04 chose derived-at-read; satisfy lessons.md “update stale docs when detected.”

**Contract**: Replace the open “cron or derived” wording for FR-013 with: MVP uses derived status at read time (+ RLS active window); Cron Trigger only if later required. Do not rewrite unrelated deploy/Pages claims beyond the FR-013 clause unless the same sentence forces a fix.

#### 3. S-07 / S-09 handoff in change notes

**File**: `context/changes/run-archival-lifecycle/change.md` (`## Notes`)

**Intent**: Leave a stable archived predicate for participant/admin archive slices.

**Contract**: Document: archived ⇔ `archived_at IS NOT NULL OR starts_at + interval '1 hour' <= now()`; guest active list stays time-window only; confirmed-participant SELECT on archived rows still deferred to S-07.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- List/detail reference `lifecyclePhase` (or equivalent) for in-progress labeling

#### Manual Verification:

- In-progress run shows badge/label on `/runs` and `/runs/[id]`
- Upcoming run has no in-progress label
- Past-grace direct URL still 404 for guest
- `tech-stack.md` / `bootstrap-verification.md` FR-013 lines no longer imply undecided cron-vs-derived for MVP

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- No test runner in `package.json` — do not add Vitest/Jest in this change
- Prefer a tiny pure-function check only if the implementer can run it ad hoc; not required for phase gates

### Integration Tests:

- None automated; rely on local Supabase + `npm run build` and manual PostgREST/RLS checks in Phase 2

### Manual Testing Steps:

1. Create a run with `starts_at` a few minutes in the future → appears as upcoming, no in-progress label; apply works
2. Temporarily set `starts_at` to 30 minutes ago (SQL) → list shows in-progress; detail shows label; apply/approve still work
3. Set `starts_at` to 2 hours ago → gone from `/runs`; guest detail 404; apply/withdraw return not-active
4. Confirm organizer can still SELECT own past-grace row in SQL/PostgREST but not via active UI helpers
5. Smoke: create flow still rejects past `starts_at` on POST

## Performance Considerations

Active list remains a single ordered query with an extra `starts_at` bound; existing `(archived_at, starts_at)` index continues to support the filter. No cron CPU. Phase derivation is O(n) in-memory over the already-fetched active set (expected small for MVP).

## Migration Notes

- One RLS migration only; no data backfill; `archived_at` stays null for existing rows
- Production ships migration on next `v*` tag deploy (`db push`), same as other schema changes
- Rollback: revert policy predicates to `archived_at is null` only (app time filters would still hide past-grace if left in place)

## References

- Related research: `context/changes/run-archival-lifecycle/research.md`
- PRD FR-013: `context/foundation/prd.md`
- Roadmap S-04: `context/foundation/roadmap.md`
- Schema/RLS stub: `supabase/migrations/20260729134008_run_domain_schema.sql`
- Active services: `src/lib/services/runs.ts`, `src/lib/services/participants.ts`
- Infra preference: `context/foundation/infrastructure.md` (derived for MVP)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Lifecycle helpers and active-service contract

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npm run build` passes
- [x] 1.3 `src/lib/run-lifecycle.ts` exists and is imported by `runs.ts` and `participants.ts`
- [x] 1.4 `listActiveRuns` / `getActiveRunById` / `loadActiveRunForMutation` filter by active window

#### Manual

- [x] 1.5 Grace-window run (~30m past start) lists, details, and accepts eligible mutations
- [x] 1.6 Past-grace run (>1h) omitted from list, detail null, mutation rejected
- [x] 1.7 Create-run path unchanged (future `starts_at`, `archived_at: null`)

### Phase 2: RLS active-window policies

#### Automated

- [x] 2.1 Migration file present under `supabase/migrations/` with active-window predicates
- [x] 2.2 `npm run lint` and `npm run build` still pass

#### Manual

- [x] 2.3 Migration applies cleanly on local Supabase
- [x] 2.4 Anon cannot SELECT past-grace null-`archived_at` rows
- [x] 2.5 Organizer can SELECT own past-grace row; app active helpers still hide it

### Phase 3: In-progress UX, copy, and handoff docs

#### Automated

- [x] 3.1 `npm run lint` passes
- [x] 3.2 `npm run build` passes
- [x] 3.3 List/detail reference `lifecyclePhase` for in-progress labeling

#### Manual

- [x] 3.4 In-progress label visible on `/runs` and `/runs/[id]` during grace
- [x] 3.5 Upcoming run has no in-progress label
- [x] 3.6 Past-grace guest detail URL still 404
- [x] 3.7 Foundation FR-013 docs lock derived-at-read for MVP
