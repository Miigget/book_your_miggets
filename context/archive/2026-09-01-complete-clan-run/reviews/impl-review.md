<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Mark a clan run completed

- **Plan**: context/changes/complete-clan-run/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
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

Full-plan review after all Progress rows `[x]`. Phase reviews `impl-review-phase-1.md` / `-2.md` / `-3.md` are APPROVED (0 findings each). This pass re-checked the product commits independently: `8412266` (p1), `bd48c2f` (p2), `907970f` (p3), `3eb10c7` (epilogue). Unrelated dirty/untracked foundation files ignored as instructed.

**Planned vs product diff** (vs `main`): migration `supabase/migrations/20260901083008_complete_clan_run.sql`, generated `src/types/database.ts`, `src/lib/services/runs.ts`, `src/lib/services/participants.ts`, `src/pages/api/runs/[id]/complete.ts`, `OrganizerRunLifecycleControls.tsx`, `RunParticipantActions.tsx`, `src/pages/runs/[id].astro`, `ActiveRunCard.astro`, `DashboardRunCard.astro`, `RunPreviewCard.astro`, `AGENTS.md`. Extra files in those commits are 10x artifacts (plan Progress, `change.md`, `crew-decisions.md`, roadmap S-22, plan-review reports) — not product drift. `/runs/{id}/edit` has no product diff — completed runs 404 via `getOwnedActiveRunForEdit` as planned.

**Locked product (cross-phase):**

- Distinct `completed_at`; `complete_clan_run` does not `UPDATE clans`, does not call `archive_run`, does not touch `archived_at` / `extended_until`.
- `is_run_active_row` / `is_run_in_active_window` / `can_view_run` / 5-cap trigger / comment INSERT / screenshot policies do not mention `completed_at`. Comments stay writable (`requireActiveRun` still audience-active only; `canPostOrLike` still confirmed ∧ !archived ∧ !banned).
- Roster/edit/extend freeze via `is_run_roster_open_row` (policies + `auto_join_run` `not_active` + `extend_run` `already_completed` + app `CLAN_RUN_COMPLETED_FROZEN` / edit 404 / inactive-family patch reject).
- Actor is organizer + current clan owner + `clan_only`. No `userOwnsClan` pre-check on POST complete (SOUND-F1). UI gate only. No officer copy. No admin complete/verify (`AdminRunControls` Archive vs Delete only; no `/api/admin/runs/{id}/complete`).
- Completed chip only while audience-active (`lifecyclePhase !== "archived"`). In progress suppressed. After Archive, Past / Recent / archived `/runs/{id}` stay **Archived**. `RunLifecyclePhase` unchanged (no `completed` value).
- GRANT UPDATE on `runs` for authenticated is the planned column list (no `completed_at` / `archived_at` / `extended_until` / `organizer_id`). `complete_clan_run` DEFINER, `search_path = ''`, EXECUTE authenticated only (anon denied).
- No raw PostgREST in `?error=` (`completeClanRun` logs then domain `RunError`). Banned POST middleware still covers `/api/runs/{id}/complete`. `PROTECTED_ROUTES` unchanged. `list_player_public_runs` unchanged; `runRowFromPublicRpc` stubs `completed_at: null`. 5-cap still ignores `completed_at`.

**Automated re-run this review:**

- Local migration `20260901083008` applied (`supabase migration list --local`).
- Live DB: `completed_at` exists; `complete_clan_run` DEFINER; `is_run_roster_open_row` STABLE not DEFINER; EXECUTE grants as planned; authenticated UPDATE columns exclude stamp columns.
- `npx astro sync` + `npm run lint` (0 errors, pre-existing warnings only) + `npm run build` pass. Worker manifest includes `/api/runs/[id]/complete`; bundle calls `complete_clan_run`.
- Types: `Tables<"runs">.completed_at: string | null`; `Functions["complete_clan_run"]` args `{ p_run_id: string }` returns `string`.

Progress manual rows 1.5 / 2.4–2.6 / 3.2–3.7 are marked done; YOLO skipped Studio/browser click-through (logged in `crew-decisions.md`). Code paths and SQL grants match the plan contract. Residual risk: no browser MCP in this specialist session.

## Findings

None.
