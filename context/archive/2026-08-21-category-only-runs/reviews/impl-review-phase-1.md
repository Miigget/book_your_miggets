<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Category-only runs

- **Plan**: context/changes/category-only-runs/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-21
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

## Verification

### Automated

| Check | Result |
|-------|--------|
| `npx supabase db reset` | Not re-run (destructive). Migration `20260821083357` is present in `supabase_migrations.schema_migrations`. Live objects match the file. |
| `npm run db:types` | Pass. `npx supabase gen types typescript --local` is byte-identical to committed `src/types/database.ts`. `runs.Row.map_category: string \| null`; Insert/Update use generated optional `map_category?: string \| null`. |
| `npm run lint` | Pass (0 errors; 52 pre-existing `no-console` warnings in other files, none introduced by this phase). |

### Manual (re-run locally via `postgres`, rolled back)

| Progress | Result |
|----------|--------|
| 1.4 both-null INSERT | Rejected — `runs_map_or_category_required` |
| 1.4 map-only INSERT | Pass — `map_category` stays null |
| 1.4 category-only `Insane` | Pass — `map_id` stays null |
| 1.4 both set | Rejected — `runs_map_or_category_required` |
| 1.4 `map_category = 'insnae'` | Rejected — `runs_map_category_catalog` |
| 1.5 XOR `NOT VALID` | Pass — `pg_constraint.convalidated` is false; catalog CHECK `convalidated` is true |

Progress 1.4 / 1.5 checkboxes are not rubber stamps: live DB matches the commit, and the smokes were re-run this review.

## Plan vs diff

Commit `5d4f02c` on `feature/category-only-runs`.

- In plan and in diff: `supabase/migrations/20260821083357_runs_map_category.sql` — MATCH. Column `map_category text null`; catalog CHECK `runs_map_category_catalog` (null or the eight KoG DIFF strings, VALID); XOR CHECK `runs_map_or_category_required` `(map_id is null) <> (map_category is null) NOT VALID`; `REVOKE UPDATE` then `GRANT UPDATE` of the previous six columns **plus** `map_category`. INSERT / SELECT / DELETE table grants unchanged (authenticated still has table-level INSERT/SELECT/DELETE). Constraint names and grant column order match the plan snippet. Header style matches `20260820124849_runs_update_active_invariants.sql`.
- In plan and in diff: `src/types/database.ts` — MATCH. Three generated lines only (Row / Insert / Update). Not hand-edited. Relationships unchanged (no FK on `map_category`).
- In plan, not in this phase: `src/lib/map-categories.ts` — expected. Crew Lead: MAP_CATEGORIES module is Phase 2; do not flag absence.
- In diff, not in plan: `context/changes/category-only-runs/*` docs from the implement ritual — not product scope creep.

Catalog strings are byte-identical to the eight distinct `maps.difficulty` values in the KoG seed (`Easy`, `Main`, `Hard`, `Insane`, `Extreme`, `Mod`, `Solo`, `Others`). Authenticated UPDATE column privileges are exactly: `title`, `map_id`, `map_category`, `starts_at`, `max_participants`, `min_points`, `join_mode`.

## Safety notes (not findings)

- XOR `NOT VALID` is required so existing both-null rows do not fail production `db push`. Fresh INSERT/UPDATE still enforce the check (verified).
- No backfill, no `VALIDATE`, no RLS policy edits, no INSERT column whitelist change.
- App UPDATE of `runs` remains only `updateRun` (`src/lib/services/runs.ts`). Phase 2 must always patch `map_category` so a grandfathered row cannot be title-saved with both still null — that is planned, not a Phase 1 miss.
- Lessons `?error=` rule does not apply to this SQL-only phase.

## Decision

All findings PENDING: none. YOLO path: Done (no triage). `change.md` stays `implementing` — this is a phase review, not a full-plan impl-review.
