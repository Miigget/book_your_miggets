<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Map poll (S-28 / FR-010) Implementation Plan

- **Plan**: context/changes/map-poll/plan.md
- **Mode**: Deep
- **Date**: 2026-09-10
- **Verdict**: SOUND
- **Findings**: 0 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

Grounding: 15/15 paths ✓ (`src/lib/run-maps.ts`, `src/lib/services/runs.ts`, `src/pages/runs/[id].astro`, `src/components/runs/MapPicker.tsx`, `src/pages/api/runs/[id]/archive.ts`, `src/pages/api/runs/[id]/index.ts`, `src/components/runs/CreateRunForm.tsx`, `src/pages/runs/[id]/edit.astro`, `src/middleware.ts`, `src/types/database.ts`, `src/components/runs/RunComments.tsx`, `src/lib/comment-mutation-http.ts`, `supabase/migrations/20260904130749_run_maps.sql`, `supabase/migrations/20260901140012_run_auto_join_min.sql`, `AGENTS.md`; new files `polls.ts` / `RunPoll.tsx` / poll API routes / migration timestamped as specified), 8/8 symbols ✓ (`prepareOwnedActiveRunPatch`, `mapRunWriteError`, `normalizeRunMapsAndCategory`, `set_run_visibility_and_invites` 13-arg, `enforce_run_update_invariants`, `is_run_roster_open_row`, `listMapsForPicker`, `runFail`/`commentFail`), brief↔plan ✓ (Crew locks match: `map_id` + XOR, not `run_maps`; comment-write votes; hide tallies; UNIQUE one poll; create roster-open / close after Complete; 2–8; add-order tie; `no_votes`; edit freeze).

Code verification:

- Invite setter live body is `20260904130749_run_maps.sql:259-360` (13 args). `map_id = p_map_id` always (`:320-325`); `p_map_ids` NULL skips junction only. App `setRunVisibilityAndInvites` always passes `p_map_id` + `p_map_ids` (`runs.ts:1563-1576`).
- `enforce_run_update_invariants` latest is `20260901140012_run_auto_join_min.sql:288-329` (DEFINER); join_mode/auto_join_min only. Copying that body + `map_id_locked` does not revert a later invariant.
- `runs_update_own` requires `is_run_roster_open_row` (`20260901083008_complete_clan_run.sql:42-54`) so close-after-Complete must be DEFINER. `extend_run` organizer-only (`:183-186`); admin non-owner → `not_found`.
- `prepareOwnedActiveRunPatch` select does **not** include `map_id`/`map_category` today (`runs.ts:1163-1166`); `updateRun` always patches both from normalize (`:1488-1502`). Plan’s “extend the existing load select” is required.
- `detailMaps` fallback: `run.maps.length > 0 ? run.maps : run.map ? [run.map] : []` (`[id].astro:141`). `showVerifyFinish` already keys off `run.map != null` (`:127`). `MapPicker` hardwires `name="map_ids"` and hidden `map_category` (`MapPicker.tsx:118-121`); no `includeCategoryField` yet. `/runs/{id}` is absent from `PROTECTED_ROUTES`. `npm run db:types` exists. Verify-finish still awards `runs.map_id` only (`20260901102315_verify_clan_run_finish.sql:93-99`).
- Progress mechanical contract: one `## Progress`; three phase headings match; every success-criteria bullet has a Progress checkbox; no `- [ ]` outside Progress.
- Blast radius: edit HTTP `src/pages/api/runs/[id]/index.ts` is not named (correct — it only calls `updateRun` / `setRunVisibilityAndInvites`). `MapPicker` is only used from `CreateRunForm` today. No extra callers of `replaceRunMaps` that would unlock `map_id`. Do not copy `run_is_public` (plan forbids it).

## Findings

### F1 — Empty playlist + closed poll duplicates the winner on detail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Locked map field; `[id].astro` `detailMaps`
- **Detail**: Close does not write `run_maps` and XOR-clears `map_category`. Research and Phase 3 both call out the category-only clan path (poll lock enables `showVerifyFinish`). On that path `run.maps` stays `[]` and `run.map` becomes the winner, so today’s fallback makes `detailMaps = [winner]` **and** the new Locked map row shows the same winner. The session-list-nonempty case is fine. Manual 3.4 (“session Maps list still shows `run_maps`”) does not spell the empty-junction case.
- **Fix**: When a closed poll exists, set `detailMaps` from `run.maps` only (no `run.map` fallback). Empty session section is allowed; Locked map + `run.map` embed still drive title and verify-finish.
- **Decision**: RESOLVED — Crew Lead applied the Fix to Phase 3 Locked map contract + 3.4 (SOUND one-liner; 2026-09-10)

### F2 — Phase 2 create route has no map_ids parse contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — HTTP routes (`poll.ts`)
- **Detail**: Create copies `archive.ts`, which has no body fields. `create_map_poll` needs `uuid[]`. Phase 3 `MapPicker` still posts repeated `map_ids` (`parseMapIdsFromForm` in `src/lib/run-maps.ts:16-22`). Phase 2 manual 2.3 (“organizer POST create”) does not say to parse that field, so Phase 2 could ship JSON `{ mapIds }` and then break the Phase 3 form.
- **Fix**: Phase 2 `POST /api/runs/{id}/poll` reads `parseMapIdsFromForm(form)` (same as create/edit) and passes that array to `createMapPoll`; cardinality 2–8 can stay `invalid_options` from the RPC.
- **Decision**: RESOLVED — Crew Lead applied the Fix to Phase 2 HTTP contract (`parseMapIdsFromForm`; 2026-09-10)

### F3 — Poll MapPicker still looks like optional run maps

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — MapPicker reuse
- **Detail**: `includeCategoryField={false}` removes the hidden category input but leaves label “Maps (optional)” and empty-state copy that the difficulty filter is the run category (`MapPicker.tsx:65-66, 113-116, 162-164`). Poll create requires 2–8 maps. Recoverable via `invalid_options`, but the picker will read as the run form.
- **Fix**: Optional `label` / `emptyHint` (or `capMessage` already planned) so the poll instance does not say optional or mention run category. Keep the difficulty **filter** select.
- **Decision**: RESOLVED — Crew Lead applied optional `label` / `emptyHint` to Phase 3 MapPicker contract (2026-09-10)

## Notes for implement

- Close-vs-freeze order in Critical Implementation Details is load-bearing and matches the live trigger: stamp `closed_at` **after** the `runs.map_id` write, and `SELECT … FOR UPDATE` the poll row on vote and close.
- Invite setter: `CREATE OR REPLACE` the **20260904130749** 13-arg body, not the 12-arg `20260901140012` copy. Skip `map_id` / `map_category` when a closed poll exists; still apply `p_map_ids`.
- `map_id_locked` must go through `mapRunWriteError` (lessons: never put PostgREST `Error.message` in `?error=`).
- Vote SELECT: own row while open; all rows only after `closed_at`; authenticated only; never `run_is_public`.
- Edit HTTP file does not need a poll branch if `prepareOwnedActiveRunPatch` returns locked `mapId` / `mapCategory`.
- Do not add poll paths to `PROTECTED_ROUTES`. Copy `extend_run` (not admin archive 403) for wrong-actor `not_found`.
- Locked Crew decisions are already in the plan — do not reopen them.
