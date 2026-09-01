<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Team-size bands under Advanced settings (S-26)

- **Plan**: `context/changes/team-size-scope/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-01
- **Verdict**: REVISE
- **Findings**: 0 critical 3 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 18/18 paths ✓, 12/12 symbols ✓, brief↔plan ✓, Progress mechanical ✓, no `docs/reference/contract-surfaces.md`.

Existing paths checked: `src/lib/run-limits.ts`, `src/lib/services/runs.ts`, `src/lib/services/participants.ts`, `src/pages/api/runs/index.ts`, `src/pages/api/runs/[id]/index.ts`, `src/components/runs/CreateRunForm.tsx`, `src/components/runs/RunParticipantActions.tsx`, `src/components/runs/DashboardRunCard.astro`, `src/pages/runs/[id].astro`, `src/pages/runs/[id]/edit.astro`, `src/types/database.ts`, `AGENTS.md`, `src/components/runs/RunListFilters.astro`, `src/components/runs/ActiveRunCard.astro`, `src/components/runs/RunPreviewCard.astro`, `supabase/migrations/20260901083008_complete_clan_run.sql`, `supabase/migrations/20260901102315_verify_clan_run_finish.sql`, `supabase/migrations/20260820124849_runs_update_active_invariants.sql`. New migration file correctly absent.

Symbols confirmed live: `auto_join_run` (latest body `20260901083008:78-155`, `not_auto_join` at `join_mode <> auto_join`, `full` at max only), `autoJoinRun` + `applyToRun` (`participants.ts:190-284`), `loadActiveRunForMutation` (returns `{ id, join_mode, organizer_id }` only), `formatJoinMode` (two-value exhaustive), `prepareOwnedActiveRunPatch` / `mapRunWriteError`, `pendingIds` (`runs.ts:407`, `approval_required` only), `DashboardRunCard` pending chip (`joinMode === "approval_required"`), `enforce_run_update_invariants` (`20260820124849:51-89`, includes `new.updated_at := now()`), `create_invite_only_run` live `20260831131219:313-398` (5-cap UX pre-check; INSERT list has no `auto_join_min`), `set_run_visibility_and_invites` live `20260824101006:519-599` (`join_mode = coalesce(...)`), grant list eight columns (`20260901102315:144-154`), `runRowFromPublicRpc` (`runs.ts:500-536`). Brief phases/decisions/scope match the plan and crew-locked ⭐ (NULL unset, freeze with join_mode, `band_full`, S-02 Accept, binary `formatJoinMode`, Join/Apply/full CTA, overlay any `join_mode`, no `ALTER TYPE`).

Code verification (riskiest claims):

1. **`band_full` fallthrough vs today’s confirmed post-check** — Confirmed. `autoJoinRun` is void and throws on unknown outcomes (`participants.ts:198-218`; `band_full` would hit `default`). `applyToRun` then **re-fetches and requires confirmed** (`:255-258`). Overlay cannot be “call `autoJoinRun` then pending-insert”; the whole `:253-260` branch must switch on the RPC outcome.
2. **Invite RPC signatures / DROP** — Confirmed. `CREATE OR REPLACE` cannot add args. Live create is `20260831131219` (not the earlier `20260824101006` body). Setter grants are tied to the 10-arg signature (`20260824101006:601-624`). `DROP FUNCTION` drops those grants.
3. **Grant list** — Confirmed eight columns; appending `auto_join_min` is required.
4. **`not_auto_join` gate** — Confirmed `join_mode <> auto_join` only; overlay must widen it when `auto_join_min IS NOT NULL`.
5. **`RunRow` / RPC mapper** — Confirmed. `list_player_public_runs` RETURNS TABLE has no `auto_join_min`. `runRowFromPublicRpc` builds a full `RunRow`. Adding `auto_join_min` to `RunRow` without stubbing the RPC mapper is a type error; public Incoming cards stay binary so `null` is the right stub.

Blast radius beyond the plan’s file list: `runRowFromPublicRpc` (required), `UpdateRunInput` / `PreparedRunPatch` / `CreateInviteOnlyRunInput` (implied by Phase 2 writers), `CreateRunForm.tsx` client `validate` (Phase 3). No second confirm writer. `decideParticipant` untouched (S-02). Cards (`ActiveRunCard`, `RunPreviewCard`, admin past-runs) only call `formatJoinMode` — leaving them alone matches scope.

## Findings

### F1 — Overlay apply still described as wrapping today’s confirmed-only helper

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Apply overlay (`participants.ts` `applyToRun` / `autoJoinRun`)
- **Detail**: The contract (“map `band_full` → pending insert; do not throw”) is right, but it tells the implementer that `autoJoinRun` “must stop assuming every RPC success is confirmed.” That assumption is not in `autoJoinRun` (void + switch). It is `applyToRun` after a successful RPC: load own row, throw `"Could not apply to this run"` unless `status === "confirmed"`, return confirmed only. If Phase 2 only adds `band_full` to the helper switch (return/throw) and leaves `:253-260`, overlay Apply never pending-inserts — last min-band loser gets a generic fail, or a void `band_full` success then the post-check fail. Desired end state (third player Apply-pends) would not hold.
- **Fix**: In Phase 2 Apply overlay, replace `applyToRun`’s `if (join_mode === "auto_join") { await autoJoinRun(); require confirmed }` block. Call `auto_join_run` when `join_mode === "auto_join" || auto_join_min != null`. Switch on the text outcome in `applyToRun` (or make `autoJoinRun` return the outcome string — do not keep it `Promise<void>`). `confirmed` / `already_confirmed` → existing confirmed return; `band_full` (and only then) → existing pending insert, return `{ status: "pending" }`; `full` → `"This run is already full"`; other outcomes unchanged. Never run the confirmed post-check after `band_full`.
  - Strength: Matches the live call shape; implementer cannot “fix the helper” and miss the post-check.
  - Tradeoff: `autoJoinRun` becomes a thin RPC+switch or is inlined; two call sites of the helper today (only `applyToRun`).
  - Confidence: HIGH — `:190-260` is the entire overlay seam.
  - Blind spot: None significant.
- **Decision**: FIXED — Crew Lead ⭐ Fix applied in re-plan (replace `applyToRun` confirmed post-check; `autoJoinRun` must not stay `Promise<void>`)

### F2 — Invite RPC DROP underspecifies live bodies and EXECUTE grants

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — `create_invite_only_run` / `set_run_visibility_and_invites` / `enforce_run_update_invariants`
- **Detail**: Phase 1 says DROP the old signatures and add params, and CREATE OR REPLACE the freeze trigger. It does not name the live SQL to copy. `create_invite_only_run` was replaced in `20260831131219` with a 5-cap UX pre-check (trigger still serializes); copying `20260824101006` would drop that pre-check. `DROP FUNCTION` of `set_run_visibility_and_invites(uuid, run_visibility, uuid[], text, uuid, text, timestamptz, integer, integer, join_mode)` also drops `GRANT EXECUTE … TO authenticated`. Column GRANT is called out; function GRANT after DROP is not. `enforce_run_update_invariants` must keep `new.updated_at := now()` plus change-gated `capacity_below_confirmed` — plan mentions the latter only.
- **Fix**: Phase 1: copy live bodies then edit. Create: DROP `(text, uuid, text, timestamptz, integer, integer, join_mode, uuid[])`, start from `20260831131219:313-398` (keep 5-cap pre-check), add `p_auto_join_min` to signature + INSERT, re-`REVOKE ALL` / `GRANT EXECUTE` to `authenticated`. Setter: DROP the current 10-arg list, start from `20260824101006:519-599`, add `p_update_auto_join_min` + `p_auto_join_min` with the CASE write, re-GRANT EXECUTE. Freeze trigger: copy `20260820124849:51-89` including `updated_at`, add `auto_join_min` distinct-from lock using `join_mode_locked`.
- **Decision**: FIXED — Crew Lead ⭐ Fix applied in re-plan (copy live bodies then DROP + re-GRANT EXECUTE)

### F3 — RunRow change misses `runRowFromPublicRpc`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Run DTOs (`runs.ts` `runRowFromPublicRpc`)
- **Detail**: Phase 2 adds `auto_join_min` to `RUN_SELECT` / `RunRow` / `runFieldsFromRow` / `RunListItem` and correctly does not change `list_player_public_runs` RETURNS TABLE. Guest Incoming/Recent still maps RPC rows through `runRowFromPublicRpc` (`runs.ts:500-536`), which constructs a complete `RunRow`. A required `auto_join_min` field without a stub fails typecheck. Cards stay binary so the stub is `null` (RPC-first seed in `listPlayerProfileRuns` would not show a team-size line anyway).
- **Fix**: In the Phase 2 DTO contract, set `auto_join_min: null` on the `RunRow` built in `runRowFromPublicRpc`. Do not DROP/CREATE `list_player_public_runs`.
- **Decision**: FIXED — Crew Lead ⭐ Fix applied in re-plan (`auto_join_min: null` in `runRowFromPublicRpc`)

## Triage

Fixed: F1 (⭐ replace applyToRun post-check), F2 (copy live bodies + re-GRANT EXECUTE), F3 (`auto_join_min: null` in `runRowFromPublicRpc`). All three applied in `/10x-plan` refine 2026-09-01.
