<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: My-runs dashboard Implementation Plan

- **Plan**: context/changes/my-runs-dashboard/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-18
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 38a3ac9

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

Phase 1 product change is `src/lib/services/runs.ts` only (`listRunsForOrganizer`, `OrganizerRunListItem`, `pendingCountsForRuns`, leak-guard comment updates). Commit 38a3ac9 also seeded the change folder (plan, brief, plan-review, crew-decisions, change.md) — expected 10x artifacts, not product scope creep. No Phase 2/3 files (`dashboard.astro`, `getArchivedRunForOrganizer`, `[id].astro` loader order). No migration.

### Plan vs actual (Phase 1)

| Planned item | Verdict |
|--------------|---------|
| Export `listRunsForOrganizer(supabase, userId)` → `{ active: OrganizerRunListItem[]; archived: ArchivedRunListItem[] }` | MATCH |
| `OrganizerRunListItem` = `RunListItem` + `pendingCount: number` | MATCH (`runs.ts:46-48`) |
| Query `runs` with `RUN_SELECT` and `.eq("organizer_id", userId)` — not from `run_participants` | MATCH (`runs.ts:296`) |
| Split with `isRunActive(starts_at, archived_at, now)` | MATCH (`runs.ts:307-312`) |
| Sort active `starts_at` ascending, archived descending | MATCH |
| `confirmedCountsForRuns` on each subset | MATCH (parallel with pending) |
| Pending head-count only for active `join_mode = 'approval_required'`; others `pendingCount = 0` | MATCH (`runs.ts:314, 331`) |
| Map active with `mapRunRow` (drop unexpected archived), archived with `mapArchivedRunRow` | MATCH |
| Empty ownership → `{ active: [], archived: [] }` | MATCH (`runs.ts:303-305`) |
| DB error → throw; pages map to friendly copy | MATCH (throw; no page in this phase) |
| Comments: keep participant-history warning; point organizer inventory at dedicated loader; do not change participant/admin behavior | MATCH (comments only on `listArchivedRunsForParticipant`, `getArchivedRunForParticipant`, `getArchivedRunForAdmin`; function bodies unchanged) |

`getArchivedRunForParticipant` also gained one clarifying sentence. Extra comment, not a behavior change — not scored as scope creep.

### Safety & patterns

- Authz: loader filters `.eq("organizer_id", userId)` with parameterized PostgREST. Non-admin RLS (`runs_select_own_organizer`) cannot return another user’s rows. Admin RLS could if a caller passed a foreign id — same trust model as `listArchivedRunsForParticipant`; Phase 2 will pass `user.id`. No secrets, no `service_role`, no new policy.
- Pending SELECT is allowed by existing `run_participants_select_organizer` (`organizer_id = auth.uid()`). Auto-join ids are omitted from `pendingCountsForRuns`, so `pendingCount` stays 0 even if a stray pending row existed.
- N+1 head-count copies `confirmedCountsForRuns` as the plan required. MVP volume / no pagination is locked.
- Errors throw at the DB boundary (`Failed to list organizer runs` / `Failed to count pending participants`). No `err.message` in UI this phase (lessons.md applies in Phase 2).
- Split uses `isRunActive` first (respects stamped `archived_at`), then `mapRunRow` / `mapArchivedRunRow` — matches plan-review load-bearing note. Naming, throw style, and `RUN_SELECT` match sibling loaders in the same file.

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 1.1 `listRunsForOrganizer` exists and filters by `organizer_id` (not confirmed membership) | PASS — `runs.ts:291-296`; no `run_participants` membership query |
| 1.2 Pending counts queried only for active `approval_required` runs | PASS — `pendingIds` from `activeRows` + `join_mode === "approval_required"` |
| 1.3 `listArchivedRunsForParticipant` / `getArchivedRunForParticipant` unchanged | PASS — comment-only diff; callers (`history.astro`, `admin/users/[id].astro`, `[id].astro`) untouched |
| 1.4 `npm run lint` | PASS — exit 0; 18 pre-existing `no-console` warnings in unrelated files, 0 errors; none in `runs.ts` |
| 1.5 `npm run build` | PASS — `astro build` complete |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 1.6 Function returns the viewer’s created active + archived runs, including leave-team, not join-only runs | `[ ]` | YOLO skipped (human-action). Code filters `organizer_id` only; leave-team does not hide rows. Residual risk, not a finding. |
| 1.7 Auto-join active runs have `pendingCount === 0`; approval-required pending applications increment the count | `[ ]` | YOLO skipped. `pendingIds` excludes auto-join; `?? 0` fills the rest. Residual risk, not a finding. |

## Findings

None.

## Residual risk

Progress 1.6–1.7 were not exercised against a running app (YOLO human-action skip). Highest residual: leave-team organizer still listed (code path is ownership-only; not session-tested) and pending-count correctness on mixed join modes (query restriction looks correct; not counted against live `run_participants` rows). Phase 2 Past cards for unseated organizers will 404 until Phase 3 (planned).

## Proceed

YOLO Done path: report saved; no triage. `change.md` stays `implementing` (phase-scoped review; full-plan `impl_reviewed` is after all phases). Next stage is implement Phase 2.
