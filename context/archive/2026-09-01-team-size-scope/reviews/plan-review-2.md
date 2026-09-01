<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Team-size bands under Advanced settings (S-26)

- **Plan**: `context/changes/team-size-scope/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-01
- **Verdict**: SOUND
- **Findings**: 0 critical 0 warnings 0 observations
- **Re-review**: after REVISE. Prior report: `context/changes/team-size-scope/reviews/plan-review.md` (verdict REVISE; F1–F3 Decision: FIXED in plan.md).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Prior findings (confirmed in plan.md)

| Prior | Status | Where in revised plan |
|-------|--------|------------------------|
| F1 Overlay must switch on RPC text; no confirmed post-check after `band_full`; `autoJoinRun` must not stay `Promise<void>` | FIXED | Overview; Key Discoveries; Critical Implementation Details (Apply fallthrough); Phase 2 Apply overlay contract + snippet; brief “Apply overlay” row |
| F2 Copy live invite RPC bodies; DROP + re-GRANT EXECUTE; freeze keeps `updated_at` | FIXED | Phase 1 create (`20260831131219:313-398` + 5-cap), setter (`20260824101006:519-599` + EXECUTE `601-624`), freeze (`20260820124849:51-89` including `new.updated_at := now()`); Manual 1.7 |
| F3 `runRowFromPublicRpc` stubs `auto_join_min: null`; no `list_player_public_runs` DROP | FIXED | Overview; Key Discoveries; Phase 2 DTO contract; brief “Public mapper” row |

Progress headings match Phase titles. Phase bodies use plain bullets. Checkboxes live only under `## Progress`. Success Criteria 1:1 with Progress `1.1`–`3.8`.

## Grounding

Grounding: 20/20 paths ✓, 1 new migration correctly absent, 15/15 symbols ✓, brief↔plan ✓, Progress mechanical ✓, no `docs/reference/contract-surfaces.md`.

Existing paths checked: `src/lib/run-limits.ts`, `src/lib/services/runs.ts`, `src/lib/services/participants.ts`, `src/pages/api/runs/index.ts`, `src/pages/api/runs/[id]/index.ts`, `src/components/runs/CreateRunForm.tsx`, `src/components/runs/RunParticipantActions.tsx`, `src/components/runs/DashboardRunCard.astro`, `src/pages/runs/[id].astro`, `src/pages/runs/[id]/edit.astro`, `src/types/database.ts`, `AGENTS.md`, `src/components/runs/RunListFilters.astro`, `src/components/runs/ActiveRunCard.astro`, `src/components/runs/RunPreviewCard.astro`, `supabase/migrations/20260901083008_complete_clan_run.sql`, `supabase/migrations/20260901102315_verify_clan_run_finish.sql`, `supabase/migrations/20260820124849_runs_update_active_invariants.sql`, `supabase/migrations/20260831131219_manual_archive_and_extend.sql`, `supabase/migrations/20260824101006_restricted_run_visibility.sql`. New file `supabase/migrations/<YYYYMMDDHHmmss>_run_auto_join_min.sql` correctly absent.

Symbols confirmed live (plan describes the *change*, not current behavior):

1. `autoJoinRun` is still `Promise<void>` (`participants.ts:190`); only caller is `applyToRun` (`:254`).
2. `applyToRun` still requires confirmed after RPC (`:253-260`) — F1 overlay replaces this whole block.
3. `loadActiveRunForMutation` returns `{ id, join_mode, organizer_id }` only (`:163,187`); select list has no `auto_join_min` yet.
4. `runRowFromPublicRpc` (`runs.ts:500-536`) is the only `RunRow` object literal; no `auto_join_min` yet — F3 stub is required once `RunRow` gains the field.
5. `pendingIds` is `join_mode === "approval_required"` only (`runs.ts:407`); Dashboard chip matches (`DashboardRunCard.astro:73`).
6. `formatJoinMode` exhaustive on two enum values (`runs.ts:131-141`).
7. Live `auto_join_run` (`20260901083008:78-155`): `not_auto_join` when `join_mode <> auto_join` (`:113-115`); `full` at max only (`:146-148`); no `band_full`.
8. Grant list eight columns (`20260901102315:144-154`).
9. `create_invite_only_run` live `20260831131219:313-398` (5-cap UX pre-check `:357-365`); DROP list matches `(text, uuid, text, timestamptz, integer, integer, join_mode, uuid[])`.
10. `set_run_visibility_and_invites` live `20260824101006:519-599` (`join_mode = coalesce` `:586`); EXECUTE grant `:601-624` on the 10-arg list the plan DROPs.
11. `enforce_run_update_invariants` (`20260820124849:51-89`) includes `new.updated_at := now()` (`:60`); no later `CREATE OR REPLACE`.
12. `run_participants_insert_self_pending` allows self-pending regardless of `join_mode` (`20260901083008:230-245`) — `band_full` → pending insert is RLS-legal.
13. `mapRunWriteError` already matches `join_mode_locked` / named CHECKs (`runs.ts:921-950`).
14. `formString` exists on create and edit APIs; edit does not yet read `auto_join_min`.
15. `npm run db:types` exists in `package.json`.

Brief phases/decisions/scope match the plan and crew-locked ⭐ (NULL unset, freeze with join_mode, `band_full`, S-02 Accept, binary `formatJoinMode`, Join/Apply/full CTA, overlay any `join_mode`, no `ALTER TYPE`). F1–F3 ⭐ rows in the brief match the plan body.

## Findings

None. Prior F1–F3 are applied; this pass found no new substance, feasibility, or contract-break issues.

Code verification (riskiest claims after refine):

1. **F1 overlay** — Confirmed still the live seam, and the plan now names it. Switching only inside void `autoJoinRun` would still fail `:255-258`. Plan replaces that block, calls RPC when `join_mode === "auto_join" || auto_join_min != null`, maps `band_full` (and only then) to pending insert, and forbids keeping `Promise<void>`.
2. **F2 invite DROP** — Live create is `20260831131219` (not the earlier setter-era body). `DROP FUNCTION` drops EXECUTE. Freeze must keep `updated_at`. Plan copies those bodies, re-GRANTs, and names `updated_at`.
3. **F3 public mapper** — Adding `auto_join_min` to `RunRow` without `auto_join_min: null` in `runRowFromPublicRpc` is a type error. Plan stubs null and does not DROP `list_player_public_runs`.
4. **Grant list / `not_auto_join` / outcome order** — Eight-column GRANT still needs the append; overlay must widen `not_auto_join`; max-full before `band_full` is written as ordered SQL IFs.
5. **Blast radius** — `UpdateRunInput` / `PreparedRunPatch` / `CreateInviteOnlyRunInput` / `CreateRunFormEditValues` are implied by the named writers (same pattern as join_mode). Cards only call `formatJoinMode` — leaving them alone matches scope. `decideParticipant` untouched (S-02). Pending-insert RLS does not check `join_mode`.
