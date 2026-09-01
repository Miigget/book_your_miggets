<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Admin verified-finish and clan points

- **Plan**: context/changes/verified-finish-clan-points/plan.md
- **Mode**: Deep
- **Date**: 2026-09-01
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

Progress headings match Phase titles. Phase bodies use plain `- ` bullets. Checkboxes live only under `## Progress`. Success Criteria 1:1 with Progress `1.1`–`1.5`, `2.1`–`2.6`, `3.1`–`3.8`. No `docs/reference/contract-surfaces.md` (check skipped).

## Grounding

Grounding: 10/10 existing modify-paths ✓, 2 new paths expected absent (`src/pages/api/admin/runs/[id]/verify-finish.ts`, timestamped `verify_clan_run_finish` migration), 16/16 live symbols ✓, brief↔plan ✓.

Verified against code:

- Latest migration stamp is `20260901083008_complete_clan_run.sql` (no later file).
- `clans_freeze_points_and_owner` (`20260831110000_admin_clan_update.sql:23-28`) unconditionally copies `old.points`; function is `SECURITY INVOKER`; no later replace. `GRANT UPDATE` on `clans` is `(name, tag, picture_path, updated_at)` only.
- GUC precedent is `app.clan_delete_teardown` (`20260831115700_clan_friend_invites.sql:153,178-180`) — delete-invite teardown only; S-23 correctly names a **new** `app.clan_points_award`.
- `archive_run` (`20260831131219:461-468`): non-organizer non-admin → `not_found`; banned check only when caller is organizer. `complete_clan_run` (`20260901083008:330-333`): any non-organizer including admin → `not_found`. Plan copies archive, not Complete.
- Admin HTTP `src/pages/api/admin/runs/[id]/archive.ts:24-28`: `role !== admin` → JSON 403 or redirect `/`.
- `RUN_SELECT` / `RunRow` / `runFieldsFromRow` already carry `completed_at` (`runs.ts:18-35,53-80,82-98,151-177`). `runRowFromPublicRpc` hardcodes `completed_at: null` (`:511`). `mapRunRow` nulls only via `isRunActive` / archived phase, not `completed_at` (`:179-184`). Archived loaders use `RUN_SELECT` (`:657,682,706`). No extra `RunListItem` object literals.
- `AdminRunControls` still mounts when archived; only Archive is gated by `showArchive={!isArchived}` (`[id].astro:353-356`, `AdminRunControls.tsx:8-13,56-70`). Verify-after-archive has a mount point if `showVerifyFinish` is independent.
- Completed chip hides In progress today (`[id].astro:122-123,175-184`): `showCompletedChip` is true after Complete while still `lifecyclePhase === "in_progress"`.
- Complete confirm still says it does not award clan points (`OrganizerRunLifecycleControls.tsx:58-59`).
- `runs` GRANT UPDATE column list matches the plan’s re-assert (`20260901083008:379-389`).
- `listClans` already `ORDER BY points DESC` (`src/lib/services/clans.ts:252-258`).
- AGENTS.md Hard Rules still contain “Clan points stay frozen until S-23”.
- `verified_at` / `verify_clan_run_finish` are absent as expected.

Brief phases, crew-locked decisions (verify-after-archive, `no_map`, no un-verify, no screenshot gate, empty roster allowed, detail chip, no queue), and “NOT doing” match the plan body.

Riskiest claims still hold: freeze trigger is the real points lock; stamp then award; admin actor copies `archive_run`; `verified_at` stays off audience-active / roster-open / 5-cap; award target is `clans.owner_id = organizer_id`.

## Findings

### F1 — Verified-finish substitution re-shows In progress

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Verified-finish chip / `src/pages/runs/[id].astro:175-184`
- **Detail**: After Complete, a clan-only run stays `lifecyclePhase === "in_progress"` until Archive. The Completed chip is what hides In progress (`showCompletedChip` ⇒ `!showCompletedChip` is false on the In progress branch). The plan said to show Verified-finish **instead of** Completed on audience-active verified runs. Clearing `showCompletedChip` when `verifiedAt` is set would make the In progress branch true again, stacking **In progress / already started** with **Verified-finish**. That contradicts “do not stack both” and looks like the session is still live.
- **Fix**: Keep completed-or-verified as the In progress suppressor. Substitute the Completed label for Verified-finish; do not treat “hide Completed” as “clear `showCompletedChip`”.
- **Decision**: FIXED (Crew Lead YOLO — Phase 3 chip contract now requires completed-or-verified to keep hiding In progress)

### F2 — 0-row clan UPDATE does not roll back the stamp

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `verify_clan_run_finish` stamp-then-award / Critical Implementation Details
- **Detail**: Plan said stamp `verified_at` first, then `UPDATE clans`, and “if the clan UPDATE fails, the whole function rolls back.” Postgres treats a 0-row `UPDATE` as success, not an error. `RETURN 'no_clan'` after the stamp would **commit** `verified_at` and leave points unchanged; retry then hits `already_verified` and never awards. The pre-stamp `no_clan` guard covers the normal missing-clan case. The hole is concurrent clan delete (or any 0-row award) between the guard and the clan `UPDATE`.
- **Fix**: After the clan `UPDATE`, require row count 1; if 0, `RAISE EXCEPTION` (not a soft return) so the stamp rolls back.
- **Decision**: FIXED (Crew Lead YOLO — Phase 1 contract + Critical Implementation Details now require `RAISE` on 0-row clan UPDATE)

## Triage

```
TRIAGE COMPLETE (YOLO — Crew Lead applied ⭐ / single Fix on LOW findings; no human round)

  Fixed:     F1, F2   (2)
  Skipped:   none
  Accepted:  none
  Dismissed: none

  ► Verdict after fixes: SOUND
```
