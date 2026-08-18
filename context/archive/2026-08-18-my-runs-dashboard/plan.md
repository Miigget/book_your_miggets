# My-runs dashboard Implementation Plan

## Overview

Ship S-08 / FR-005: a signed-in organizer can open `/dashboard` and see every run they created — active (soonest-first) then past (newest-first) — and open each run at the existing `/runs/{id}` URL. Accept/deny/leave stay on detail. Pending counts on active approval-required cards are the only extra “manage” signal. Organizers who left the team can still reopen their archived created runs (new loader; back link to `/dashboard`).

## Current State Analysis

`/dashboard` is an auth-gated stub (welcome email + sign-out, no Topbar). Topbar already links “Dashboard”. `PROTECTED_ROUTES` already includes `/dashboard`. There is no `listRunsForOrganizer`; list UIs are public active (`listActiveRuns`) and participant archive (`listArchivedRunsForParticipant`).

RLS `runs_select_own_organizer` already returns every row with `organizer_id = auth.uid()`, including past-grace. S-07/S-09 deliberately do **not** list those rows: history starts from confirmed `run_participants`, and archived detail 404s without a current confirmed seat (or admin). Leave-team deletes the organizer’s confirmed row, so created-but-unseated archived runs are invisible in the app today even though RLS can SELECT them.

Organizer actions already live on `/runs/{id}` (`isOrganizer` pending/denied + `RunParticipantActions`). There is no organizer UPDATE/DELETE UI, no cross-run inbox, and no test runner.

## Desired End State

A signed-in user opens `/dashboard` (Layout + Topbar, same cosmic list chrome as `/runs/history`) and sees runs they created. Two sections: **Active** (upcoming + in-progress, `starts_at` ascending) then **Past** (archived, `starts_at` descending). Cards reuse public/history facts plus an In-progress label when needed; active `approval_required` cards also show a pending count. Clicking a card goes to `/runs/{id}`. Zero created runs: one empty state + Create CTA. If only one lifecycle has rows, both headings still render; the empty section is a compact line, not a second hero card.

Archived `/runs/{id}` loads for the organizer even without a confirmed seat. Back link for that path is `/dashboard`. Seated organizers still take the existing participant-archive path (back to `/runs/history`). Guests hitting `/dashboard` still redirect to sign-in. Members who did not organize the run still 404 on archived detail.

### Key Discoveries:

- `/dashboard` stub + Topbar link already exist (`src/pages/dashboard.astro`, `src/components/Topbar.astro`); middleware already gates the path (`src/middleware.ts`)
- `runs_select_own_organizer` is sufficient — no migration (`supabase/migrations/20260729134008_run_domain_schema.sql`)
- S-07 leak guard (`src/lib/services/runs.ts` `listArchivedRunsForParticipant`): never list every archived row organizer RLS can see; S-08 must filter `organizer_id`, not membership
- `mapRunRow` drops archived; archive mapping must use `mapArchivedRunRow` / `isRunActive` (respects stamped `archived_at`)
- Archived detail order today: active → participant → admin (`src/pages/runs/[id].astro`). Organizer bypass belongs after participant, before admin
- `confirmedCountsForRuns` is the N+1 head-count pattern to copy for pending
- `history.astro` currently echoes `err.message` into the body — do **not** copy that; follow `lessons.md` (log raw, friendly copy)
- No test runner (`AGENTS.md`) — verification is lint/build + UI/RLS smoke

## What We're NOT Doing

- Cross-run pending inbox (accept/deny from the dashboard)
- Organizer edit, cancel, or delete (admin delete stays on detail)
- Pagination, search, or S-03 filters on the dashboard
- New migration, `archived_at` stamp/cron, SECURITY DEFINER read RPC, `service_role` on the Worker
- Repurposing `/runs/history` as organizer inventory
- Hiding Topbar Dashboard until the first created run
- Changing participant-archive 404 for non-organizers
- Vitest/Jest
- Redirect-after-create to `/dashboard` (create still lands on `/runs/{id}`)

## Implementation Approach

App-layer only. RLS already permits the organizer SELECT.

1. Add `listRunsForOrganizer` beside the other run loaders: query by `organizer_id`, split with `isRunActive`, sort per section, confirmed counts on both, pending counts only on active `approval_required`.
2. Replace the `/dashboard` stub with an SSR list (S-07 card chrome, two sections, empty states). Cards deep-link to `/runs/{id}`.
3. Add `getArchivedRunForOrganizer` (archived + `organizer_id === viewer`). Call it from `[id].astro` after the participant miss and before the admin bypass. Back link → `/dashboard` when that loader is the source.

## Critical Implementation Details

**`organizer_id`, not membership.** A history-style “confirmed ids then runs” query would drop leave-team organizers and would mix FR-015 with FR-005. List and organizer detail must `.eq("organizer_id", viewerId)` (and re-check `organizer_id` in the detail loader). Do not weaken `getArchivedRunForParticipant`.

**Organizer archived loader is page-gated and id-checked.** Admin RLS can SELECT any run. `getArchivedRunForOrganizer` must return null unless the loaded row’s `organizer_id` equals the viewer id — otherwise an admin cookie could use it as a generic bypass. Invoke it only for a signed-in user, after the participant loader misses. Do not call it from `/runs/history`.

**Loader order.** `getActiveRunById` → `getArchivedRunForParticipant` (if `user`) → `getArchivedRunForOrganizer` (if `user`) → `getArchivedRunForAdmin` (if `isAdmin`). Seated organizer keeps the History back link; unseated organizer gets Dashboard; admin-only bypass stays Admin. This flips S-09’s leftover “unseated organizer still 404s” for the owner only.

**Phase 2 cards may 404 until Phase 3.** Active created runs already open via `getActiveRunById`. Unseated archived cards 404 until the organizer loader exists — acceptable, same cadence as S-09.

**Pending counts are not an inbox.** Count `run_participants` with `status = 'pending'` only for active `approval_required` ids. Auto-join and archived cards omit the field/row. Do not add decide actions on the dashboard.

**Errors.** Log PostgREST/Auth with `console.error`; show a fixed friendly string. Do not assign `err.message` into the dashboard body (`lessons.md`).

---

## Phase 1: Organizer list service

### Overview

Give the dashboard a choke point that returns only the viewer’s created runs, split active vs archived, with confirmed counts and pending counts on active approval-required runs.

### Changes Required:

#### 1. Organizer list DTO and loader

**File**: `src/lib/services/runs.ts`

**Intent**: Personal organizer inventory by ownership, not participation, so leave-team does not hide created runs.

**Contract**: Export `listRunsForOrganizer(supabase, userId)` returning `{ active: OrganizerRunListItem[]; archived: ArchivedRunListItem[] }` (names may vary; keep `ArchivedRunListItem` as today). `OrganizerRunListItem` is `RunListItem` plus `pendingCount: number`. Query `runs` with `RUN_SELECT` and `.eq("organizer_id", userId)` — do not start from `run_participants`. Split with `isRunActive(starts_at, archived_at, now)`. Sort active `starts_at` ascending, archived descending. Then `confirmedCountsForRuns` on each subset. Pending: same head-count pattern, `status = 'pending'`, only for active rows with `join_mode = 'approval_required'` (others `pendingCount = 0`). Map active with `mapRunRow` (drop unexpected archived), archived with `mapArchivedRunRow`. Empty ownership → `{ active: [], archived: [] }` without listing other people’s runs. DB error → throw; pages map to friendly copy.

#### 2. Comments on existing leak guards

**File**: `src/lib/services/runs.ts` (`listArchivedRunsForParticipant` / `getArchivedRunForAdmin` comments)

**Intent**: S-08 is no longer “don’t ever expose organizer archived rows”; the new list is the allowed surface.

**Contract**: Keep the participant-history warning (do not list every RLS-visible archived row from `/runs/history`). Clarify that organizer inventory is a dedicated `organizer_id` loader, not a reuse of the participant helper. Do not change participant/admin function behavior in this phase.

### Success Criteria:

#### Automated Verification:

- `listRunsForOrganizer` exists and filters by `organizer_id` (not confirmed membership)
- Pending counts are queried only for active `approval_required` runs
- `listArchivedRunsForParticipant` / `getArchivedRunForParticipant` are unchanged
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Optional until Phase 2: with a local organizer session, the function returns that user’s active and archived created runs (including a run they left), not runs they only joined
- Auto-join active runs have `pendingCount === 0` even if a pending row existed (should not); approval-required pending applications increment the count

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Dashboard UI

### Overview

Replace the `/dashboard` stub with the organizer inventory. Cards deep-link to `/runs/{id}`. Unseated archived cards may 404 until Phase 3.

### Changes Required:

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: FR-005 lives on the reserved auth route; drop the starter welcome/sign-out card.

**Contract**: Same shell as `/runs/history`: `Layout` + cosmic background + `Topbar`. Require `user` (middleware already redirects guests; defensive check like history). SSR `listRunsForOrganizer(supabase, user.id)`. Title along the lines of “Your runs”. Two `<section>`s in order: Active you created, then Past you created. **Zero total rows:** one hero empty (“You haven’t created a run yet” or equivalent) + link/button to `/runs/new`. **Otherwise:** always render both headings; a section with no rows gets a compact one-line empty (e.g. “None right now”), not a second hero card. Load failure: `console.error` the raw error; inline friendly string (not `err.message`). Cards: copy `/runs` / history facts (title, time, filled, min points, join, map). Active `in_progress` → In-progress label. Archived → Archived label. Active `approval_required` with `pendingCount > 0` (or always show Pending: 0 — prefer show the count whenever `joinMode === "approval_required"` on active cards) as a `dl` row. Each card is a link to `/runs/{id}`. No filter form. No accept/deny controls. Remove the stub’s dedicated sign-out form (Topbar already signs out). Do not change `PROTECTED_ROUTES`.

#### 2. Optional discoverability (keep small)

**File**: `src/pages/runs/index.astro` only if a one-line signed-in sibling to “Your past runs” stays obvious

**Intent**: Dashboard is already in Topbar; do not invent a second primary CTA.

**Contract**: Default: **no** extra `/runs` link — Topbar “Dashboard” is the entry. Do not replace Create. Do not add dashboard content to `/runs/history`.

### Success Criteria:

#### Automated Verification:

- `dashboard.astro` calls `listRunsForOrganizer` and no longer renders only the welcome/sign-out stub
- Topbar still links `/dashboard`; middleware still lists `/dashboard`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest `/dashboard` → `/auth/signin`
- Signed-in, never created a run: one empty state + Create CTA; Topbar Dashboard still visible
- Organizer with mixed lifecycles: Active soonest-first, Past newest-first; in-progress labeled; archived labeled
- Only-active or only-past: both headings; compact empty line on the empty section
- Approval-required active card shows pending count; auto-join does not
- Active card opens `/runs/{id}` (approve/leave unchanged)
- Unseated archived card may 404 until Phase 3 — acceptable here
- `/runs/history` still only confirmed-participant archives (not “I organized but left”)
- Banned user can still GET the dashboard (mutations remain blocked elsewhere)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Organizer archived detail

### Overview

Make Past-section cards open for the organizer without a confirmed seat. Guests and other members keep the S-07 404. Admin bypass stays last.

### Changes Required:

#### 1. Organizer archived detail loader

**File**: `src/lib/services/runs.ts`

**Intent**: Same page-gate idea as `getArchivedRunForAdmin`, but ownership-checked so it cannot become a generic archived-by-id helper.

**Contract**: `getArchivedRunForOrganizer(supabase, runId, userId)` returns `ArchivedRunDetail | null`. `!isUuid` → `null`. Fetch `RUN_SELECT` by id; missing → `null`; if `organizer_id !== userId` → `null`; `mapArchivedRunRow` (null if still active). Do not call `getOwnParticipation`. Do not change `getArchivedRunForParticipant`. Comment: callers must pass the signed-in viewer; the `organizer_id` check is mandatory because admin RLS would otherwise return other people’s rows.

#### 2. Dual-mode detail: organizer third attempt

**File**: `src/pages/runs/[id].astro`

**Intent**: Canonical URL; owner can reopen created archived runs after leave-team.

**Contract**: Extend `archivedSource` with `"organizer"`. Sequence: `getActiveRunById`; if null and `user`, participant loader; if still null and `user`, `getArchivedRunForOrganizer(supabase, id, user.id)` and set source `"organizer"`; if still null and `isAdmin`, admin loader. Archived mode still omits `RunParticipantActions` and pending/denied fetches. `AdminRunControls` unchanged (`isAdmin` && page loaded). Back link: participant → `/runs/history` (“← Past runs”); organizer → `/dashboard` (“← Dashboard” or “← Your runs”); admin-only → `/admin`. Invalid UUID still 404, not 500. Active detail back link stays `/runs`.

### Success Criteria:

#### Automated Verification:

- `getArchivedRunForOrganizer` exists and returns null when `organizer_id` does not match
- `[id].astro` calls it only when `user` is set, after the participant loader, before the admin loader
- `getArchivedRunForParticipant` still returns null without a confirmed seat
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Organizer who left the team (leave-team while the run was still active, then archive — do not leave-team after archival): archived `/runs/{id}` from a dashboard Past card opens read-only (map/time/roster, no apply/approve/leave/pending); back link is Dashboard
- Organizer still confirmed on that archived run: opens; back link remains Past runs (`/runs/history`)
- Guest and a member who is neither confirmed nor organizer: same URL still 404
- Admin who did not organize and did not play: still opens via admin bypass; back link Admin
- Active run detail/mutations unchanged
- `/runs/history` unchanged (leave-team organizer still absent there)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None required — no test runner in `package.json`. Keep `isRunActive` / mappers as the split predicate so a later runner can cover them without a page harness.

### Integration Tests:

- `npm run lint` and `npm run build` per phase
- No new SQL migration; RLS `runs_select_own_organizer` is the existing grant to rely on

### Manual Testing Steps:

1. Local app + Supabase. User A creates an approval-required run (with a pending applicant) and an auto-join run; User B joins another of A’s runs as confirmed.
2. `/dashboard` as A: both active runs listed soonest-first; pending count only on approval-required. As a user with zero created runs: one empty + Create. Guest: sign-in redirect.
3. SQL-set one of A’s still-seated runs `starts_at` to >1 hour ago. Dashboard Past section lists it. As A still seated: detail opens with History back link.
4. On A’s other still-active run, leave-team while it is still in the active window, then SQL-set that run `starts_at` past grace. Do not call leave-team on an archived run (API rejects it; lab shortcut is SQL-delete of the organizer’s confirmed row after archival). `/runs/history` drops the unseated run; dashboard Past still lists it. Phase 2: card may 404. Phase 3: opens read-only with Dashboard back link. User B (confirmed): still History. User C (unrelated): 404.
5. Active apply/approve/auto-join and admin delete/profile archive still work.

## Performance Considerations

One `runs` query filtered by `organizer_id`, then confirmed counts on remaining ids (existing N+1), plus pending counts on the smaller active approval-required subset. MVP organizer volume is small; no pagination (locked). Postgres `now()` vs Worker `Date` skew at the grace edge remains the S-04 acceptance. Do not add indexes in this slice.

## Migration Notes

- No database migration and no backfill
- Rollback = revert app code; organizer SELECT RLS stays
- Deploy is the usual `v*` tag CD; no new secrets

## References

- PRD FR-005 + secondary success: `context/foundation/prd.md`
- Roadmap S-08: `context/foundation/roadmap.md`
- S-07 participant history (list chrome, leak guard): `context/archive/2026-08-17-participant-archive-history/`
- S-09 admin archived bypass (loader order, back-link by source): `context/archive/2026-08-17-admin-player-archive-view/`
- S-02 pending-on-detail, inbox deferred: `context/archive/2026-07-31-apply-and-approve-participants/`
- Loaders: `src/lib/services/runs.ts`, `src/pages/runs/[id].astro`, `src/pages/runs/history.astro`
- Middleware `/dashboard`: `src/middleware.ts`
- Lessons (no raw infra in UI): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Organizer list service

#### Automated

- [x] 1.1 `listRunsForOrganizer` exists and filters by `organizer_id` (not confirmed membership) — 38a3ac9
- [x] 1.2 Pending counts are queried only for active `approval_required` runs — 38a3ac9
- [x] 1.3 `listArchivedRunsForParticipant` / `getArchivedRunForParticipant` are unchanged — 38a3ac9
- [x] 1.4 `npm run lint` passes — 38a3ac9
- [x] 1.5 `npm run build` passes — 38a3ac9

#### Manual

- [ ] 1.6 Function returns the viewer’s created active + archived runs, including leave-team, not join-only runs
- [ ] 1.7 Auto-join active runs have `pendingCount === 0`; approval-required pending applications increment the count

### Phase 2: Dashboard UI

#### Automated

- [x] 2.1 `dashboard.astro` calls `listRunsForOrganizer` and no longer renders only the welcome/sign-out stub — d00e53b
- [x] 2.2 Topbar still links `/dashboard`; middleware still lists `/dashboard` — d00e53b
- [x] 2.3 `npm run lint` passes — d00e53b
- [x] 2.4 `npm run build` passes — d00e53b

#### Manual

- [ ] 2.5 Guest `/dashboard` → `/auth/signin`
- [ ] 2.6 Zero created runs: one empty state + Create CTA; Topbar Dashboard still visible
- [ ] 2.7 Mixed lifecycles: Active soonest-first, Past newest-first; in-progress and archived labeled
- [ ] 2.8 Only-active or only-past: both headings; compact empty line on the empty section
- [ ] 2.9 Approval-required active card shows pending count; auto-join does not
- [ ] 2.10 Active card opens `/runs/{id}` (approve/leave unchanged)
- [ ] 2.11 Unseated archived card may 404 until Phase 3
- [ ] 2.12 `/runs/history` still only confirmed-participant archives
- [ ] 2.13 Banned user can still GET the dashboard

### Phase 3: Organizer archived detail

#### Automated

- [x] 3.1 `getArchivedRunForOrganizer` exists and returns null when `organizer_id` does not match — 113597c
- [x] 3.2 `[id].astro` calls it only when `user` is set, after the participant loader, before the admin loader — 113597c
- [x] 3.3 `getArchivedRunForParticipant` still returns null without a confirmed seat — 113597c
- [x] 3.4 `npm run lint` passes — 113597c
- [x] 3.5 `npm run build` passes — 113597c

#### Manual

- [ ] 3.6 Unseated organizer (leave-then-archive): archived `/runs/{id}` from dashboard Past is read-only; back link Dashboard
- [ ] 3.7 Seated organizer on that archived run: opens; back link Past runs
- [ ] 3.8 Guest and unrelated member: archived URL still 404
- [ ] 3.9 Admin who did not organize and did not play: admin bypass; back link Admin
- [ ] 3.10 Active detail/mutations unchanged
- [ ] 3.11 `/runs/history` unchanged (leave-team organizer still absent there)
