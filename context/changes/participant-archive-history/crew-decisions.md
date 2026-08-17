---
change_id: participant-archive-history
mode: YOLO
started: 2026-08-17
updated: 2026-08-17
status: in-progress
---

# Crew decisions — participant-archive-history

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-17T11:55 | 10x-new | created change.md (status: new) |
| 2026-08-17T12:00 | 10x-plan | complexity → MEDIUM (⭐ B) |
| 2026-08-17T12:05 | 10x-plan | round-2: history route, list+detail, same URL, RLS policy |
| 2026-08-17T12:10 | 10x-plan | round-3: no filters/pagination; S-04-style RLS matrix; /runs cross-link |
| 2026-08-17T12:15 | 10x-plan | phases → 3 (RLS → services → UI) |
| 2026-08-17T12:20 | 10x-plan-review | SOUND; F1 isUuid on getActiveRunById → fix |

## Decisions the Crew Lead made (no human)

### Critical
- **q-rls** — How confirmed participants read archived `runs` rows. Chose **A** (new SELECT policy: EXISTS confirmed row for `auth.uid()` AND archived predicate). Why: RLS is the F-01 authz boundary; DEFINER RPCs are for write races, not reads; omitting the time predicate would over-grant on active rows.
- **phase-end-commits** — Ritual git commits after each implement phase and archive. Chose **COMMIT_OK**. Why: YOLO authorizes those ritual commits; never push.

### Non-obvious
- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the signal is weak; S-07 surface is the existing run/participant/RLS stack from S-02+S-04, and `/10x-plan` will map code itself.
- **intent-from-roadmap** — Empty CLI intent. Chose **roadmap S-07 outcome** as Notes (not a bare slug humanization). Why: user named a roadmap Change ID; the slice outcome is already written.
- **q-complexity** — Plan complexity. Chose **B MEDIUM**. Why: new list/detail + first confirmed-participant SELECT on archived rows is multi-file authz/UX, not a stamp redesign (HIGH) and not a thin page (LOW).
- **q-surface** — Where history lives. Chose **B** dedicated `/runs/history` + Topbar link; leave `/dashboard` for S-08. Why: FR-015 is participant history, not organizer inventory; mixing them would collide with S-08.
- **q-depth** — What “revisit” includes. Chose **B** history list + read-only detail (map, time, confirmed roster; no mutations). Why: matches US-01 “visible archive” and S-04 handoff; mutation UI on archived runs is dead and confusing.
- **q-urls** — Archived detail URL. Chose **A** same `/runs/{id}` (guest/non-confirmed 404). Why: one canonical run URL so shared links keep working; existence must not leak.
- **q-filters** — History list filters. Chose **A** none (newest `starts_at` first). Why: personal archive is small; S-03 filters are for discovering other people’s active runs.
- **q-scale** — Pagination. Chose **A** none. Why: matches active list; first pagination in the app is not worth it at MVP volume.
- **q-testing** — How to prove confirmed-only RLS. Chose **B** lint/build + documented SQL/PostgREST matrix + UI paths. Why: the named risk is policy correctness; a test runner would dominate the slice.
- **q-discover** — How players find History besides Topbar. Chose **B** Topbar + signed-in “Your past runs” on `/runs`. Why: explains why yesterday’s run left the active list, without occupying `/dashboard`.
- **q-phases** — Phase breakdown. Chose **A** three phases (RLS → services → UI). Why: same contract→app→UI shape as S-02/S-04; RLS is the named risk and should be provable before pages.

### Obvious
- kebab-case id `participant-archive-history` unique; 1:1 GitHub link (equals roadmap Change ID S-07); next skill `/10x-plan`.
- **q1 F1** — Dual-mode `/runs/{id}` 500 on invalid UUID. Chose **fix**: `isUuid` early-return null on `getActiveRunById` and the archived loader. Why: mutation/API helpers already do this; LOW-impact one-line plan contract.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- none yet

## Stop / escape hatches

- none

## GitHub

- change-sync: #8 events new, planned, plan_reviewed (link-roadmap S-07 → Backlog)
