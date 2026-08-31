<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Manual archive, extend, and active-run cap

- **Plan**: `context/changes/manual-archive-and-extend/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-31
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 0 observations (open)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 18/18 existing paths ✓, 12/12 symbols ✓, brief↔plan ✓, Progress mechanical ✓, no `docs/reference/contract-surfaces.md`.

Existing paths checked: `src/lib/run-lifecycle.ts`, `src/lib/services/runs.ts`, `src/lib/services/participants.ts`, `src/lib/services/comments.ts`, `src/pages/api/runs/index.ts`, `src/components/runs/CreateRunForm.tsx`, `src/components/runs/AdminRunControls.tsx`, `src/pages/runs/[id].astro`, `src/pages/runs/new.astro`, `src/lib/comment-mutation-http.ts`, `src/pages/api/admin/runs/[id]/delete.ts`, `supabase/migrations/20260831123822_clan_only_run_rls.sql`, `supabase/migrations/20260824101006_restricted_run_visibility.sql`, `AGENTS.md`, `context/foundation/prd.md`, `src/types/database.ts`, `src/middleware.ts`, `src/components/Welcome.astro`. New files (`archive.ts`, `extend.ts`, admin archive API, `OrganizerRunLifecycleControls.tsx`) correctly absent.

Symbols confirmed live: `RUN_GRACE_MS`, `activeWindowStartsAfter`, `archiveDeadlineAt` (definition only), `isRunActive`, `getRunLifecyclePhase`, `mapRunRow`, `runRowFromPublicRpc`, `is_run_in_active_window`, `can_view_run` (clan_only body), `create_invite_only_run`, `runFail`, `fetchFormJson`, `list_player_public_runs`, `is_not_banned`, `grant update (...)` omitting `archived_at`. Brief phases/decisions/scope match the plan, including F1–F3 rows. Crew-locked ⭐ (backfill, DEFINER RPCs, unbounded in-progress + `extended_until`, dual-defense 5-cap, derived elapsed extend, F1 RPC column, F2 advisory lock, F3 no banned exemption) are followed.

Code verification (riskiest claims, re-checked after patches): live 1h sites remain split across `20260831123822` (`can_view_run`, `runs_select_active_authenticated`, `runs_update_own`) and `20260824101006` (anon SELECT, invites, `auto_join_run`, `is_run_in_active_window`, `create_invite_only_run`) — copying S-15 alone would still drop `clan_only`. Comment INSERT/likes call `is_run_in_active_window` (retarget the helper; do not rewrite comment policies). `mapRunRow` (`runs.ts:176–181`) still keys phase off `starts_at` only; inventory uses `isRunActive`. `runRowFromPublicRpc` (`runs.ts:478–510`) maps `archived_at` and omits `extended_until` today; `listPlayerProfileRuns` seeds `byId` from the RPC first. Live RPC (`20260825131500`) RETURNS TABLE has `archived_at` and no `extended_until`. `src/middleware.ts:70–78` blocks banned POSTs under `/api/` except `/api/auth/`. `auto_join_run` uses `public.is_not_banned()` → `'banned'` with `SET search_path = ''`. No existing `pg_advisory_xact_lock` in the repo; `8724` is free. `AdminRunControls` is Delete-only (`showArchive` correctly specified as new).

## Re-review (after F1/F2/F3 Fix A)

All three ⭐ Fix A patches landed in `plan.md` + `plan-brief.md`. No leftover “leave `list_player_public_runs` unchanged” or “banned organizer may archive” in the plan. No new CRITICAL/WARNING.

1. **F1** — Phase 1 `CREATE OR REPLACE list_player_public_runs` adds `extended_until` to RETURNS TABLE (after `archived_at`) and SELECT; query stays unfiltered. Types contract + SQL smoke 1.14. Phase 2 `runRowFromPublicRpc` maps `row.extended_until`. Key Discoveries updated.
2. **F2** — Cap BEFORE INSERT takes `pg_advisory_xact_lock(8724, hashtext(NEW.organizer_id::text))` then counts; namespace commented. `create_invite_only_run` pre-check stays UX (trigger serializes).
3. **F3** — `archive_run` organizer path `NOT is_not_banned()` → `banned`; admin caller skips. No middleware exemption for archive POSTs. SQL smoke includes banned organizer → `banned`.

Progress: one `## Progress`; phase titles match; every success-criteria bullet has a Progress row (1.14 added; 1.12/1.13 remain Manual). Phase bodies use plain `- ` bullets.

## Findings

None open.

### F1 — list_player_public_runs does not return extended_until

- **Severity**: ⚠️ WARNING (closed)
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 `list_player_public_runs` + Phase 2 `runRowFromPublicRpc`
- **Detail**: Closed by Fix A. RPC now specified to return `extended_until`; app maps it; query stays unfiltered.
- **Decision**: FIXED via Fix A

### F2 — 5-cap BEFORE INSERT trigger does not serialize concurrent creates

- **Severity**: ⚠️ WARNING (closed)
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 cap trigger
- **Detail**: Closed by Fix A. Trigger locks `8724` + `hashtext(organizer_id)` then counts.
- **Decision**: FIXED via Fix A

### F3 — “Banned organizer may archive” contradicts the banned API POST gate

- **Severity**: ⚠️ WARNING (closed)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 `archive_run` vs `src/middleware.ts:70–78`
- **Detail**: Closed by Fix A. RPC follows `is_not_banned()`; no banned-POST exemption; admin archive still works.
- **Decision**: FIXED via Fix A

## Triage

Crew Lead (YOLO) 2026-08-31 (prior pass):

- F1 → Apply Fix A ⭐
- F2 → Apply Fix A ⭐
- F3 → Apply Fix A ⭐

`/10x-plan` applied all three. Re-review 2026-08-31: patches confirmed; verdict REVISE → SOUND. No new findings to triage.
