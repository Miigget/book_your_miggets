<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan-only runs Implementation Plan

- **Plan**: `context/changes/clan-runs/plan.md`
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-31
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

## Findings

None.

## Git scope

No Phase 1 commit (expected). Reviewed working tree vs Phase 1 file list. Unrelated dirty paths ignored (`comment-screenshots`, `manual-archive-and-extend`, `clan-friend-invites`, `shape-notes`, `roadmap.md`, health-check / prd-v2 / stack-assessment).

| Path | Plan | Diff | Verdict |
|------|------|------|---------|
| `supabase/migrations/20260831123821_run_visibility_add_clan_only.sql` | yes | untracked | MATCH — `ALTER TYPE … ADD VALUE 'clan_only'` only |
| `supabase/migrations/20260831123822_clan_only_run_rls.sql` | yes | untracked | MATCH — helper, SELECT / `can_view_run`, owner WITH CHECK, `is_run_organizer` policy |
| `src/types/database.ts` | yes | modified | MATCH — `clan_only` on enum + constants; `is_same_clan` generated |
| `src/lib/services/runs.ts` | yes (`formatVisibility`) | modified | MATCH — `case "clan_only": return "Clan only"`; `VISIBILITIES` unchanged |
| `src/components/runs/CreateRunForm.tsx` | not in original Phase 1 list | modified | MATCH to accepted plan-review F1 — union widened only; no `<option>`, no `ownsClan` |

## Automated verification (re-run this review)

| ID | Check | Result |
|----|--------|--------|
| 1.1 | Both migrations applied locally (`supabase_migrations.schema_migrations` 20260831123821 + 20260831123822) | PASS |
| 1.2 | `src/types/database.ts` includes `clan_only` on `run_visibility` | PASS |
| 1.3 | `formatVisibility` exhaustive `clan_only` case; `npm run lint` 0 errors | PASS |
| 1.4 | Authenticated organizer (`aaaaaaaa-…0001`, `SET ROLE authenticated`, not superuser): confirmed head-count on archived `friends_only` + `invite_only` → 1 and 1, SQLSTATE 00000 (no 42P17) | PASS |
| 1.5 | Anon (`SET ROLE anon`): `SELECT id FROM runs WHERE visibility = 'clan_only'` → 0 rows after owner insert of a probe row (rolled back) | PASS |
| 1.6 | `npm run lint` | PASS (0 errors; pre-existing warnings only) |
| 1.7 | `npm run build` | PASS |

## Manual verification

- [ ] 1.8 Dashboard Incoming / Past UI — correctly left unchecked. YOLO residual risk (crew-decisions: skipped; SQL smoke is the automated bar).

## Contract checks (live local Postgres)

- `is_same_clan`: `STABLE SECURITY DEFINER`, `search_path = ''`, reads `clan_members` only, no `a is distinct from b`. EXECUTE: `authenticated` + owner; not `anon`.
- `runs_select_active_authenticated` adds `clan_only AND is_same_clan(organizer_id, auth.uid())`. `runs_select_active_anon` still `visibility = public` only.
- `can_view_run` clan branch after guest `uid is null` guard and after friends/invite. Grants to `anon` + `authenticated` preserved. Does not call `is_run_in_active_window`.
- `runs_insert_own` / `runs_update_own` keep verified conjunct; add `visibility <> 'clan_only' OR EXISTS (clans.owner_id = organizer_id)`. `runs_update_admin` still `is_admin()` unbounded.
- `run_participants_select_organizer` `USING (is_run_organizer(run_id))`. `dashboard.astro` catch copy unchanged; `confirmedCountsForRuns` still counts archived ids.
- `clan_members` policies still do not SELECT `runs` or call `is_same_clan`. No `runs.clan_id`. No `run_invites` / `clan_invites` changes.
