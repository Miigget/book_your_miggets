<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Team-size bands under Advanced settings (S-26)

- **Plan**: context/changes/team-size-scope/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 7d31915 (`feat(team-size-scope): Schema, RPC, grants, types (p1)`)

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

Planned Phase 1 files vs `7d31915` (product only):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `supabase/migrations/<ts>_run_auto_join_min.sql` | `20260901140012_run_auto_join_min.sql` | MATCH |
| `src/types/database.ts` (via `npm run db:types`) | present; re-gen vs local is a clean diff | MATCH |

Extra in the commit: `context/changes/team-size-scope/*` from earlier 10x stages (not product-scope creep). Missing vs Phase 1: none. App overlay / Advanced UI / `AGENTS.md` are Phase 2–3.

Live local DB has `20260901140012` applied. Locked Crew cuts verified in SQL + types:

- `auto_join_min` nullable integer, no default, no backfill; CHECK `runs_auto_join_min_chk` (`NULL OR 1 ≤ min ≤ max`).
- No `ALTER TYPE join_mode` (enum still `approval_required` \| `auto_join`).
- Overlay gate: `join_mode = auto_join OR auto_join_min IS NOT NULL`; else `not_auto_join`.
- Outcome order: `full` at max, then `band_full` at min; unbanded auto-join cannot emit `band_full`.
- GRANT UPDATE is the eight-column list plus `auto_join_min`. Lifecycle stamps (`archived_at`, `extended_until`, `completed_at`, `verified_at`) and `organizer_id` stay closed.
- Invite create copied live `20260831131219` body (5-cap UX pre-check kept); `p_auto_join_min` on INSERT; DROP + re-GRANT EXECUTE to `authenticated` only.
- Invite setter copied live `20260824101006` body; `CASE WHEN p_update_auto_join_min` (no coalesce on min); DROP + re-GRANT EXECUTE to `authenticated` only. One overload each (old 8-arg / 10-arg signatures gone).
- Freeze trigger copied `20260820124849` including `new.updated_at := now()` and change-gated `capacity_below_confirmed`; `auto_join_min` locked with `join_mode` via `join_mode_locked`. Trigger still attached (`runs_enforce_update_invariants`).
- `auto_join_run` copied live `20260901083008` (`FOR UPDATE`, nickname/ban/existing-participation, roster-open); signature still `(p_run_id uuid) returns text`; EXECUTE `authenticated` only.
- No DROP/CREATE of `list_player_public_runs`.
- Types: `runs.Row` / `Insert` / `Update` include `auto_join_min: number | null`; invite Args include `p_auto_join_min` / `p_update_auto_join_min`; `auto_join_run` Args unchanged.

`change.md` stays `implementing` — this is a phase-scoped review; phases 2–3 are not done. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| Local migration applied (`npx supabase migration list --local`) | PASS — `20260901140012` present on local |
| `npm run db:types` | PASS — regenerated `src/types/database.ts` matches committed file (empty diff) |
| `npm run lint` on regenerated types | PASS (vacuous) — `src/types/database.ts` is eslint-ignored by design (`eslint.config.js`); no product lint surface in this phase |

## Manual verification

Progress rows 1.4–1.7 remain `- [ ]`. YOLO skips the click-through / concurrent SQL (Crew locked). Not a reject reason.

Static local-DB inspection (not a substitute for 1.4 concurrency): GRANT UPDATE includes `auto_join_min`; invite RPCs EXECUTE for `authenticated` (anon/public denied); create still raises `active_run_cap`; `full` precedes `band_full` in `auto_join_run`.

Residual risk: two concurrent `auto_join_run` calls at the last min-band seat were not executed here.

## Findings

None.

## Notes

- Phase 1 app callers omit the new invite args; SQL defaults (`p_auto_join_min` NULL, `p_update_auto_join_min` false) keep today’s behavior until Phase 2.
- Generated RPC Args type `p_auto_join_min?: number` (no `| null`). Phase 2 already uses `as Args` on these RPCs; pass SQL NULL with `p_update_auto_join_min: true` under that assertion when clearing the band.
- Direct PostgREST can write `auto_join_min` once granted (accepted in plan Migration Notes; CHECK is the backstop). Overlay in `auto_join_run` is live in SQL; `applyToRun` still ignores `band_full` until Phase 2.
- Phase 2 (`applyToRun` overlay, create/edit APIs) is not in this review.
