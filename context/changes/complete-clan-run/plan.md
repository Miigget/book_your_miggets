# Mark a clan run completed Implementation Plan

## Overview

Ship S-22 / PRD v2 FR-021 (US-02): a clan **owner** can mark an in-progress **clan-only** run as completed. That stamp is a new `completed_at` column written only by a DEFINER RPC. It must not call `archive_run`, must not change `clans.points`, and must not stop comment (or screenshot) writes — those stay open until Archive. Join / leave / decide / kick / withdraw / edit / extend freeze after Complete; Archive still frees the 5-cap. No admin verify queue this slice (S-23).

## Current State Analysis

Clan-only runs are the existing `runs` row with `visibility = 'clan_only'` (S-21). Audience is live `is_same_clan(organizer_id, uid)`. Create/edit is clan **owner** only (`clans.owner_id`, app `userOwnsClan`). There is no `runs.clan_id`, no officer role, and no `completed_at`.

S-24 already shipped audience-exit: DEFINER `archive_run` / `extend_run` stamp `archived_at` / `extended_until`. Audience-active is `is_run_active_row` — `archived_at` null and (`extended_until` null or not elapsed). Comment **writes** and screenshot uploads require `is_run_in_active_window` (that helper = audience-active ∧ `can_view_run`). Comment **reads** are unbounded for confirmed / organizer / admin. The 5-cap counts audience-active rows only.

Organizer header on `/runs/{id}` today: Edit + Archive + Extend (`OrganizerRunLifecycleControls`). Admin section: Archive vs Delete. No Complete control. Clan pages do not list runs. `clans.points` is frozen (no UPDATE grant; trigger `clans_freeze_points_and_owner`).

`isRunActive` / `getRunLifecyclePhase` do not know about completion. A completed-but-unarchived clan-only run is still `in_progress` on the active list — that is intended.

## Desired End State

- Clan owner (run organizer who currently owns a clan) can Complete an **in-progress**, audience-active, **clan_only** run that is not already completed.
- `completed_at` is set once. No un-complete. Complete never writes `archived_at`, `extended_until`, or `clans.points`.
- After Complete the run **stays audience-active** (still on Clan / dashboard Incoming, still occupies the 5-cap) until Archive or an elapsed extend.
- Roster and run fields freeze: apply / auto-join / withdraw / leave / decide / kick / edit / extend fail. Comments and screenshot attaches still work for the existing comment ACL.
- Anyone who can already view an **audience-active** completed run sees a **Completed** chip on detail and on Clan/dashboard cards. After Archive, Past, Recent, and archived `/runs/{id}` stay **Archived** (Archived wins). Guests and non-members still 404. No admin list and no verified-finish control.
- Archive (organizer + admin) still works on a completed run and is still the only way to leave the active list / free a slot.

### Key Discoveries:

- Reusing `archive_run` for Complete would set `archived_at`, drop the run from lists, free the 5-cap, and **block comment writes** via `is_run_in_active_window` (`supabase/migrations/20260820092809_run_comments.sql` insert; screenshot policies in `20260831130723_comment_screenshots.sql`). US-02 needs `/teamrank` + finish-line screenshots after complete.
- Do not fold `completed_at` into `is_run_active_row` (`supabase/migrations/20260831131219_manual_archive_and_extend.sql`). That helper is the 5-cap, guest/auth lists, and comment-write window.
- Participant apply INSERT uses `can_view_run` only (`run_participants_insert_self_pending` in `20260824101006_restricted_run_visibility.sql`) — still true after Complete. Leave DELETE has **no** run-window check (`20260821094355_participant_leave_own_confirmed.sql`). Freeze must be added on roster policies **and** `auto_join_run`, not only in the app.
- `userOwnsClan` alone is not the actor: any clan owner would match. Complete must also require `auth.uid() = organizer_id` and `visibility = 'clan_only'`, matching create (`runs_insert_own` clan-owner EXISTS in `20260831123822_clan_only_run_rls.sql`).
- Latest migration stamp to beat: `20260901083000_clan_only_on_is_run_active_row.sql`. Types are generated (`npm run db:types`); do not hand-edit `src/types/database.ts`.
- Mutation UI pattern: `OrganizerRunLifecycleControls` + `fetchFormJson` + `runFail` (`src/pages/api/runs/[id]/archive.ts`). Do not add Complete to `CreateRunForm`.
- No Vitest/Jest in `package.json`.

## What We're NOT Doing

- Calling `archive_run` (or stamping `archived_at`) from Complete
- Mutating `clans.points` or adding verified-finish
- Admin verify queue, admin Complete, or verified-finish UI (S-23)
- Officer role or officer UI
- `runs.clan_id`
- Un-complete / clearing `completed_at`
- Changing comment **read** ACL; widening who can post or read; new screenshot type
- Adding `completed` to `RunLifecyclePhase` (keep `upcoming` | `in_progress` | `archived`; Completed is a flag/chip)
- Folding Complete into audience-active / 5-cap
- Prefix-protecting `/runs` or `/clans`
- Clan pages listing runs
- Vitest/Jest/pgTAP
- GRANT UPDATE on `completed_at`, `archived_at`, or `extended_until`

## Implementation Approach

One additive migration (nullable `completed_at` + roster-open helper + DEFINER `complete_clan_run` + freeze on roster/edit/extend, GRANT closed) → regenerate types → map `completedAt` on run DTOs and freeze app gates that still use audience-active alone → `POST /api/runs/{id}/complete` → owner Complete control + Completed chip + AGENTS.md.

Canonical predicates (SQL and TS must match):

- **Audience-active** (unchanged): `archived_at IS NULL AND (extended_until IS NULL OR extended_until > now())`
- **Roster-open**: audience-active **AND** `completed_at IS NULL`
- **Complete-eligible**: roster-open **AND** `now() >= starts_at` **AND** `visibility = 'clan_only'` **AND** caller is organizer **AND** `EXISTS (SELECT 1 FROM clans c WHERE c.owner_id = caller)` **AND** `completed_at IS NULL`

## Critical Implementation Details

**Do not put `completed_at` on `is_run_active_row` or `is_run_in_active_window`.** Completing would then look like archive: lists drop, 5-cap frees, comments and screenshots stop. Inline `completed_at IS NULL` (or a new column-arg helper) only on roster/edit/extend.

**Actor is organizer + current clan owner + `clan_only`, not `userOwnsClan` alone.** A second clan owner must get `not_found` (same leak rule as `archive_run`). Direct POST on a public run the caller organizes may return `not_clan_only` (honest, not a leak).

**Lifecycle phase stays `in_progress` after Complete.** Cards/detail show **Completed** instead of a second “In progress” chip when `completedAt` is set **and** the run is still audience-active (`lifecyclePhase !== "archived"`). After Archive, Past, Recent, and archived `/runs/{id}` stay **Archived** — Archived wins. Archive still uses audience-active; Extend hides when completed.

**`complete_clan_run` must not `UPDATE` `clans`.** Re-assert `GRANT UPDATE` on `runs` without `completed_at`. Points freeze stays S-18/S-21’s job; this RPC must not become a points writer.

## Phase 1: SQL contract — `completed_at`, DEFINER complete, roster freeze

### Overview

Land the stamp in Postgres so PostgREST cannot write it, Complete cannot archive, comments still write, and roster/edit/extend cannot move after Complete.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_complete_clan_run.sql` (via `npx supabase migration new complete_clan_run`; stamp after `20260901083000`)

**Intent**: Add a one-shot completed stamp for clan-only runs and freeze roster/edit/extend without changing audience-active, archive, or comment-write.

**Contract**:

- `ALTER TABLE public.runs ADD COLUMN completed_at timestamptz` (nullable, no default). Comment: clan-run complete for later admin verify (S-23); not archive; not points.
- No backfill — existing rows stay null.
- Helper `public.is_run_roster_open_row(p_archived_at timestamptz, p_extended_until timestamptz, p_completed_at timestamptz) RETURNS boolean`, `LANGUAGE sql STABLE`, **not** DEFINER, **no** `SELECT` from `runs`: `public.is_run_active_row(p_archived_at, p_extended_until) AND p_completed_at IS NULL`. `REVOKE ALL FROM public`; `GRANT EXECUTE` to `authenticated` (and `anon` only if a policy that anon uses needs it — today roster writes are authenticated-only, so authenticated is enough).
- Do **not** replace `is_run_active_row`, `is_run_in_active_window`, `can_view_run`, `runs_select_active_*`, `archive_run`, or the 5-cap trigger.
- `runs_update_own`: add `completed_at IS NULL` (or `is_run_roster_open_row(...)`) to **USING and WITH CHECK**, keep existing organizer / banned / audience-active / verified / clan-owner conjuncts from `20260901083000_clan_only_on_is_run_active_row.sql`. Do not call `can_view_run` from this policy.
- `auto_join_run`: after the audience-active / `can_view_run` miss (`not_active`), if `v_run.completed_at IS NOT NULL` return `not_active` (same oracle as inactive — do not add a new “completed” leak). Prefer checking roster-open in that same miss so completed looks like not_active.
- `extend_run`: if `v_run.completed_at IS NOT NULL` return `already_completed` (before setting `extended_until`). Do not stamp extend on a completed run.
- Participant policies — require roster-open via `EXISTS (SELECT 1 FROM public.runs r WHERE r.id = run_id AND public.is_run_roster_open_row(r.archived_at, r.extended_until, r.completed_at))` on:
  - `run_participants_insert_self_pending` (WITH CHECK; keep `can_view_run`)
  - `run_participants_update_organizer` (USING and WITH CHECK)
  - `run_participants_delete_own_pending`
  - `run_participants_delete_own_confirmed` (leave)
  - If kick uses a separate organizer DELETE policy, freeze that too. Do **not** change `run_participants_update_admin` unless it is a one-line EXISTS; residual admin PostgREST on participants is acceptable (no admin decide UI).
- `complete_clan_run(p_run_id uuid) RETURNS text`, `SECURITY DEFINER`, `SET search_path = ''`. `REVOKE ALL` from `public`, `anon`; `GRANT EXECUTE` to `authenticated` only. Soft codes (no raise for business cases), same family as `archive_run`:

  | Code | When |
  | --- | --- |
  | `not_authenticated` | no `auth.uid()` |
  | `not_found` | missing row **or** caller is not `organizer_id` (do not leak restricted runs; admin who is not organizer → `not_found`) |
  | `banned` | organizer and `NOT is_not_banned()` |
  | `not_clan_only` | organizer but `visibility <> 'clan_only'` |
  | `not_owner` | organizer of clan_only but no `clans` row with `owner_id = uid` |
  | `not_active` | not audience-active |
  | `not_in_progress` | audience-active but `now() < starts_at` |
  | `already_completed` | `completed_at IS NOT NULL` |
  | `completed` | `SET completed_at = now()` where still null |

  Do not `UPDATE` `clans`. Do not call `archive_run`. Do not touch `archived_at` / `extended_until`. Do not require a confirmed seat. Do not exempt `POST /api/runs/{id}/complete` from the existing middleware banned POST gate.
- Re-assert column grants: `REVOKE UPDATE ON public.runs FROM authenticated`; `GRANT UPDATE (title, map_id, map_category, starts_at, max_participants, min_points, join_mode, visibility)` only — **not** `completed_at`, **not** `archived_at`, **not** `extended_until`, **not** `organizer_id`.
- Do not change `list_player_public_runs` (public runs cannot be completed; no guest chip needed).

#### 2. Generated types

**File**: `src/types/database.ts` (via `npm run db:types`)

**Intent**: Expose `runs.completed_at` and `complete_clan_run` to the app.

**Contract**: Regenerated `Tables<"runs">` includes `completed_at: string | null`. `Functions["complete_clan_run"]` args `{ p_run_id: string }` returns `string`. No hand-edits.

### Success Criteria:

#### Automated Verification:

- Migration applies on local Supabase (`npx supabase migration up` or `npx supabase db reset` as the implementer already uses).
- `npm run db:types` succeeds; `completed_at` and `complete_clan_run` appear in `src/types/database.ts`.
- SQL smoke as **authenticated** (not superuser): `complete_clan_run` on an in-progress clan-only run owned by the caller returns `completed` and sets `completed_at`; `clans.points` unchanged; second call returns `already_completed`; `archive_run` still returns `archived` afterward; `INSERT` into `run_comments` still succeeds while audience-active; `auto_join_run` returns `not_active`; `extend_run` returns `already_completed`; on that completed audience-active clan-only run: pending `INSERT` into `run_participants` fails; confirmed-participant `DELETE` (leave) fails; organizer `UPDATE` on a participant row (decide or kick / status change) fails; direct `UPDATE runs SET completed_at = now()` as authenticated fails (GRANT).
- SQL smoke negatives: non-organizer → `not_found`; public run organizer → `not_clan_only`; upcoming clan-only → `not_in_progress`.

#### Manual Verification:

- Local Supabase is running so the smoke SQL can be replayed from the SQL editor if the implementer wants a second look.
- No UI required this phase.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: App API — complete service, freeze gates, error strings

### Overview

Cookie-session `POST /api/runs/{id}/complete` calls the RPC. App loaders that still treat “audience-active” as “mutable” also honor `completed_at`. No points writes. No Complete button yet.

### Changes Required:

#### 1. Run DTO + selects

**File**: `src/lib/services/runs.ts`

**Intent**: Carry `completedAt` on active run DTOs so later UI and gates do not re-fetch.

**Contract**: Add `completedAt: string | null` to `RunListItem` (archived DTOs may omit or stay null). Include `completed_at` in `RUN_SELECT` and `RunRow`. Map it in `runFieldsFromRow`. In `runRowFromPublicRpc`, set `completed_at: null` (the RPC row has no `completed_at`). Do **not** alter `list_player_public_runs`. Do **not** make `mapRunRow` return null when `completed_at` is set. `getOwnedActiveRunForEdit` returns null when `completed_at` is set (edit 404). `prepareOwnedActiveRunPatch` rejects completed rows with a domain `RunError` (same family as inactive — see error string below). `countAudienceActiveRunsForOrganizer` still ignores `completed_at` (5-cap unchanged).

#### 2. Complete service

**File**: `src/lib/services/runs.ts`

**Intent**: Wrap `complete_clan_run` like `archiveRun` / `extendRun`.

**Contract**: `completeClanRun(supabase, runId): Promise<void>`. Map outcomes:

- `completed` → return
- `already_completed` → `RunError` “This clan run is already completed.”
- `not_in_progress` → `RunError` “You can only complete a clan run that is in progress”
- `not_clan_only` → `RunError` “Only a clan-only run can be marked completed”
- `not_owner` → reuse `CLAN_ONLY_OWNER_REQUIRED` (or a complete-specific owner string that still does not mention officers)
- `not_found` / `not_authenticated` / `not_active` → `RunError` “Run not found or no longer active”
- `banned` → existing `BANNED_RUN_MUTATION_MESSAGE`
- unknown / PostgREST → log `console.error`; `RunError` “Could not complete this clan run” — never `err.message` in `?error=`

Do not call `userOwnsClan` inside the RPC wrapper or the API route. Complete route matches `archive.ts` (signed-in + `completeClanRun` only). Map RPC `not_owner` to the owner string inside `completeClanRun` (only valid after the RPC knows the caller is organizer). A pre-RPC `userOwnsClan` check would leak restricted runs. Do not `UPDATE` `clans`.

#### 3. HTTP route

**File**: `src/pages/api/runs/[id]/complete.ts`

**Intent**: Cookie-session POST for the owner Complete control, same shape as archive.

**Contract**: `POST` only. `isUuid` → `commentInvalidRun`. Unconfigured supabase / signed-out → same helpers as `archive.ts`. Call `completeClanRun`. Success redirect `/runs/{id}` (`commentJson` when `wantsJson`). Failures via `runFail` with `RunError.message`. Do not add this path to `PROTECTED_ROUTES` (API is already signed-in + banned-gated by middleware). No admin `/api/admin/runs/{id}/complete`.

#### 4. Roster / extend freeze in app

**Files**: `src/lib/services/participants.ts`, `src/lib/services/runs.ts` (`extendRun`)

**Intent**: App gates match SQL so organizers see a domain string instead of a swallowed RLS miss.

**Contract**: `loadActiveRunForMutation` selects `completed_at` and throws `ParticipantError` with a fixed string such as `CLAN_RUN_COMPLETED_FROZEN` (“This clan run is completed. The roster cannot change.”) when set — used by apply / withdraw / leave / decide / kick. `extendRun` maps `already_completed` to “This clan run is completed and cannot be extended”. `requireActiveRun` in `src/lib/services/comments.ts` stays audience-active only (comments remain writable).

### Success Criteria:

#### Automated Verification:

- `npx astro sync` and `npm run lint` pass.
- `npm run build` passes (Worker bundle includes the new route).
- Typecheck: `completeClanRun` and `completedAt` compile against generated types.

#### Manual Verification:

- While signed in as the clan owner, `POST /api/runs/{id}/complete` on an in-progress clan-only run redirects to `/runs/{id}` (no UI button yet). Repeat → already-completed message in `?error=` (no raw PostgREST).
- Same user: apply / leave / extend / edit POST fail with the frozen/completed domain strings; posting a comment still works.
- `clans.points` unchanged in the DB after complete.
- Non-owner clan member POST complete → missing/inactive style error (404-like, not 403). Guest POST → sign-in.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Owner Complete control, Completed chip, AGENTS.md

### Overview

The owner can Complete from `/runs/{id}` with an Archive-style confirm. Viewers who can already see the run get a Completed chip. Docs record complete ≠ archive.

### Changes Required:

#### 1. Organizer Complete control

**Files**: `src/components/runs/OrganizerRunLifecycleControls.tsx`, `src/pages/runs/[id].astro`

**Intent**: Put Complete next to Archive without looking like Archive, only when the owner may complete.

**Contract**: Page loads `userOwnsClan` for the organizer. Show Complete when `isOrganizer && visibility === "clan_only" && lifecyclePhase === "in_progress" && !completedAt && ownsClan && !isArchived`. Confirm copy (window.confirm, same pattern as Archive): this marks the clan run completed for later admin verify; it does **not** archive and does **not** award clan points. POST `/api/runs/{id}/complete`. Hide Extend when `completedAt` is set. Keep Archive. Hide the Edit link when `completedAt` is set. Do not add a second 5-cap lecture on success redirect (stay on `/runs/{id}`). No officer copy. No admin Complete.

#### 2. Completed chip

**Files**: `src/pages/runs/[id].astro`, `src/components/runs/ActiveRunCard.astro`, `src/components/runs/DashboardRunCard.astro` (and `RunPreviewCard.astro` if it receives `completedAt` — show the same chip for one code path; public Incoming will stay null)

**Intent**: Anyone who can view the run can tell it is completed; lists do not look like a normal in-progress session.

**Contract**: Show a **Completed** chip (same visual weight as In progress / Archived) only when `completedAt` is set **and** the run is still audience-active (`lifecyclePhase !== "archived"`). Do not also show In progress. After Archive, Past, Recent, and archived `/runs/{id}` stay **Archived** — Archived wins; do not render Completed on those surfaces. Guests/non-members still 404 via existing SELECT. Dashboard Incoming Edit link hidden when completed (`showEdit && !completedAt`). `RunParticipantActions`: pass a roster-frozen flag (or omit mutation controls) when completed — confirmed roster stays visible read-only; apply / leave / decide / kick hide. `canPostOrLike` unchanged (still confirmed && !archived && !banned).

#### 3. Edit page

**File**: `src/pages/runs/[id]/edit.astro` (via `getOwnedActiveRunForEdit`)

**Intent**: Completed runs have no edit form.

**Contract**: Completed audience-active clan-only runs 404 on `/runs/{id}/edit` like inactive (existing missing page). No extra banner.

#### 4. AGENTS.md

**File**: `AGENTS.md` (Hard Rules paragraph that already documents archive/extend)

**Intent**: Agents must not treat Complete as Archive or as points.

**Contract**: Document `POST /api/runs/{id}/complete` (clan owner, in-progress clan_only, one-shot). `completed_at` is DEFINER-only — no GRANT UPDATE. Complete ≠ archive: does not stamp `archived_at`, does not free the 5-cap, comments stay writable until Archive. After complete, freeze join/leave/decide/kick/withdraw/edit/extend. Clan points stay frozen until S-23. Do not invent officer Complete. Do not add an admin verify queue.

### Success Criteria:

#### Automated Verification:

- `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual Verification:

Local app (typically `http://localhost:4321`) with Supabase already running:

1. Clan owner, in-progress clan-only run: Complete confirm → chip **Completed** on detail; Clan section + dashboard Incoming show Completed; Edit gone; Extend gone; Archive still there; comments still post (including a screenshot if S-20 is available); apply/leave/decide/kick fail; `clans.points` unchanged.
2. Upcoming clan-only: no Complete button; API `not_in_progress` if forced.
3. Archive after Complete: leaves active list, frees 5-cap, comments stop (existing archive behavior); Past, Recent, and archived `/runs/{id}` show **Archived** (not Completed). Completed only appears while the run is still audience-active (`lifecyclePhase !== "archived"`).
4. Non-member / guest: clan-only URL still 404. Friends-only / public organizer: no Complete button.
5. Other clan owner cannot complete this run.
6. Admin sees Completed chip if they can view; Admin Archive/Delete unchanged; no verify control.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`. Do not add Vitest for this slice.

### Integration Tests:

- Phase 1 SQL smoke (authenticated role) listed above is the integration contract.
- Phase 2: cookie-session POST complete + frozen mutations + comment still writable.
- Phase 3: browser path on `/runs/{id}`, `/runs`, `/dashboard`.

### Manual Testing Steps:

1. Start local Supabase + `npm run dev`. Open `http://localhost:4321/runs/{id}` as the clan owner of an in-progress clan-only run.
2. Complete → Completed chip, roster frozen, comments still work, points unchanged, 5-cap still occupied (`/runs/new` still blocked if already at 5).
3. Archive → Past / 5-cap frees; Past, Recent, and archived `/runs/{id}` show Archived (not Completed).
4. Negative: upcoming, other member, other clan owner, public run, guest.

## Performance Considerations

`completed_at` is a nullable scalar on `runs` already fetched by `RUN_SELECT`. No extra list query. Roster-open helper is STABLE SQL on column args (same shape as `is_run_active_row`).

## Migration Notes

- Additive nullable column; no backfill. Existing clan-only runs become completable once in-progress.
- Forward-only. Revert would be a follow-up migration (do not edit this one after apply).
- `complete_clan_run` is the only app writer of `completed_at` after GRANT is closed.

## References

- PRD: `context/foundation/prd-v2.md` FR-021, US-02 (not v1 `prd.md` FR-021)
- Roadmap: `context/foundation/roadmap.md` S-22 (`complete-clan-run`); S-23 owns verify + points
- S-21: `context/archive/2026-08-31-clan-runs/`
- S-24: `context/archive/2026-08-31-manual-archive-and-extend/`
- Similar RPC/API: `archive_run` / `src/pages/api/runs/[id]/archive.ts` / `OrganizerRunLifecycleControls.tsx`
- Lessons: `context/foundation/lessons.md` (no raw PostgREST in `?error=`; local URLs at manual gates)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: SQL contract — `completed_at`, DEFINER complete, roster freeze

#### Automated

- [x] 1.1 Migration applies on local Supabase — 8412266
- [x] 1.2 `npm run db:types` succeeds; `completed_at` and `complete_clan_run` appear in generated types — 8412266
- [x] 1.3 SQL smoke: complete stamps, points unchanged, comments still insert, roster/extend frozen (pending INSERT, confirmed leave DELETE, organizer participant UPDATE fail), GRANT closed — 8412266
- [x] 1.4 SQL smoke negatives: non-organizer `not_found`, public `not_clan_only`, upcoming `not_in_progress` — 8412266

#### Manual

- [x] 1.5 Local Supabase running; smoke SQL replayable from the SQL editor if desired — 8412266

### Phase 2: App API — complete service, freeze gates, error strings

#### Automated

- [x] 2.1 `npx astro sync` and `npm run lint` pass — bd48c2f
- [x] 2.2 `npm run build` passes — bd48c2f
- [x] 2.3 `completeClanRun` and `completedAt` typecheck against generated types — bd48c2f

#### Manual

- [x] 2.4 Owner POST complete redirects; repeat shows already-completed domain error — bd48c2f
- [x] 2.5 Apply / leave / extend / edit fail; comment post still works; points unchanged — bd48c2f
- [x] 2.6 Non-owner and guest POSTs do not leak (missing/sign-in, not 403) — bd48c2f

### Phase 3: Owner Complete control, Completed chip, AGENTS.md

#### Automated

- [x] 3.1 `npx astro sync`, `npm run lint`, and `npm run build` pass — 907970f

#### Manual

- [x] 3.2 Owner Complete confirm → Completed chip on detail, Clan, dashboard; Edit/Extend gone; Archive stays; comments still post; roster frozen; points unchanged — 907970f
- [x] 3.3 Upcoming has no Complete button — 907970f
- [x] 3.4 Archive after Complete leaves the active list and frees the 5-cap; Past, Recent, archived `/runs/{id}` show Archived not Completed — 907970f
- [x] 3.5 Guest/non-member 404; public/friends-only have no Complete — 907970f
- [x] 3.6 Other clan owner cannot complete this run — 907970f
- [x] 3.7 Admin sees Completed if they can view; Archive/Delete unchanged; no verify control — 907970f
