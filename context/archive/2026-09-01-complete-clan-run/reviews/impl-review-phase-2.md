<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Mark a clan run completed

- **Plan**: context/changes/complete-clan-run/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

Phase 2 commit `bd48c2f`. Product diff is `src/lib/services/runs.ts`, `src/lib/services/participants.ts`, and new `src/pages/api/runs/[id]/complete.ts`. Extra file in that commit is `plan.md` Progress SHA write-back — expected ritual. Uncommitted `plan.md` SHA suffixes for 2.1–2.6 and unrelated foundation / `.cursor/rules/10x-course.mdc` ignored as instructed.

Contract checks (code vs plan):

- `completeClanRun` maps the planned RPC codes to domain `RunError` strings; PostgREST/`Error.message` is logged, never forwarded to `?error=`.
- `POST /api/runs/{id}/complete` matches `archive.ts` (signed-in + RPC only). No `userOwnsClan` in the route or wrapper (plan-review SOUND-F1).
- `RunListItem.completedAt` is selected via `RUN_SELECT`, mapped in `runFieldsFromRow`. `runRowFromPublicRpc` stubs `completed_at: null`. `list_player_public_runs` SQL is unchanged. `mapRunRow` still keys off audience-active only (completed rows stay listable). `countAudienceActiveRunsForOrganizer` still ignores `completed_at`.
- Freeze: `loadActiveRunForMutation` throws `CLAN_RUN_COMPLETED_FROZEN` (apply / withdraw / leave / decide / kick). `extendRun` maps `already_completed`. `getOwnedActiveRunForEdit` returns null. `prepareOwnedActiveRunPatch` rejects with the inactive-family string. `requireActiveRun` in comments.ts is still audience-active only.
- Non-owner: RPC `not_found` → “Run not found or no longer active” via `runFail` (400 JSON / redirect, not 403). Guest → `commentUnauthorized` (401 / sign-in). No `/api/admin/runs/{id}/complete`. `PROTECTED_ROUTES` unchanged.
- No `clans` writes in the Phase 2 files. Complete only calls `complete_clan_run`.

Independent automated re-run this review: `npx astro sync` + `npm run lint` (0 errors) and `npm run build` pass. Worker manifest includes `/api/runs/[id]/complete`; bundle chunk calls `complete_clan_run`. Types: `Functions["complete_clan_run"]` and `runs.completed_at` already generated in Phase 1.

Progress 2.4–2.6 marked done; YOLO skipped browser click-through (logged in `crew-decisions.md`). Same assertions were exercised by the implementer’s cookie-session curl against the local Worker (complete, freeze, comments, leak/sign-in, points unchanged). Code paths above match that curl contract. Pre-existing edit-route unverified / `userOwnsClan` gates still run before `updateRun`; a completed-run edit that reaches `prepareOwnedActiveRunPatch` uses the inactive-family string as planned.

Phase 1 SQL assumptions hold: app freeze does not fold `completed_at` into `isRunActive` / comment writes. No Complete button / chip / AGENTS.md this phase (Phase 3).

`change.md` stays `implementing` — this is a phase-scoped review; Phase 3 is not done. Do not stamp `impl_reviewed` until the full-plan review.

## Findings

None.
