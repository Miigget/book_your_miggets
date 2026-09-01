<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Mark a clan run completed

- **Plan**: context/changes/complete-clan-run/plan.md
- **Mode**: Deep
- **Date**: 2026-09-01
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 1 observation
- **Re-review**: after REVISE. Prior report: `context/changes/complete-clan-run/reviews/plan-review-1.md` (verdict REVISE; F1–F4 FIXED in plan.md).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Prior findings (confirmed in plan.md)

| Prior | Status | Where in revised plan |
|-------|--------|------------------------|
| F1 Progress 3.6 other-clan-owner, 3.7 admin, 1:1 with Success Criteria | FIXED | Phase 3 Manual items 5–6 ↔ Progress `3.6` / `3.7` |
| F2 Authenticated smokes: apply INSERT / leave DELETE / organizer UPDATE fail after complete | FIXED | Phase 1 Automated smoke + Progress `1.3` |
| F3 Completed chip only when audience-active; Archived wins on Past/Recent/archived detail | FIXED | Desired End State, Critical Implementation Details, Phase 3 chip contract, Manual 3 / Progress `3.4` |
| F4 `runRowFromPublicRpc` sets `completed_at: null`; `list_player_public_runs` unchanged | FIXED | Phase 2 DTO contract; Phase 1 “Do not change `list_player_public_runs`” |

Progress headings match Phase titles. Phase bodies use plain `- ` bullets. Checkboxes live only under `## Progress`. Phase 1 and Phase 3 Success Criteria 1:1 with Progress. Phase 2 Manual has a standalone `clans.points` bullet folded into Progress `2.5` (that row already says “points unchanged”) — not re-raised.

## Grounding

Grounding: 12/12 existing modify-paths ✓, 2 new paths expected absent (`src/pages/api/runs/[id]/complete.ts`, timestamped `complete_clan_run` migration), 18/18 live symbols ✓, brief↔plan ✓.

Verified against code: latest migration `20260901083000_clan_only_on_is_run_active_row.sql`; `runs_update_own` USING/WITH CHECK as cited; `GRANT UPDATE` column list matches the plan’s re-assert (no `archived_at` / `extended_until`); comment INSERT + screenshot INSERT use `is_run_in_active_window`; `auto_join_run` / `extend_run` use `v_run public.runs` + `select *` (so `completed_at` is on the record after `ALTER TABLE`; they still need `CREATE OR REPLACE` for the new checks); `auto_join_run` miss returns `not_active`; kick is `UPDATE` to `denied` (`kickParticipant`); organizer DELETE-as-kick policy was dropped in `20260821094355`; `archive.ts` is auth + RPC only (no `userOwnsClan`); `RUN_SELECT` / `RunRow` / `runRowFromPublicRpc` still lack `completed_at`; `loadActiveRunForMutation` and `requireActiveRun` use `isRunActive` only; `canPostOrLike` is confirmed ∧ !archived ∧ !banned; `can_view_run` returns true for `is_admin()` before visibility; banned POST middleware already covers `/api/` except `/api/auth/`; Dashboard Incoming Edit is `showEdit && !isArchived`; `[id].astro` wraps Edit + `OrganizerRunLifecycleControls` in one `isOrganizer && !isArchived` block.

Brief phases, crew-locked decisions, and “NOT doing” match the plan body.

Riskiest claims still hold: do not put `completed_at` on `is_run_active_row` / `is_run_in_active_window`; actor is organizer + current clan owner + `clan_only`; kick freeze is organizer UPDATE.

## Findings

### F1 — Optional `userOwnsClan` pre-check on complete can leak restricted runs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 Complete service (“the API route may still call `userOwnsClan`”)
- **Detail**: `userOwnsClan` is true for *any* clan owner, not the organizer of this run. A pre-RPC `if (!userOwnsClan) return CLAN_ONLY_OWNER_REQUIRED` would give a non-organizer who does not own a clan an honest owner string instead of the RPC’s `not_found` → “Run not found or no longer active”. That splits 404-like vs honest and can leak that a restricted run exists. Manual 2.6 / Progress `2.6` require non-owner POSTs not to leak. `archive.ts` does not pre-check ownership — it only calls the RPC. The HTTP contract already says call `completeClanRun` the same way; the “may still call” sentence is the footgun. `not_owner` is only valid after the RPC knows the caller is organizer.
- **Fix**: Delete the “may still call `userOwnsClan`” allowance. Complete route matches `archive.ts` (signed-in + `completeClanRun` only). Map RPC `not_owner` to the owner string inside `completeClanRun`.
- **Decision**: FIXED (Crew Lead YOLO — complete route = archive.ts; no `userOwnsClan` pre-check)

### F2 — Edit and Archive share one `!isArchived` wrapper on detail

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 Organizer Complete control / `src/pages/runs/[id].astro`
- **Detail**: Today Edit and `OrganizerRunLifecycleControls` (Archive + Extend) sit in one `isOrganizer && !isArchived` block. Adding `!completedAt` to that wrapper would hide Archive after Complete and fail Success 3.2 / Progress `3.2` (“Archive stays”). The phase contract already splits the four behaviors (Complete visibility, hide Extend, keep Archive, hide Edit). Implementer must split the Edit link from Archive, not fold `!completedAt` onto the shared wrapper.
- **Fix**: No plan edit required unless the implementer wants an explicit “do not put `!completedAt` on the shared wrapper” note. Follow the Phase 3 contract as written.
- **Decision**: ACCEPTED (Crew Lead YOLO — no plan edit; Phase 3 implementer must split Edit from Archive, not fold `!completedAt` onto the shared wrapper)
