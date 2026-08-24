<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Restricted run visibility Implementation Plan

- **Plan**: `context/changes/restricted-run-visibility/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-24
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations
- **Re-review**: after REVISE patch. Prior ⭐ F1–F5 (unverified UPDATE WITH CHECK, named invite-only RPCs, `can_view_run` inline window, guest/Welcome `publicOnly`, leftover invitee nicknames) **landed** in `plan.md` and `plan-brief.md` — do not re-triage those as open.

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 24/24 existing paths ✓, 1/1 new path expected-absent ✓ (`src/lib/run-list-sections.ts`), 15/15 symbols ✓, brief↔plan ✓.

Existing paths listed: `src/lib/services/runs.ts`, `src/pages/api/runs/index.ts`, `src/pages/api/runs/[id]/index.ts`, `src/components/runs/CreateRunForm.tsx`, `src/pages/runs/new.astro`, `src/pages/runs/[id]/edit.astro`, `src/pages/runs/index.astro`, `src/components/Welcome.astro`, `src/components/runs/ActiveRunCard.astro`, `src/pages/runs/[id].astro`, `src/lib/services/participants.ts`, `src/lib/services/friends.ts`, `src/lib/services/comments.ts`, `src/pages/dashboard.astro`, `src/types/database.ts`, `AGENTS.md`, and the cited migrations (`20260807104348`, `20260820124849`, `20260821130000`, `20260821120000`, `20260729134008`, `20260807123643`, `20260817125800`, `20260820092809`).

Symbols confirmed: `listActiveRuns` (`runs.ts:227-268`), `getActiveRunById` (`:271-291`), `RUN_SELECT` (`:52-76`), `isJoinMode` (`:535-539`), `updateRun` (`:612-736`), `loadActiveRunForMutation` (`participants.ts:158-182`; 404 string `"Run not found or no longer active"`), `listPublicFriends` (`friends.ts:146-179`; `public_profiles` select `id, nickname`), `requireActiveRun` (`comments.ts:63-79`), `canReadComments` (`[id].astro:91`), `are_friends`, `is_run_in_active_window` (DEFINER SELECT on `runs`, `:22-35` of comments migration), `auto_join_run` (`not_active` already mapped), `is_confirmed_participant`, `enforce_run_update_invariants`, `runs_update_own` (WITH CHECK is organizer + not banned + window only — F1 conjunct is additive), `joinModeLocked` (`CreateRunForm.tsx:245` omits `name` when locked), `isVerified={false}` stub on `edit.astro:114`.

Brief↔plan: MEDIUM / 3 phases, `run_invites` + `is_run_invitee`, live `are_friends` vs invite snapshot, 404 not 403, admin Restricted section, invite-only ≥1, confirmed keep SELECT / pending 404, public-only landing, guest `/runs` `publicOnly`, named INVOKER RPCs, unverified UPDATE WITH CHECK — all match. Progress mechanical contract holds (one `## Progress`, matching phase names, every success-criteria bullet has a `N.M` checkbox including added 2.15 / 2.16, no checkboxes outside Progress).

### Prior ⭐ F1–F5 (closed — present in current plan)

| Prior | Patch                                                                                                                                    | Landed                                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 A  | `runs_update_own` WITH CHECK copies INSERT (public OR currently verified); edit API same `?error=` as create; 2.1 / 2.16                 | Yes — Critical Implementation Details, Phase 1 `:105`, Phase 2 create/edit APIs, brief Key Decisions                                                          |
| F2 A  | Required `create_invite_only_run` + `set_run_visibility_and_invites`; invite-only edits UPDATE via RPC not `updateRun`+sync; both in 1.3 | Yes — drop “may”; Phase 2 “instead of `updateRun`”; RPC UPDATEs run row for S-13. **Residual:** published 3-arg signature vs columns to UPDATE (new F1 below) |
| F3    | `can_view_run` inlines window; never calls `is_run_in_active_window`                                                                     | Yes — one-way helper rule in Critical Implementation Details + Phase 1 contract                                                                               |
| F4    | Guest `/runs` and Welcome always `publicOnly`; signed-in `/runs` never                                                                   | Yes — Phase 3 partition, landing, dual-defense, 3.2                                                                                                           |
| F5    | Edit loads `public_profiles` nicknames for leftover snapshot invitee ids                                                                 | Yes — form + `edit.astro` contracts, 2.15, 2.11                                                                                                               |

Code verification (this pass): `updateRun` owns all edit validation (map exists, starts_at active, capacity parse, omit `join_mode` when locked) at `runs.ts:638-717`; the edit route (`api/runs/[id]/index.ts:40-49`) only forwards FormData into `updateRun`. Create already validates in the API then `.insert().select("id")` (`api/runs/index.ts:79-156`). `is_run_in_active_window` DEFINER-SELECTs `runs`; AND `can_view_run` is one-way only if `can_view_run` inlines the window (prior F3). `listActiveRuns` callers are only `/runs` and `Welcome.astro` (no blast-radius third catalog). Mutation/comment gates stay 404-on-SELECT-miss without extra phase files. No existing Worker multi-statement transaction; friend_requests `security invoker` is a view, not a write-RPC twin.

## Findings

### F1 — Invite-only writer RPC signature still omits the columns it must UPDATE

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 migration contract `set_run_visibility_and_invites` / `create_invite_only_run`; Phase 2 edit API
- **Detail**: Prior F2 A (closed) requires invite-only edits to call `set_run_visibility_and_invites` **instead of** `updateRun`, and the RPC to UPDATE the same patchable columns as today’s `updateRun` so S-13 `enforce_run_update_invariants` still fires. The published signature is only `(p_run_id uuid, p_visibility run_visibility, p_invitee_ids uuid[])` — labeled “identifying args” — with no parameters for `title`, `map_id`, `map_category`, `starts_at`, `max_participants`, `min_points`, optional `join_mode`. Postgres cannot apply those FormData values without args. A literal 3-arg `CREATE FUNCTION` either (a) patches only visibility + invites and silently drops title/time/capacity on every invite-only save, or (b) calls `updateRun` then the RPC (the F2 failure mode). The edit route has no validation of its own (`api/runs/[id]/index.ts:40-49`); that lives inside `updateRun` (`runs.ts:638-717`), including omitting `join_mode` when locked (`CreateRunForm.tsx:245` already drops `name`). `create_invite_only_run` has no `RETURNS` — create today does `.select("id").single()` then redirects `/runs/${run.id}` (`api/runs/index.ts:131-156`). Phase 2 manual 2.11 does not explicitly test “change title on an invite-only run,” so a no-op patch could ship.
- **Fix**: Expand `set_run_visibility_and_invites` args to the identifying triple **plus** the `updateRun` patch (`p_title`, `p_map_id`, `p_map_category`, `p_starts_at`, `p_max_participants`, `p_min_points`, `p_join_mode` nullable = leave `join_mode` unchanged). `create_invite_only_run` `RETURNS uuid`. Phase 2 invite-only edit: run the same normalize/validate as `updateRun` (extract a shared helper), then **one** RPC. Put Returns/Args in 1.3.
- **Decision**: PENDING
