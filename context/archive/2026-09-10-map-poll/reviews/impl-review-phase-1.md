<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Map poll (S-28 / FR-010) Implementation Plan

- **Plan**: context/changes/map-poll/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-09-10
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 43b38ae (`feat(map-poll): schema, RPCs, map_id freeze (p1)`)

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

Planned Phase 1 files vs `43b38ae` (product only):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `supabase/migrations/<ts>_run_map_poll.sql` | `20260910125037_run_map_poll.sql` | MATCH |
| `src/types/database.ts` (via `npm run db:types`) | present; re-gen vs committed is a clean diff | MATCH |

Extra in the commit: `context/changes/map-poll/*` from earlier 10x stages (not product-scope creep). Missing vs Phase 1: none. Services / HTTP / edit omit / island / `AGENTS.md` are Phase 2–3.

Local DB has `20260910125037` applied. Locked Crew cuts verified in SQL + types:

- Tables: `run_map_polls` (`UNIQUE run_id`, `winner_map_id` RESTRICT), `run_map_poll_options` (`(poll_id, map_id)` PK, unique position, CHECK 1–8, maps RESTRICT), `run_map_poll_votes` (`(poll_id, user_id)` PK, composite FK to options, change-vote = UPSERT).
- Grants: SELECT **authenticated only** on all three; no INSERT/UPDATE/DELETE for `anon`/`authenticated`. RLS ENABLE; SELECT policies only. No `run_is_public` / `can_view_run`.
- Vote SELECT: own row among comment-read (`confirmed` / organizer / admin) while open; all rows only when `closed_at IS NOT NULL`.
- RPCs: `returns text`, `SECURITY DEFINER`, `search_path = ''`. EXECUTE `authenticated` only (`anon` denied). Wrong actor / missing run → `not_found`. Close copies `extend_run` (admin non-owner → `not_found`). Create uses `is_run_roster_open_row` (`not_open` after Complete/Archive). Vote uses comment-write window (`is_run_in_active_window` — Complete still allows). Close uses `is_run_active_row` (allowed after Complete; Archive → `not_active`; `verified_at` → `already_verified`). Zero votes → `no_votes` with no stamp. Winner = max count, tie → min `position`. `UPDATE runs SET map_id = winner, map_category = null` **before** stamping `closed_at` / `winner_map_id`. Vote and close `SELECT … FOR UPDATE` the poll row. Close also locks the run first (run → poll; no poll-then-run inversion).
- Freeze trigger: copied live `20260901140012` body (`join_mode_locked`, change-gated `capacity_below_confirmed`, `new.updated_at := now()`) plus `map_id_locked` (P0001) when a closed poll exists and `map_id` / `map_category` would change. Trigger still attached (`runs_enforce_update_invariants`).
- Invite setter: `CREATE OR REPLACE` the live **13-arg** signature (`20260904130749`). `map_id` / `map_category` skipped when a closed poll exists; `p_map_ids` NULL-skip / replace unchanged. EXECUTE still `authenticated` only.
- Types: `run_map_polls` / `run_map_poll_options` / `run_map_poll_votes` in `Database["public"]["Tables"]`; `create_map_poll` / `vote_map_poll` / `close_map_poll` in `Functions`. Setter Args still 13 fields (no extra skip arg).

`change.md` stays `implementing` — this is a phase-scoped review; phases 2–3 are not done. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| Local migration applied (`npx supabase migration list --local`) | PASS — `20260910125037` present on local |
| `npm run db:types` | PASS — regenerated `src/types/database.ts` matches committed file (empty diff) |
| `npm run lint` | PASS — 0 errors (190 pre-existing warnings; `src/types/database.ts` is eslint-ignored; no new product lint surface in this phase) |

## Manual verification

Progress rows 1.4–1.11 remain `- [ ]`. YOLO skips the SQL click-through (Crew locked). Not a reject reason.

Static local-DB inspection (not a substitute for 1.4–1.11): table grants are SELECT/`authenticated` only; RPC EXECUTE denied for `anon`; six SELECT policies and no write policies; constraints match the plan; 13-arg setter intact; freeze trigger still on `runs`.

Residual risk: actor-matrix SQL (non-organizer create, pending vote, PostgREST INSERT, cross-user vote SELECT while open, `map_id_locked` after close, tie-break, zero-vote close) was not executed against live sessions.

## Findings

None.

## Notes

- Close-vs-freeze order in the RPC matches the load-bearing plan note: winner write while `closed_at` is still null.
- Phase 2 (`polls.ts`, HTTP routes, `prepareOwnedActiveRunPatch` omit) is not in this review. App edit can still re-sync `map_id` from `run_maps[0]` until Phase 2; the trigger is the hard gate if that patch actually changes the lock.
- Lessons (`?error=` / PostgREST leakage) apply to Phase 2 HTTP, not this schema phase.
