<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Multi-map session (S-27)

- **Plan**: context/changes/multi-map-runs/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-09-04
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warning 0 observations
- **Commit**: fcfa49c (`feat(multi-map-runs): schema, RLS, backfill, invite RPCs, types (p1)`)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Grounding

Planned Phase 1 files vs `fcfa49c` (product only):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `supabase/migrations/<ts>_run_maps.sql` | `20260904130749_run_maps.sql` | MATCH |
| `src/types/database.ts` (via `npm run db:types`) | present; re-gen vs local is a clean diff | MATCH |

Extra in the commit: `context/changes/multi-map-runs/*` and a roadmap status touch from earlier 10x stages (not product-scope creep). Missing vs Phase 1: none. No Phase 2/3 app files (`src/lib/run-maps.ts`, APIs, MapPicker, cards, `AGENTS.md` Hard Rules).

Live local DB has `20260904130749` applied. Locked Crew cuts verified in SQL + types:

- Table `run_maps`: PK `(run_id, map_id)`, unique `(run_id, position)` (btree index via unique), CHECK `run_maps_position_chk` (`1 ≤ position ≤ 8`), FKs CASCADE/RESTRICT as planned.
- Backfill: every `runs.map_id IS NOT NULL` has a `run_maps` row at `position = 1` with that `map_id` (`missing_backfill = 0`). Local seed run `aaa…1` has a second map from implementer F2 testing; not a migration defect.
- F1: `run_is_public` is STABLE SECURITY DEFINER, `search_path = ''`, visibility-only. SELECT = parent visible OR `run_is_public`. `can_view_run` unchanged (archived public still false for anon). Used only in `run_maps` SELECT.
- F2: setter `p_map_ids uuid[] DEFAULT NULL`; omit/NULL skips; `'{}'` deletes; non-empty replaces. Create `DEFAULT '{}'::uuid[]` always writes. No `coalesce` on the setter. Create `unnest(coalesce(p_map_ids, '{}'))` is extra-defensive, not F2 drift.
- DROP signatures match live `20260901140012` GRANTs; EXECUTE re-granted to `authenticated` on the new lists only; old overloads gone. Bodies keep 5-cap UX pre-check, invitee checks, `p_update_auto_join_min` CASE. RPCs do not re-derive `p_map_id` / `p_map_category`.
- GRANT UPDATE on `runs` is still the nine-column list (includes `map_id` / `map_category` / `auto_join_min`). Closed: `completed_at`, `archived_at`, `extended_until`, `verified_at`, `organizer_id`. `clans.points` not granted. `verify_clan_run_finish` unaltered.
- Types: `Tables<"run_maps">`; `Functions["run_is_public"]`; both invite Args include `p_map_ids?: string[]`.

`change.md` stays `implementing` — this is a phase-scoped review; phases 2–3 are not done. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| Local migration applied (`npx supabase migration list --local`) | PASS — `20260904130749` present on local |
| SQL 1.2 backfill (`map_id` → position 1) | PASS — `missing_backfill = 0` |
| `npm run db:types` | PASS — regenerated `src/types/database.ts` matches committed file (empty diff) |
| GRANT EXECUTE on new invite signatures; old gone | PASS — one overload each; `authenticated` EXECUTE true, `anon` false |
| SQL 1.7 F2 setter omit/NULL skip, `'{}'` wipe, array replace | PASS — 12-arg omit and explicit NULL leave rows; `'{}'` deletes; 3-id array replaces as positions 1..3 (transaction rolled back) |

## Manual verification

Progress rows 1.5 / 1.6 / 1.8 are `- [x]` with SHA `fcfa49c` (YOLO). Re-run here (not a substitute for a live Astro GET):

| Check | Result |
|-------|--------|
| 1.5 position 9 | PASS — `run_maps_position_chk` (`23514`) |
| 1.5 duplicate `map_id` / duplicate position | PASS — unique_violation (`23505`) |
| RPC `cardinality > 8` | PASS — `run_maps_cap` (`P0001`) |
| 1.6 anon SELECT public active | PASS — rows returned |
| 1.6 anon SELECT friends_only / clan_only | PASS — 0 rows |
| 1.8 anon SELECT archived public | PASS — rows returned (F1) |
| 1.8 anon SELECT archived friends/invite | PASS — 0 rows |
| 1.8 `can_view_run(archived public)` as anon | PASS — false |

Residual: guest HTML GET `/runs/{id}` of archived public was not exercised in a browser this review (no local Astro session). Load-bearing `can_view_run` remains false. Already logged in `crew-decisions.md`.

## Findings

### F1 — INSERT/DELETE RLS omits `is_not_banned()`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260904130749_run_maps.sql:91-117
- **Detail**: Planned write predicate is organizer + `is_run_roster_open_row` and that is what shipped. Sibling child-table writes (`run_invites_insert/delete_organizer_active`, `run_comments_insert_own`, `runs_update_own`) also require `is_not_banned()`. Invite RPCs still fail for a banned organizer via `runs` INSERT/UPDATE RLS. Direct PostgREST replace-all on `run_maps` would not. Plan Migration Notes already accept PostgREST with organizer + roster-open as the product guards; this is the sibling convention, not a settled-lock miss.
- **Fix**: Add `and public.is_not_banned()` to `run_maps_insert_organizer_open` WITH CHECK and `run_maps_delete_organizer_open` USING (same shape as `run_invites_*_organizer_active`). Fold into a follow-up migration before or with Phase 2 writers.
- **Decision**: PENDING

## Notes

- Phase 1 app callers still omit `p_map_ids`; setter NULL default keeps backfill until Phase 2 always passes the array.
- Create-side `coalesce(p_map_ids, '{}')` is extra vs literal `unnest(p_map_ids)`; default remains `'{}'` and the write always runs. Not a finding.
- `run_maps` has no UPDATE grant (replace-all). Generated `Tables["run_maps"].Update` still exists — supabase codegen, not a hand-edit.
- Phase 2 (`src/lib/run-maps.ts`, API insert F3, loaders) is not in this review.
