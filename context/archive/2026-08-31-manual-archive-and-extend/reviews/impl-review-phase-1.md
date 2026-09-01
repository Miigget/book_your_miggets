<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual archive, extend, and active-run cap

- **Plan**: `context/changes/manual-archive-and-extend/plan.md`
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

## Review notes (not findings)

Known adaptations, accepted by crew / this review invocation — do not reopen as drift:

- Progress **1.9 N/A**: live RLS rewritten from S-15 (`20260824101006`). `clan_only` / `is_same_clan` are absent on this branch (not on `origin/main`). Catalog confirmed: `can_view_run` and `runs_select_active_authenticated` have no `clan_only`. S-21 must retarget `is_run_active_row` when it merges (`crew-decisions.md` **p1-rls-base**).
- Progress **1.12–1.13** Studio: left unchecked; skipped as YOLO human-action (residual risk: grants/column existence were re-checked via `information_schema` / `pg_proc` instead of Studio UI).
- `list_player_public_runs`: `DROP FUNCTION` then `CREATE` + re-GRANT `anon, authenticated` because `CREATE OR REPLACE` cannot change `RETURNS TABLE`. Column `extended_until` sits after `archived_at`; query still has no time predicate.

`change.md` left **`implementing`**. This is a mid-loop phase review (phases 2–3 remain). The generic skill stamp `impl_reviewed` would block `/10x-implement` phase 2 (that skill only flips `planned` / `plan_reviewed` → `implementing`). Full-plan review after phase 3 should stamp `impl_reviewed`.

### Git vs plan (Phase 1)

| Planned | In diff | Verdict |
|---------|---------|---------|
| `supabase/migrations/<ts>_manual_archive_and_extend.sql` | `20260831131219_manual_archive_and_extend.sql` (after `20260831115700`) | MATCH |
| `src/types/database.ts` via `npm run db:types` | regenerated; byte-identical to `supabase gen types typescript --local` | MATCH |
| Phase 2–3 app/UI files | unchanged (`run-lifecycle.ts` still 1h) | expected |

Unplanned code: none. Extra paths in the commit (`context/changes/…`, `context/foundation/roadmap.md`) are 10x workflow artifacts, not product scope creep.

### Contract checklist (plan vs live catalog)

- `extended_until timestamptz` nullable; comment is scheduled audience-exit, not a grace on every run.
- Backfill precedes policy rewrite in the same migration.
- `is_run_active_row(archived_at, extended_until)` `LANGUAGE sql STABLE`, invoker, no `SELECT` on `runs`; `EXECUTE` for `anon` + `authenticated`.
- Audience 1h conjunct replaced with the helper on live `can_view_run`, `runs_select_active_{anon,authenticated}`, `runs_update_own` USING+WITH CHECK, invite organizer policies, `is_run_in_active_window` (still `AND can_view_run`), `auto_join_run`.
- Privilege SELECT (`runs_select_own_organizer`, `runs_select_admin`, `runs_select_confirmed_participant`) untouched and still unbounded.
- Cap: `pg_advisory_xact_lock(8724, hashtext(organizer_id))` then count; trigger `REVOKE` from `public`/`anon`/`authenticated`; `create_invite_only_run` UX pre-check `active_run_cap` / `P0001`.
- `archive_run` / `extend_run` `SECURITY DEFINER`, `search_path = ''`, `EXECUTE` `authenticated` only (not `anon`). Soft codes match the plan. Organizer banned → `banned`; admin non-owner archive works; admin non-owner extend → `not_found`.
- Column UPDATE for `authenticated`: `title, map_id, map_category, starts_at, max_participants, min_points, join_mode, visibility` — not `archived_at`, not `extended_until`, not `organizer_id`.

### Automated verification (re-run this review)

| Item | Result |
|------|--------|
| 1.1 migration present on local DB | PASS — `schema_migrations` has `20260831131219` |
| 1.2 `db:types` | PASS — regen diff empty; `extended_until` on `runs` Row/Insert/Update; `archive_run` / `extend_run`; RPC Returns includes `extended_until` |
| 1.3 live defs use helper, no 1h audience window | PASS (`extend_run` still contains `interval '1 hour'` for duration math only) |
| 1.4 backfill predicate | PASS — 2h-ago stamps; 10m-ago stays null |
| 1.5 anon / privilege SELECT | PASS — anon sees public upcoming+in-progress only; elapsed extend + stamp hidden; organizer/admin/confirmed still SELECT stamped |
| 1.6 5-cap | PASS — 6th INSERT `active_run_cap`; invite RPC `active_run_cap`; archive then INSERT ok; elapsed-extend unstamped does not count |
| 1.7 `archive_run` + grants | PASS — organizer / `already_archived` / stranger `not_found` / banned organizer / admin stamps banned organizer’s run; PostgREST-role UPDATE of `archived_at` and `extended_until` denied |
| 1.8 `extend_run` | PASS — 1/2/3/6 one-shot; upcoming `not_in_progress`; hours 4/7 `invalid_hours`; admin non-owner `not_found` |
| 1.9 clan_only | N/A on this branch (see notes) |
| 1.10 `npm run lint` | PASS (exit 0; existing warnings only) |
| 1.11 `npm run build` | PASS |
| 1.14 `list_player_public_runs` | PASS — Returns/SELECT include `extended_until`; filter is public + organizer-or-confirmed only |
| 1.12–1.13 Studio | pending / YOLO skip |

## Lessons (priors)

- Stale-docs lesson applies in **Phase 3** (`AGENTS.md` / `prd.md` 1h copy) — not this phase.
- Opaque `?error=` lesson applies in **Phase 3** HTTP — not this phase.
- No SQL injection: RPCs use typed args; policies call helpers, not string-built SQL.
