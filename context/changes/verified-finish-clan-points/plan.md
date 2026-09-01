# Admin verified-finish and clan points Implementation Plan

## Overview

Ship S-23 / PRD v2 FR-019, FR-022, FR-023, FR-018 (US-02): an **admin** can mark a **completed** clan-only run as verified-finish after checking in-game `/teamrank`. Only that mark adds `maps.points` to the organizer’s clan and moves public `/clans` ranking. Complete still does not award. No `/teamrank` scrape, no officer UI, no admin verify queue.

## Current State Analysis

S-22 already stamped `runs.completed_at` via DEFINER `complete_clan_run` (organizer + current clan owner + in-progress `clan_only`). Complete freezes roster/edit/extend, does **not** archive, does **not** free the 5-cap, and does **not** touch `clans.points`. Comments and screenshots stay writable until Archive (`is_run_in_active_window` ignores `completed_at`). Admin already opens any run, reads comments, and mints signed screenshot URLs.

Clan points are honest zeros. `clans.points` defaults to 0; INSERT requires `points = 0`; column GRANT UPDATE on `clans` is `(name, tag, picture_path, updated_at)` only; trigger `clans_freeze_points_and_owner` copies `old.points` on every UPDATE — including a DEFINER `UPDATE`. `/clans` already `ORDER BY points DESC, name, id`. There is no `verified_at` column and no award RPC.

A run stores at most one `map_id`. S-27 `run_maps` is unshipped. There is no `runs.clan_id`; award target is `clans.owner_id = runs.organizer_id`. Closest UI copy is `AdminRunControls` + `POST /api/admin/runs/{id}/archive`. Closest product analog for “checked in-game by hand” is `POST /api/admin/users/{id}/points-verified`.

## Desired End State

- Admin can Mark verified-finish on a **completed** `clan_only` run that is not already verified, including after Archive. Non-admins never see the control; hitting the API is 403 / redirect `/` (copy admin archive), not a restricted-run leak on the page.
- `verified_at` is set once. No un-verify. The same transaction adds `maps.points` for `runs.map_id` onto the clan whose `owner_id` equals `runs.organizer_id`. Retry returns `already_verified` and does not add again.
- Complete, Archive, comments, 5-cap, and roster freeze are unchanged. `verified_at` stays off `is_run_active_row` / `is_run_in_active_window` / `is_run_roster_open_row`.
- Category-only / map-less completed runs cannot be verified (`no_map` — no stamp, no award). Empty confirmed roster is allowed (admin judgment). No screenshot SQL gate.
- Anyone who can already view `/runs/{id}` sees a **Verified-finish** chip after the stamp, including archived. `/clans` ranking moves because `listClans` already sorts by `points`. Guests still 404 on clan_only.
- `clans.points` remains unwitable from PostgREST. The only writer is the new DEFINER RPC (GUC bypass on the freeze trigger).

### Key Discoveries:

- A naive `UPDATE clans SET points = points + n` is a no-op today because `clans_freeze_points_and_owner` always assigns `new.points := old.points` (`supabase/migrations/20260831110000_admin_clan_update.sql`). S-23 must change that trigger (GUC like `app.clan_delete_teardown` in `20260831115700_clan_friend_invites.sql`), not GRANT `points` to `authenticated`.
- `runs_update_admin` is unbounded on granted columns (`20260729134008_run_domain_schema.sql`). Keep `verified_at` / `completed_at` / `archived_at` / `extended_until` off the GRANT list, same as S-22.
- Award target cannot be `runs.clan_id` (does not exist). Organizer and `owner_id` are both frozen. Clan delete does not cascade to runs — verify must fail closed (`no_clan`) if that clan row is gone.
- Admin archive HTTP (`src/pages/api/admin/runs/[id]/archive.ts`) already 403s non-admins before the RPC. Verify RPC must still `is_admin()` and treat everyone else as `not_found` (copy `archive_run`’s leak family, **not** `complete_clan_run`’s organizer-only `not_found`).
- Latest migration stamp to beat: `20260901083008_complete_clan_run.sql`. Types are generated (`npm run db:types`); do not hand-edit `src/types/database.ts`.
- No Vitest/Jest in `package.json`.

## What We're NOT Doing

- Scraping `/teamrank` or any TeeWorlds client hook
- Awarding points from `complete_clan_run` (do not hook Complete)
- Admin verify queue / `/admin/runs` list (junk-in-queue accepted; detail-only)
- Officer role or officer verify UI
- `runs.clan_id` or live-membership award
- Un-verify / subtract points
- SQL screenshot gate or a new screenshot type
- Requiring a confirmed roster
- Folding `verified_at` into audience-active, roster-open, 5-cap, or comment-write
- Calling `archive_run` from verify
- GRANT UPDATE on `clans.points` or `runs.verified_at` to PostgREST
- Changing `listClans` sort (already `points DESC`)
- Verified chip on list cards (detail `/runs/{id}` only)
- S-27 multi-map sum
- Vitest/Jest/pgTAP
- Prefix-protecting `/runs` or `/clans`

## Implementation Approach

One additive migration (`verified_at` + freeze-trigger GUC + DEFINER `verify_clan_run_finish` + GRANT closed) → regenerate types → map `verifiedAt` on run DTOs → `POST /api/admin/runs/{id}/verify-finish` → AdminRunControls button + Verified-finish chip + AGENTS.md.

Canonical predicates (unchanged except the new stamp):

- **Audience-active**: `archived_at IS NULL AND (extended_until IS NULL OR extended_until > now())` — ignore `completed_at` and `verified_at`
- **Verify-eligible**: `visibility = 'clan_only'` AND `completed_at IS NOT NULL` AND `verified_at IS NULL` AND `map_id IS NOT NULL` AND caller `is_admin()` AND a clan row exists with `owner_id = organizer_id` AND a `maps` row exists for `map_id` — **independent of** `archived_at`

## Critical Implementation Details

**Do not put `verified_at` on `is_run_active_row`, `is_run_in_active_window`, or `is_run_roster_open_row`.** Verifying must not look like archive (lists, 5-cap, comments) and must not re-open the roster.

**Stamp then award in one transaction, with the stamp as the one-shot.** `UPDATE runs SET verified_at = now() WHERE id = … AND verified_at IS NULL`; if `NOT FOUND` return `already_verified` and do not touch `clans`. Then `set_config('app.clan_points_award', '1', true)` (transaction-local) and `UPDATE clans SET points = points + delta`. A 0-row clan `UPDATE` does **not** raise in Postgres — after that statement, require row count 1; if 0, `RAISE EXCEPTION` (do **not** `RETURN 'no_clan'`). Soft-returning after the stamp would commit an award-less one-shot and block retry via `already_verified`. A real exception (check, lock, raise) still rolls back the stamp. Do not award first then stamp — a failed stamp after a successful add would double-count on retry.

**GUC is not a second writer.** Authenticated still has no GRANT on `clans.points`, so PostgREST cannot UPDATE points even if a client could set the GUC. Only the DEFINER RPC (table owner) plus the trigger bypass can change the value. The trigger must still freeze `owner_id` and `created_at` while the GUC is on.

**Admin actor, not organizer.** Copy `archive_run`’s `is_admin()` branch. Admin who is not the clan owner still verifies. Non-admin RPC → `not_found`. HTTP layer still 403 / redirect `/` like other `/api/admin/*` run routes.

## Phase 1: SQL contract — `verified_at`, freeze-trigger GUC, DEFINER verify

### Overview

Land the stamp and the only points writer in Postgres so PostgREST cannot write either, Complete still cannot award, and verify can run after Archive.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_verify_clan_run_finish.sql` (via `npx supabase migration new verify_clan_run_finish`; stamp after `20260901083008`)

**Intent**: Add a one-shot verified-finish stamp and a DEFINER award path that bypasses the points freeze without opening PostgREST UPDATE on `clans.points`.

**Contract**:

- `ALTER TABLE public.runs ADD COLUMN verified_at timestamptz` (nullable, no default). Comment: admin verified-finish (S-23); awards clan points; not archive; not Complete.
- No backfill — existing rows stay null.
- Do **not** replace `is_run_active_row`, `is_run_in_active_window`, `is_run_roster_open_row`, `can_view_run`, `complete_clan_run`, `archive_run`, comment policies, or the 5-cap trigger.
- Replace `clans_freeze_points_and_owner` so that when `current_setting('app.clan_points_award', true) = '1'` it **does not** copy `old.points` (allow `new.points`). Always keep `new.owner_id := old.owner_id`, `new.created_at := old.created_at`, `new.updated_at := now()`. When the GUC is unset/other, keep today’s `new.points := old.points`. Optional hardening: while GUC is on, still reject `new.points < old.points` (no subtract writer this slice).
- `verify_clan_run_finish(p_run_id uuid) RETURNS text`, `SECURITY DEFINER`, `SET search_path = ''`. `REVOKE ALL` from `public`, `anon`; `GRANT EXECUTE` to `authenticated` only. Soft codes (no raise for business cases):

  | Code | When |
  | --- | --- |
  | `not_authenticated` | no `auth.uid()` |
  | `not_found` | missing row **or** `NOT is_admin()` (do not leak restricted runs; do not copy Complete’s organizer-only `not_found`) |
  | `not_clan_only` | admin but `visibility <> 'clan_only'` |
  | `not_completed` | `completed_at IS NULL` |
  | `already_verified` | `verified_at IS NOT NULL` (before any clan UPDATE) |
  | `no_map` | `map_id IS NULL` **or** no `maps` row for that id — **no stamp, no award** |
  | `no_clan` | no `clans` row with `owner_id = organizer_id` — **no stamp, no award** |
  | `verified` | stamp `verified_at = now()` where still null, then add `maps.points` to that clan |

  Do not skip `is_not_banned()` for a different reason than archive: admin path skips banned (copy `archive_run`). Do not require confirmed participants. Do not require screenshot comments. Do not call `archive_run`. Do not `UPDATE` `completed_at` / `archived_at` / `extended_until`. Do not use `runs.min_points` or `profiles.kog_points`. Delta is `maps.points` for the single `map_id` (including `0` if the catalog says 0 — that is not `no_map`).
- After guards, one-shot `UPDATE public.runs SET verified_at = now() WHERE id = p_run_id AND verified_at IS NULL`; `NOT FOUND` → `already_verified`. Then `PERFORM set_config('app.clan_points_award', '1', true)` and `UPDATE public.clans SET points = points + v_delta WHERE id = v_clan_id` (qualify `public.*`). `is_local = true` so the GUC dies with the transaction. After the clan `UPDATE`, `GET DIAGNOSTICS` / `FOUND` must show 1 row; if 0, `RAISE EXCEPTION` so `verified_at` rolls back (a 0-row `UPDATE` is success in Postgres; `RETURN 'no_clan'` here would commit the stamp).
- Re-assert column grants on `runs`: `REVOKE UPDATE ON public.runs FROM authenticated`; `GRANT UPDATE (title, map_id, map_category, starts_at, max_participants, min_points, join_mode, visibility)` only — **not** `verified_at`, **not** `completed_at`, **not** `archived_at`, **not** `extended_until`, **not** `organizer_id`.
- Do **not** add `points` to `GRANT UPDATE` on `clans`. Leave `clans_update_admin` RLS as-is (admin rename still cannot PostgREST-write points).

#### 2. Generated types

**File**: `src/types/database.ts` (via `npm run db:types`)

**Intent**: Expose `runs.verified_at` and `verify_clan_run_finish` to the app.

**Contract**: Regenerated `Tables<"runs">` includes `verified_at: string | null`. `Functions["verify_clan_run_finish"]` args `{ p_run_id: string }` returns `string`. No hand-edits.

### Success Criteria:

#### Automated Verification:

- Migration applies on local Supabase (`npx supabase migration up` or `npx supabase db reset` as the implementer already uses).
- `npm run db:types` succeeds; `verified_at` and `verify_clan_run_finish` appear in `src/types/database.ts`.
- SQL smoke as **authenticated admin** (not superuser): `verify_clan_run_finish` on a completed clan-only run with a map returns `verified`; `verified_at` set; that clan’s `points` increased by `maps.points`; second call returns `already_verified` and points unchanged; `complete_clan_run` on a different in-progress clan-only run still does not change `clans.points`; `archive_run` then `verify_clan_run_finish` still returns `verified` on a completed-then-archived clan-only run; comment `INSERT` still succeeds on a completed **audience-active** verified run; direct `UPDATE runs SET verified_at = now()` as authenticated fails (GRANT); direct `UPDATE clans SET points = points + 1` as authenticated does not change points (GRANT and/or freeze without GUC).
- SQL smoke negatives: non-admin → `not_found`; completed clan-only with `map_id` null → `no_map` and `verified_at` still null and points unchanged; not-yet-completed clan-only → `not_completed`; public completed-impossible / non-clan_only → `not_clan_only` if the row exists.

#### Manual Verification:

- Local Supabase is running so the smoke SQL can be replayed from the SQL editor if the implementer wants a second look.
- No UI required this phase.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: App API — DTO, verify service, admin HTTP

### Overview

Cookie-session `POST /api/admin/runs/{id}/verify-finish` calls the RPC. Run DTOs carry `verifiedAt` so the later chip and button do not re-fetch. No button yet.

### Changes Required:

#### 1. Run DTO + selects

**File**: `src/lib/services/runs.ts`

**Intent**: Carry `verifiedAt` on run DTOs (active and archived) so detail can show the chip after Archive.

**Contract**: Add `verifiedAt: string | null` to `RunListItem` (archived variants inherit). Include `verified_at` in `RUN_SELECT` and `RunRow`. Map it in `runFieldsFromRow`. In `runRowFromPublicRpc`, set `verified_at: null` (same as `completed_at`). Do **not** alter `list_player_public_runs`. Do **not** make `mapRunRow` return null when `verified_at` is set. `countAudienceActiveRunsForOrganizer` still ignores `verified_at`. `listClans` unchanged.

#### 2. Verify service

**File**: `src/lib/services/runs.ts`

**Intent**: Wrap `verify_clan_run_finish` like `archiveRun` / `completeClanRun`.

**Contract**: `verifyClanRunFinish(supabase, runId): Promise<void>`. Map outcomes:

- `verified` → return
- `already_verified` → `RunError` “This clan run is already verified.”
- `not_completed` → `RunError` “This clan run is not completed yet”
- `not_clan_only` → `RunError` “Only a completed clan-only run can be marked verified-finish”
- `no_map` → `RunError` “This clan run has no map, so clan points cannot be awarded”
- `no_clan` → `RunError` “This organizer has no clan to award points to”
- `not_found` / `not_authenticated` → `RunError` “Run not found or no longer active”
- unknown / PostgREST → log `console.error`; `RunError` “Could not verify this clan run” — never `err.message` in `?error=`

Do not pre-check `is_admin()` inside the wrapper beyond what the HTTP route already does (role check lives on the route). Do not `UPDATE` `clans` from the app. Do not call `completeClanRun`.

#### 3. HTTP route

**File**: `src/pages/api/admin/runs/[id]/verify-finish.ts`

**Intent**: Admin-only cookie-session POST on the run, copied from `src/pages/api/admin/runs/[id]/archive.ts`.

**Contract**: `POST` only. `isUuid` → `commentInvalidRun`. Unconfigured supabase / signed-out → same helpers as admin archive. `profile?.role !== "admin"` → JSON 403 or redirect `/` (`wantsJson`). Call `verifyClanRunFinish`. Success redirect `/runs/{id}` (`commentJson` when `wantsJson`). Failures via `runFail` with `RunError.message`. Do not add this path to `PROTECTED_ROUTES` (`/api/admin/*` is not prefix-protected; the route checks role). No organizer `/api/runs/{id}/verify-finish`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` and `npm run lint` pass.
- `npm run build` passes (Worker bundle includes the new route).
- Typecheck: `verifyClanRunFinish` and `verifiedAt` compile against generated types.

#### Manual Verification:

- While signed in as admin, `POST /api/admin/runs/{id}/verify-finish` on a completed clan-only run with a map redirects to `/runs/{id}` (no UI button yet). Repeat → already-verified domain message in `?error=` (no raw PostgREST). That clan’s points on `/clans` / `/clans/{id}` increased by the map’s points.
- Same admin: Complete on a different run still does not change points; verify after Archive still succeeds.
- Non-admin signed-in POST → 403 JSON or redirect `/`. Guest POST → sign-in. Map-less completed clan-only → `no_map` domain string; `verified_at` still null.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Admin control, Verified-finish chip, AGENTS.md

### Overview

Admin can Mark verified-finish from `/runs/{id}` with an Archive-style confirm. Viewers who can already see the run get a Verified-finish chip, including after Archive. Docs record that points move only here.

### Changes Required:

#### 1. Admin Mark verified-finish

**Files**: `src/components/runs/AdminRunControls.tsx`, `src/pages/runs/[id].astro`

**Intent**: Put the control in the existing Admin section next to Archive/Delete, only when the run is a completed unverified clan-only run.

**Contract**: Pass `showVerifyFinish` (name as implementer prefers) when `visibility === "clan_only"` AND `completedAt` set AND `verifiedAt` null. Show even when archived. Confirm copy (`window.confirm`, same pattern as Archive): admin should have checked in-game `/teamrank` that declared participants finished; this awards clan points from the map and cannot be undone. POST `/api/admin/runs/{id}/verify-finish`. Hide the button after `verifiedAt` is set. Keep Archive (if still audience-active) and Delete. Do not add an `/admin` queue. Do not add organizer verify. Optional: omit the button when `run.map` is null (RPC would `no_map`); if shown, the domain error from Phase 2 is enough.

#### 2. Verified-finish chip

**File**: `src/pages/runs/[id].astro`

**Intent**: Anyone who can view the run can tell ranking moved because this session was verified, including after Archive.

**Contract**: When `verifiedAt` is set, show a **Verified-finish** status chip (same visual weight as Completed / Archived) for every viewer who can already open `/runs/{id}`. Keep showing it when `lifecyclePhase === "archived"` (do not hide with Archived — verify is allowed post-archive). When verified and still audience-active, show **Verified-finish** instead of **Completed** (verified wins over the Completed chip; do not stack both). When verified and archived, show **Archived** and **Verified-finish**. Today `showCompletedChip` is also what hides the In progress chip (`src/pages/runs/[id].astro`: `lifecyclePhase === "in_progress" && !showCompletedChip`). After Complete a clan-only run is still `in_progress` until Archive. Substituting Verified-finish for Completed must keep that suppression (completed **or** verified hides In progress). Do not clear `showCompletedChip` in a way that re-shows In progress next to Verified-finish. Guests/non-members still 404 via existing SELECT. Do not add the chip to `ActiveRunCard` / `DashboardRunCard` / `RunPreviewCard` this slice. `canPostOrLike` unchanged.

#### 3. Complete copy stays honest

**File**: `src/components/runs/OrganizerRunLifecycleControls.tsx`

**Intent**: Complete still does not award points.

**Contract**: Keep the existing confirm string that Complete does not archive and does not award clan points. Do not add a verify control there.

#### 4. AGENTS.md

**File**: `AGENTS.md` (Hard Rules paragraph that currently says clan points stay frozen until S-23)

**Intent**: Agents must not award on Complete, must not GRANT points/`verified_at`, and must not invent a queue or officer UI.

**Contract**: Replace “Clan points stay frozen until S-23” with: admin verified-finish is `POST /api/admin/runs/{id}/verify-finish` (admin-only, completed `clan_only`, one-shot, allowed after Archive). `verified_at` is DEFINER-only — do not GRANT UPDATE on `verified_at` or `clans.points`. Points writer is `verify_clan_run_finish` (GUC bypass on `clans_freeze_points_and_owner`); Complete still must not award. Do not invent officer verify. Do not add an admin verify queue. Keep Complete ≠ archive, comment-write-until-Archive, and closed GRANTs on `completed_at` / `archived_at` / `extended_until`. Admin clan rename on `/clans/{id}` still must not PostgREST-write points.

### Success Criteria:

#### Automated Verification:

- `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual Verification:

Local app (typically `http://localhost:4321`) with Supabase already running:

1. Admin, completed clan-only run with a map: confirm Mark verified-finish → **Verified-finish** chip on `/runs/{id}`; button gone; `/clans` ranking / `/clans/{id}` points increased by that map’s points; comments still post while audience-active; Complete confirm still says it does not award points.
2. Archive first, then verify: still works; archived `/runs/{id}` shows **Archived** and **Verified-finish**; screenshot signed URLs still load for admin.
3. Repeat verify: already-verified domain error; points unchanged.
4. Map-less completed clan-only: no successful award (button omitted or `no_map` error); `verified_at` null.
5. Non-admin: no Admin verify control; POST → 403/`/`. Guest/non-member clan_only URL still 404.
6. Owner Complete on a new clan-only run: Completed chip, points unchanged until admin verifies.
7. Empty confirmed roster: admin can still verify if they choose.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`. Do not add Vitest for this slice.

### Integration Tests:

- Phase 1 SQL smoke (authenticated admin role) listed above is the integration contract.
- Phase 2: cookie-session admin POST verify-finish + domain errors + Complete still does not award.
- Phase 3: browser path on `/runs/{id}`, `/clans`, `/clans/{id}`.

### Manual Testing Steps:

1. Start local Supabase + `npm run dev`. Open `http://localhost:4321/runs/{id}` as admin on a completed clan-only run with a map (screenshot thread optional).
2. Mark verified-finish → chip, ranking moved, button gone, no undo.
3. Archive-then-verify and verify-then-archive both leave points awarded once.
4. Negatives: non-admin, guest, map-less, already verified, Complete-only (points still 0).

## Performance Considerations

`verified_at` is a nullable scalar on `runs` already fetched by `RUN_SELECT`. No extra list query. `/clans` sort is unchanged. Award is one clan row UPDATE. No `clans.points` index (accepted at S-18; table is small).

## Migration Notes

- Additive nullable column; no backfill. Existing completed clan-only runs become verifiable; ranking stays zeros until an admin marks them.
- Forward-only. Revert would be a follow-up migration (do not edit this one after apply). Un-verify / subtract is out of slice — a mistaken award is later-tool residual risk.
- `verify_clan_run_finish` is the only app writer of `verified_at` and of `clans.points` after GRANT stays closed.
- Category-only completed runs are permanently unverifiable this slice (edit frozen after Complete; S-27 unshipped).

## References

- PRD: `context/foundation/prd-v2.md` FR-019, FR-022, FR-023, FR-018, FR-030, US-02 (not v1 `prd.md`)
- Roadmap: `context/foundation/roadmap.md` S-23 (`verified-finish-clan-points`)
- Research: `context/changes/verified-finish-clan-points/research.md`
- Crew decisions: `context/changes/verified-finish-clan-points/crew-decisions.md`
- S-22: `context/archive/2026-09-01-complete-clan-run/`
- S-20: `context/archive/2026-08-31-comment-screenshots/`
- S-18: `context/archive/2026-08-27-create-clan-directory/`
- Similar RPC/API: `archive_run` / `src/pages/api/admin/runs/[id]/archive.ts` / `src/components/runs/AdminRunControls.tsx`
- GUC pattern: `app.clan_delete_teardown` in `supabase/migrations/20260831115700_clan_friend_invites.sql`
- Lessons: `context/foundation/lessons.md` (no raw PostgREST in `?error=`; local URLs at manual gates; default branch `main`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: SQL contract — `verified_at`, freeze-trigger GUC, DEFINER verify

#### Automated

- [x] 1.1 Migration applies on local Supabase
- [x] 1.2 `npm run db:types` succeeds; `verified_at` and `verify_clan_run_finish` appear in generated types
- [x] 1.3 SQL smoke: verify stamps and awards once; Complete does not award; archive-then-verify works; comments still insert while audience-active; GRANT closed on `verified_at` and `clans.points`
- [x] 1.4 SQL smoke negatives: non-admin `not_found`, `no_map` does not stamp, `not_completed`, `not_clan_only`

#### Manual

- [ ] 1.5 Local Supabase running; smoke SQL replayable from the SQL editor if desired

### Phase 2: App API — DTO, verify service, admin HTTP

#### Automated

- [ ] 2.1 `npx astro sync` and `npm run lint` pass
- [ ] 2.2 `npm run build` passes
- [ ] 2.3 `verifyClanRunFinish` and `verifiedAt` typecheck against generated types

#### Manual

- [ ] 2.4 Admin POST verify-finish redirects; repeat shows already-verified domain error; clan points increased by map points
- [ ] 2.5 Complete still does not change points; verify after Archive succeeds
- [ ] 2.6 Non-admin and guest POSTs do not leak (403/`/` / sign-in); map-less returns `no_map` and does not stamp

### Phase 3: Admin control, Verified-finish chip, AGENTS.md

#### Automated

- [ ] 3.1 `npx astro sync`, `npm run lint`, and `npm run build` pass

#### Manual

- [ ] 3.2 Admin confirm → Verified-finish chip; button gone; `/clans` ranking moved; comments still post while audience-active; Complete copy still says no points
- [ ] 3.3 Archive then verify: archived detail shows Archived and Verified-finish; signed screenshot URLs still work for admin
- [ ] 3.4 Repeat verify: already-verified domain error; points unchanged
- [ ] 3.5 Map-less completed clan-only cannot award
- [ ] 3.6 Non-admin has no verify control; guest/non-member clan_only still 404
- [ ] 3.7 Owner Complete does not change points until admin verifies
- [ ] 3.8 Empty confirmed roster can still be verified
