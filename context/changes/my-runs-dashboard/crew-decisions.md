---
change_id: my-runs-dashboard
mode: YOLO
started: 2026-08-18
updated: 2026-08-18
status: complete
---

# Crew decisions — my-runs-dashboard

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-18 | 10x-new | created change.md (status: new); title from S-08 / FR-005 intent |
| 2026-08-18 | 10x-plan | complexity gate: LOW, 5 questions |
| 2026-08-18 | 10x-plan | round-1: manage=A, inventory=C, pending=B, archived-detail=A |
| 2026-08-18 | 10x-plan | round-2: empty=A, phases=A (3 phases) |
| 2026-08-18 | 10x-plan | plan.md + plan-brief.md written; status planned |
| 2026-08-18 | gh-change-sync | #9 planned → Backlog |
| 2026-08-18 | 10x-plan-review | SOUND; F1 LOW: leave-team-then-archive test recipe |
| 2026-08-18 | gh-change-sync | #9 plan_reviewed → Backlog |
| 2026-08-18 | 10x-implement p1 | listRunsForOrganizer; commit 38a3ac9 on feature/my-runs-dashboard |
| 2026-08-18 | gh-change-sync | #9 implementing → In progress |
| 2026-08-18 | 10x-impl-review p1 | APPROVED (0 findings) |
| 2026-08-18 | 10x-implement p2 | dashboard UI; commit d00e53b |
| 2026-08-18 | 10x-impl-review p2 | APPROVED (0 findings) |
| 2026-08-18 | 10x-implement p3 | getArchivedRunForOrganizer; commits 113597c + 2b21e40; status implemented |
| 2026-08-18 | gh-change-sync | implemented FAILED (GraphQL rate limit; retry around archive) |
| 2026-08-18 | 10x-impl-review p3 | APPROVED (0 findings; organizer_id === viewer) |
| 2026-08-18 | 10x-impl-review full | APPROVED (0 findings); status impl_reviewed |
| 2026-08-18 | 10x-archive | pending (YOLO continue despite manual Progress rows) |

## Decisions the Crew Lead made (no human)

### Critical
- **q-manage** — What “manage” means for this slice. Chose **A (view + deep-link to `/runs/{id}`)**. Why: FR-005 is view-only; accept/deny already live on detail; inbox/edit/cancel would blow a nice-to-have slice.
- **q-inventory** — Which created runs belong on the dashboard. Chose **C (two sections: Active I created, then Past I created)**. Why: FR-005 says all created runs; two sorts (soonest-first active, newest-first past) match S-01/S-07 without mixing lifecycles.
- **q-archived-detail** — Can an organizer open archived runs they created but left. Chose **A (organizer archived-detail loader)**. Why: listing past created runs with 404 cards is worse than a page-gate like S-09; owner SELECT already exists in RLS.
- **commit-p1** — Phase-end ritual commit. Chose **COMMIT_OK**. Why: YOLO auto-approves phase-end commits; no push.
- **commit-p2** — Phase-end ritual commit. Chose **COMMIT_OK**. Why: YOLO auto-approves phase-end commits; no push.
- **commit-p3** — Phase-end ritual commit. Chose **COMMIT_OK**. Why: YOLO auto-approves phase-end commits; no push.
- **archive-anyway** — Archive despite pending Progress. Chose **Continue archiving**. Why: YOLO auto-archives when only manual rows remain; automated 1.1–1.5 / 2.1–2.4 / 3.1–3.5 are done.
- **commit-archive** — Archive ritual commit. Chose **COMMIT_OK**. Why: YOLO auto-approves archive commits; no push.

### Non-obvious
- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO/critical skip research when the signal is weak; this is a known dashboard slice off existing run list/dashboard patterns (S-01, S-07), not an unknown surface.
- **q-complexity** — Plan complexity. Chose **A (LOW, 5 questions)**. Why: fill existing `/dashboard` stub by copying S-07 list pattern; no migration for view; “manage” forks belong in the 5 product questions, not a MEDIUM questionnaire.
- **q-pending** — How to signal approval work on the dashboard. Chose **B (pending count on each active approval-required card)**. Why: bounded “manage” feel without a cross-run inbox; reuse `confirmedCountsForRuns` N+1 pattern; omit on auto-join and archived.
- **q-empty** — Empty/zero-organizer UX. Chose **A (one hero empty when zero created; otherwise both headings + compact empty line per empty section)**. Why: discoverable Dashboard + Create CTA; avoids two stacked empty cards for first-timers.
- **q-phases** — Phase breakdown. Chose **A (3 phases: organizer list service → dashboard UI → archived-detail loader)**. Why: same cadence as S-09; each phase has a verifiable contract; 404 window for unseated archived cards is only mid-loop.

### Obvious
- **next-skill** — Default `/10x-plan` after new (no bug/frame signal).
- **gh-parent** — change-id equals roadmap Change ID `my-runs-dashboard` (S-08) → 1:1 link, no `--parent`.
- **plan-review-F1** — Leave-team test recipe vs active-window gate. Chose **A (fix in plan: leave while active, then SQL-archive)**. Why: LOW-impact one-line Fix; `leaveTeamAsOrganizer` cannot run after archival.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1.6 / 1.7: skipped (YOLO residual risk) — leave-team + pending-count behavior not exercised in a running app
- Phase 2.5–2.13: skipped (YOLO residual risk) — guest redirect, empty/mixed UX, pending vs auto-join, deep-link, unseated 404, history leak, banned GET
- Phase 3.6–3.11: skipped (YOLO residual risk) — 404 matrix (unseated/seated organizer, guest, unrelated, admin) and leave-then-archive recipe not session-tested

## Stop / escape hatches

- none

## GitHub

- change-sync: #9 (roadmap S-08 1:1). Events: new → Backlog; planned → Backlog; plan_reviewed → Backlog; implementing → In progress. `implemented` hit GraphQL rate limit (retry with archive).
