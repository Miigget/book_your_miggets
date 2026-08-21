<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit an active run (S-13)

- **Plan**: context/changes/edit-run/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-20
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

## Accepted drift (not a finding)

Crew Lead already accepted `p1-capacity-when`: `enforce_run_update_invariants` raises `capacity_below_confirmed` only when `NEW.max_participants IS DISTINCT FROM OLD.max_participants`. Plan contract text still describes the floor check on every UPDATE; the SQL is the intended S-02 overfill adaptation (title/map saves must not fail on an already-overfilled run). Re-verified: overfilled row (`max_participants = 1`, 2 confirmed) accepts a title UPDATE and a same-value capacity UPDATE; dropping capacity still raises `capacity_below_confirmed`.

## Findings

None.

## Verification

### Automated

| Check | Result |
|-------|--------|
| `npx supabase db reset` | Not re-run (destructive). Migration `20260820124849_runs_update_active_invariants` is present in `supabase_migrations.schema_migrations` and objects match the file. |
| `npm run db:types` | Pass. Regenerated `--local` types are identical to committed `src/types/database.ts`. `enforce_run_update_invariants` is not in generated Functions (same as other trigger-only fns, e.g. `seat_organizer_on_run_insert`). |
| `npm run lint` | Pass (0 errors; pre-existing warnings only). |

### Manual (re-run locally as `authenticated` + JWT `sub` = organizer; rolled back)

| Progress | Result |
|----------|--------|
| 1.4 title UPDATE + `updated_at` | Pass |
| 1.5 past-grace UPDATE | 0 rows |
| 1.6 `join_mode` after non-organizer participant | `join_mode_locked` |
| 1.7 `max_participants` below confirmed | `capacity_below_confirmed` |
| 1.8 `join_mode` with only organizer seat | Pass |
| 1.9 `archived_at` / `organizer_id` | Rejected (`permission denied for table runs`; column privileges are false for those columns, true for the six granted fields) |

Local leftover rows `smoke upcoming edited` / `smoke past grace` also match an implementer SQL smoke, not checkbox rubber-stamping.

## Plan vs diff

- In plan and in commit `8056c74`: `supabase/migrations/20260820124849_runs_update_active_invariants.sql` — MATCH (policy USING/WITH CHECK inlined 1h window, `runs_update_admin` untouched, REVOKE table UPDATE + GRANT six columns, DEFINER trigger `search_path = ''`, revoke public, no EXECUTE to `authenticated`, tokens `join_mode_locked` / `capacity_below_confirmed` + `P0001`).
- In plan, not in diff: `src/types/database.ts` — MATCH (no generated delta).
- In diff, not in plan: `context/changes/edit-run/*` docs from the implement ritual — not product scope creep.
