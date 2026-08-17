# Participant archive history Implementation Plan

## Overview

Ship S-07 / FR-015: a confirmed participant can browse archived runs they still have a confirmed `run_participants` row for, and reopen the same `/runs/{id}` URL as read-only (map, time, confirmed roster; no apply/approve/leave). Guests, pending/denied/withdrawn, and an organizer who left the team get the existing 404. Archival stays derived-at-read (S-04). Admin-any-player archive (FR-016 / S-09) and organizer “my created runs” (FR-005 / S-08) stay out.

## Current State Analysis

S-04 hid past-grace runs from the guest/member active list via app filters and `runs_select_active_*` (`archived_at is null and starts_at > now() - interval '1 hour'`). Organizer and admin SELECT policies still return those rows. There is **no** confirmed-participant `runs` SELECT — F-01 left FR-015 incomplete on purpose.

App services only load the active window: `listActiveRuns` / `getActiveRunById` (`src/lib/services/runs.ts`) and `loadActiveRunForMutation`. `mapRunRow` returns `null` when `getRunLifecyclePhase` is `"archived"`. `/runs/[id]` therefore 404s for everyone after grace, including teammates. `/dashboard` is an auth stub (S-08). Topbar has no history link. `run_participants_select_own` can read membership rows, but without a parent `runs` grant the history UI cannot load title/map/time.

`isRunActive` / `archiveDeadlineAt` already exist in `src/lib/run-lifecycle.ts` and are unused. Confirmed roster loaders in `src/lib/services/participants.ts` do not depend on run phase.

## Desired End State

A signed-in user with at least one confirmed participation on a past-grace (or stamped-`archived_at`) run opens `/runs/history` and sees those runs newest-`starts_at`-first. Clicking a card (or the original `/runs/{uuid}` link) shows the same detail facts as the active page, labeled archived, with mutations and the organizer pending/denied queue omitted. A user without a **current** confirmed row — including the organizer after leave-team — gets HTTP 404 and the same “missing or no longer active” copy as guests. PostgREST as anon/authenticated cannot SELECT someone else’s archived run.

### Key Discoveries:

- Active-window RLS: `supabase/migrations/20260807104348_run_active_window_select.sql` — guest/auth SELECT; organizer/admin unchanged in `20260729134008_run_domain_schema.sql`
- `mapRunRow` drops archived rows (`src/lib/services/runs.ts`) — active helpers must keep doing that; history/detail archived path must not reuse it blindly
- `runs_select_own_organizer` would leak S-08 if the history list were “every archived row RLS can see”
- `PROTECTED_ROUTES` uses `pathname.startsWith` (`src/middleware.ts`) — gate `/runs/history`, never `/runs`
- Static `src/pages/runs/history.astro` wins over `runs/[id].astro`; `history` is not a UUID
- No test runner (`AGENTS.md`) — verification is lint/build + S-04-style SQL/PostgREST + UI

## What We're NOT Doing

- FR-016 / S-09 admin view of any player’s archive from a profile
- FR-005 / S-08 my-runs dashboard (leave `/dashboard` as the stub)
- Stamping `archived_at`, cron, or a lifecycle enum
- Opening guest/anon SELECT of archived `runs`
- History search/filter (S-03 axes) or pagination
- Apply / withdraw / decide / leave on archived runs (mutations already fail the active gate)
- Pending/denied archive access; “was confirmed” audit after leave-team deletes the row
- Vitest/Jest; SECURITY DEFINER read RPCs; `service_role` on the Worker
- Admin-bypass detail for archived runs they did not play (S-06 delete remains on `/admin` / on detail only if this page loaded)

## Implementation Approach

RLS first, then services that **start from the viewer’s confirmed run ids**, then UI.

1. Add a permissive `runs` SELECT policy: confirmed row for `auth.uid()` **and** the S-04 archived predicate. Do not replace organizer/admin or active-window policies.
2. Add `listArchivedRunsForParticipant` / `getArchivedRunForParticipant` beside the active helpers. Filter in the service by confirmed ids + `!isRunActive` so organizer RLS cannot populate history. Extend mapping so archived rows get `lifecyclePhase: "archived"` instead of `null`.
3. Auth-gated `/runs/history`, Topbar “History”, signed-in “Your past runs” on `/runs`, and dual-mode `/runs/[id]` (active unchanged; archived read-only).

## Critical Implementation Details

**Confirmed ids, not “archived rows I can SELECT.”** `runs_select_own_organizer` (and admin SELECT) still return past-grace rows. A history query of `from("runs")` with only an archived time filter would list runs the organizer created after leave-team. Always: load `run_participants` where `user_id = viewer` and `status = 'confirmed'`, then load those run ids, then keep archived. Detail must 404 unless `getOwnParticipation` is `confirmed` **and** the run is archived — even if the fetch would succeed via organizer RLS.

**Do not reuse `mapRunRow` as-is for archive.** It returns `null` for phase `"archived"`. Active list/detail must keep that behavior. Archived loaders need a mapper (or a flag) that emits `lifecyclePhase: "archived"` and a DTO that is not `ActiveRunLifecyclePhase`.

**Middleware prefix.** Add `/runs/history` to `PROTECTED_ROUTES`. Do not prefix-gate `/runs` or the public list and `[id]` 404 path break.

**Invalid UUID → 404, not 500.** `getActiveRunById` has no `isUuid` guard today; PostgREST `22P02` throws and `[id].astro` maps that to HTTP 500. Dual-mode tries the active loader first, so the archive path never runs. Both `getActiveRunById` and `getArchivedRunForParticipant` must early-return `null` on non-UUID ids (same pattern as `loadActiveRunForMutation` / API helpers).

## Phase 1: Confirmed-participant SELECT on archived runs

### Overview

Encode FR-015 in RLS so a confirmed participant can read archived `runs` rows, and prove the matrix S-04 used for the active window: who can see a past-grace row, and who cannot.

### Changes Required:

#### 1. Archive SELECT policy

**File**: `supabase/migrations/YYYYMMDDHHmmss_runs_select_archived_confirmed_participant.sql` (timestamp at implement time)

**Intent**: Grant authenticated confirmed participants SELECT on archived runs only, without widening guest active list or inventing a DEFINER read RPC.

**Contract**: New policy on `public.runs` for `SELECT` to `authenticated`, name like `runs_select_archived_confirmed_participant`. `USING` must be equivalent to: exists a `run_participants` row with `run_id = runs.id`, `user_id = (select auth.uid())`, `status = 'confirmed'`, **and** the S-04 archived predicate `archived_at is not null or starts_at <= (now() - interval '1 hour')` (same meaning as `starts_at + interval '1 hour' <= now()`). Wrap `auth.uid()` in `(select …)` like existing policies. Do not drop or alter `runs_select_active_*`, `runs_select_own_organizer`, or `runs_select_admin`. No `anon` policy. No `WITH CHECK`. No `service_role`. No `archived_at` stamp.

```sql
-- Predicate shape (names/quoting may match file style):
using (
  exists (
    select 1
    from public.run_participants p
    where p.run_id = runs.id
      and p.user_id = (select auth.uid())
      and p.status = 'confirmed'::public.participant_status
  )
  and (
    archived_at is not null
    or starts_at <= (now() - interval '1 hour')
  )
)
```

#### 2. Types

**File**: `src/types/database.ts` only if the project’s usual gen step is required after this migration

**Intent**: RLS-only change should not require hand-edits.

**Contract**: Skip regen if generated types do not include policies (expected). Do not invent columns.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` with the confirmed+archived SELECT predicate
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Migration applies cleanly on local Supabase (`npx supabase db reset` or migrate-up per project habit)
- As anon: PostgREST/SQL cannot SELECT a past-grace run
- As authenticated with only `pending` or `denied` on that run: cannot SELECT the archived run
- As authenticated `confirmed` on that run: can SELECT the archived run
- As organizer who deleted their confirmed seat (leave-team): cannot SELECT via the **new** policy (organizer policy may still return the row — record that; app gate is Phase 2)
- As admin with no participation: admin policy may still return the row — record that; this slice does not add admin-bypass UX

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: History list and archived-detail service contract

### Overview

Give pages a choke point that returns only the viewer’s archived confirmed runs, and a detail loader that 404s unless that same rule holds. Active helpers stay active-window-only.

### Changes Required:

#### 1. Archived mapping and DTOs

**File**: `src/lib/services/runs.ts` (helpers may live next to `mapRunRow`; lifecycle stays in `src/lib/run-lifecycle.ts`)

**Intent**: Active mapping continues to drop archived rows; archive mapping exposes `lifecyclePhase: "archived"` using existing `isRunActive` / `getRunLifecyclePhase`.

**Contract**: Keep `RunListItem.lifecyclePhase` as `ActiveRunLifecyclePhase` for active list/detail. Add an archived list/detail type (or a union used only by the new loaders) with `lifecyclePhase: "archived"`. Reuse `RUN_SELECT` / `resolveRunTitle` / confirmed counts. Do not change `listActiveRuns` / `getActiveRunById` filters.

#### 2. List loader

**File**: `src/lib/services/runs.ts` (or a thin companion in the same services folder if `runs.ts` would become unreadable — prefer extending `runs.ts` unless it clearly splits)

**Intent**: Personal archive index: confirmed participation, then archived, newest start first, no filters, no pagination.

**Contract**: `listArchivedRunsForParticipant(supabase, userId)`:
- Select `run_id` from `run_participants` where `user_id = userId` and `status = 'confirmed'`
- If none, return `[]` (do not query all `runs`)
- Load those runs with `RUN_SELECT`
- Keep rows where `!isRunActive(starts_at, archived_at, now)` (treat missing `archived_at` as null — add it to the select if the helper needs the stamp short-circuit)
- Sort `starts_at` descending
- Then `confirmedCountsForRuns` on the remaining ids (filter **before** counts, same lesson as S-03)
- Map with the archived mapper (never `mapRunRow` as it stands)

#### 3. Detail loader

**File**: `src/lib/services/runs.ts` and `getOwnParticipation` in `src/lib/services/participants.ts` (call, do not fork)

**Intent**: Canonical `/runs/{id}` can resolve an archived run only for a current confirmed participant.

**Contract**: `getArchivedRunForParticipant(supabase, runId, userId)` returns the archived DTO or `null` when any of: invalid id, no confirmed own row, run missing, or run still active. Do not return a run solely because organizer/admin RLS succeeded. **Both** `getActiveRunById` and `getArchivedRunForParticipant` must `isUuid`-guard and return `null` on invalid UUID (page 404), matching `loadActiveRunForMutation` / API helpers — do not let PostgREST `22P02` throw into `[id].astro`’s 500 catch. Dual-mode tries active first, so an unguarded active loader would 500 before the archive path runs.

### Success Criteria:

#### Automated Verification:

- `listArchivedRunsForParticipant` and `getArchivedRunForParticipant` exist and are used only for archive (grep)
- `listActiveRuns` / `getActiveRunById` still filter the active window
- `getActiveRunById` and `getArchivedRunForParticipant` return `null` for invalid UUID (`isUuid` guard; no throw)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Confirmed participant: list returns their past-grace run, not their still-active runs, newest first
- Pending/denied/withdrawn (no confirmed row): list omits that run; detail loader returns null
- Organizer after leave-team: list omits that run; detail loader returns null even though SQL organizer SELECT may succeed
- `getActiveRunById` still null for past-grace (guest path unchanged)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: History page, dual-mode detail, nav, docs

### Overview

Expose FR-015 in the UI: gated list, discoverability, read-only detail on the same URL, and accurate `PROTECTED_ROUTES` docs.

### Changes Required:

#### 1. Auth-gated history list

**File**: `src/pages/runs/history.astro` (new, static segment)

**Intent**: Signed-in confirmed participants browse their archive; guests never render an empty public archive.

**Contract**: Add `/runs/history` to `PROTECTED_ROUTES` in `src/middleware.ts` (unauthenticated → `/auth/signin`, same as `/runs/new`). Page uses Layout + Topbar, SSR `listArchivedRunsForParticipant`. Cards reuse the `/runs` card facts (title, time, filled, min points, join, map, organizer) plus an Archived label instead of In progress. Empty: distinct “no past runs” copy (not “No active runs yet”). No GET filter form. `user` is guaranteed by middleware; if `!user` still, treat as config/auth failure. Load errors: same style as `/runs` (inline message, not a new `?error=` protocol).

#### 2. Dual-mode `/runs/[id]`

**File**: `src/pages/runs/[id].astro`

**Intent**: One canonical run URL. Active behavior unchanged. After grace, only current confirmed participants see read-only detail.

**Contract**:
- Try `getActiveRunById` first
- If null and `user`, try `getArchivedRunForParticipant`; if that hits, treat as archived mode
- Else `pageError = "missing"` (HTTP 404). Copy may stay “missing or no longer active” — do not distinguish “exists but not yours”
- Invalid UUID: both loaders return `null` → `pageError = "missing"` (404), never 500 from PostgREST `22P02`
- Archived mode: show details + map + confirmed roster; omit `RunParticipantActions`; do not fetch pending/denied; show an Archived status line; back link to `/runs/history` (active mode keeps `← Active runs`)
- `AdminRunControls` only if `isAdmin` **and** the page loaded (admin who did not participate still 404s — no S-09 bypass)

#### 3. Discovery

**Files**: `src/components/Topbar.astro`, `src/pages/runs/index.astro`

**Intent**: Players can find history after runs leave the active list, without occupying `/dashboard`.

**Contract**: Signed-in Topbar link “History” → `/runs/history` (with Runs / New run / Dashboard). On `/runs`, signed-in users get a text link “Your past runs” → `/runs/history` near the header (not a second primary CTA replacing Create). Guests: no history link. Do not add history content to `dashboard.astro`.

#### 4. Stale route docs

**File**: `AGENTS.md` (Protected routes sentence)

**Intent**: lessons.md — update stale docs when detected. The file still omits `/admin` and will omit `/runs/history` unless updated.

**Contract**: `PROTECTED_ROUTES` currently documented as `/dashboard`, `/runs/new` only. Set it to the real gate: `/dashboard`, `/runs/new`, `/admin`, `/runs/history`. Do not rewrite unrelated AGENTS.md sections.

### Success Criteria:

#### Automated Verification:

- `src/pages/runs/history.astro` exists; middleware lists `/runs/history`
- Topbar includes a History link for signed-in users
- `npm run lint` passes
- `npm run build` passes
- `AGENTS.md` `PROTECTED_ROUTES` line includes `/admin` and `/runs/history`

#### Manual Verification:

- Guest `/runs/history` → sign-in redirect
- Confirmed participant: list shows archived run; card and `/runs/{id}` open read-only detail (no apply/approve/leave/pending queue); Archived visible
- Guest or non-confirmed member: `/runs/{id}` past-grace still 404
- Organizer who left the team: 404 on that archived URL; run absent from `/runs/history`
- Signed-in `/runs` shows “Your past runs”; guests do not
- Active run detail/mutations unchanged (grace still mutable; upcoming apply still works)
- `/dashboard` still the auth stub (no history list)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None required — no test runner in `package.json`. Keep archive vs active predicates in `run-lifecycle.ts` so a later runner can cover `isRunActive` without a page harness.

### Integration Tests:

- `npm run lint` and `npm run build` per phase
- Phase 1: local Supabase migrate + PostgREST/SQL matrix (anon, pending/denied, confirmed, organizer-left, admin-without-seat)

### Manual Testing Steps:

1. Local app + Supabase up. Create approval (or auto-join) run; seat confirmed participant (and optionally a pending/denied user).
2. Leave `starts_at` in the future: run on `/runs`, not on `/runs/history`.
3. SQL-set `starts_at` to ~30 minutes ago: still active/in-progress; not on history; mutations still work.
4. SQL-set `starts_at` to >1 hour ago: gone from `/runs`; confirmed user sees it on `/runs/history` and on `/runs/{id}` read-only.
5. As guest, pending, denied: archived `/runs/{id}` 404; history requires auth and does not list that run.
6. Organizer Leave team, then archive: organizer 404s; remaining confirmed teammate still sees it.
7. Topbar History + `/runs` “Your past runs” only when signed in.

## Performance Considerations

History size is the viewer’s confirmed runs, not the global catalog. One `run_participants` query (`run_participants_user_id_idx`) plus one `runs` `.in("id", …)` plus existing per-id confirmed counts on the **archived subset**. No new index required for MVP. No pagination (locked). Postgres `now()` vs Worker `Date` may differ by seconds at the grace boundary — same S-04 acceptance.

## Migration Notes

- One RLS migration; no backfill; `archived_at` stays null unless already set
- Production applies on the next `v*` tag (`supabase db push` in deploy), same as other schema changes
- Rollback: drop the new SELECT policy; app history routes would 404/empty until reverted together

## References

- PRD FR-015, US-01, Access Control: `context/foundation/prd.md`
- Roadmap S-07: `context/foundation/roadmap.md`
- S-04 predicate handoff: `context/archive/2026-08-07-run-archival-lifecycle/change.md`
- S-02 participation states: `context/archive/2026-07-31-apply-and-approve-participants/plan.md`
- S-03 list choke point (filter before counts): `context/archive/2026-08-17-search-filter-runs/plan.md`
- Lifecycle helpers: `src/lib/run-lifecycle.ts`
- Active services: `src/lib/services/runs.ts`, `src/lib/services/participants.ts`
- Lessons (`?error=`): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Confirmed-participant SELECT on archived runs

#### Automated

- [x] 1.1 Migration file exists under `supabase/migrations/` with the confirmed+archived SELECT predicate — addb515
- [x] 1.2 `npm run lint` passes — addb515
- [x] 1.3 `npm run build` passes — addb515

#### Manual

- [x] 1.4 Migration applies cleanly on local Supabase — addb515
- [ ] 1.5 As anon: cannot SELECT a past-grace run
- [ ] 1.6 As pending or denied only: cannot SELECT the archived run
- [ ] 1.7 As confirmed: can SELECT the archived run
- [ ] 1.8 Organizer who left: new policy does not grant SELECT (organizer policy may still return the row)
- [ ] 1.9 Admin without participation: no new policy grant (admin policy may still return the row)

### Phase 2: History list and archived-detail service contract

#### Automated

- [x] 2.1 `listArchivedRunsForParticipant` and `getArchivedRunForParticipant` exist — 5f71dc6
- [x] 2.2 `listActiveRuns` / `getActiveRunById` still filter the active window — 5f71dc6
- [x] 2.3 `npm run lint` passes — 5f71dc6
- [x] 2.4 `npm run build` passes — 5f71dc6
- [x] 2.9 `getActiveRunById` and `getArchivedRunForParticipant` return null for invalid UUID (no throw) — 5f71dc6

#### Manual

- [ ] 2.5 Confirmed participant: list is archived-only, newest first
- [ ] 2.6 Pending/denied/withdrawn: omitted from list; detail loader null
- [ ] 2.7 Organizer after leave-team: omitted from list; detail loader null
- [ ] 2.8 `getActiveRunById` still null for past-grace

### Phase 3: History page, dual-mode detail, nav, docs

#### Automated

- [x] 3.1 `src/pages/runs/history.astro` exists; middleware lists `/runs/history`
- [x] 3.2 Topbar includes a History link for signed-in users
- [x] 3.3 `npm run lint` passes
- [x] 3.4 `npm run build` passes
- [x] 3.5 `AGENTS.md` `PROTECTED_ROUTES` line includes `/admin` and `/runs/history`

#### Manual

- [ ] 3.6 Guest `/runs/history` redirects to sign-in
- [ ] 3.7 Confirmed participant: list + read-only `/runs/{id}` (no mutations/pending queue); Archived visible
- [ ] 3.8 Guest or non-confirmed: past-grace `/runs/{id}` 404
- [ ] 3.9 Organizer who left: 404 and absent from history
- [ ] 3.10 Signed-in `/runs` shows “Your past runs”; guests do not
- [ ] 3.11 Active detail/mutations unchanged
- [ ] 3.12 `/dashboard` still the auth stub
