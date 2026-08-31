---
change_id: manual-archive-and-extend
mode: YOLO
started: 2026-08-31
updated: 2026-08-31
status: in-progress
---

# Crew decisions — manual-archive-and-extend

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-31T12:28 | 10x-new | created change.md (status: new) |
| 2026-08-31T12:30 | gh-change-sync | #88 Backlog (new, link-roadmap) |
| 2026-08-31T12:45 | 10x-research | wrote research.md; status preparing; next = plan |
| 2026-08-31T12:55 | 10x-plan | DECISION_REQUEST complexity-round-1; Crew Lead: HIGH + backfill + DEFINER RPC + unbounded+extended_until |
| 2026-08-31T13:05 | 10x-plan | DECISION_REQUEST round-2; Crew Lead: mutation=active, dual-defense cap, preset extend buttons, derived-only elapsed |
| 2026-08-31T13:12 | 10x-plan | DECISION_REQUEST round-3; Crew Lead: DEFINER extend_run, admin Archive+Delete, archive upcoming OK |
| 2026-08-31T13:25 | 10x-plan | wrote plan.md + plan-brief.md; status planned; 3 phases |
| 2026-08-31T13:28 | gh-change-sync | #88 Backlog (planned, link-roadmap) |
| 2026-08-31T13:35 | 10x-plan-review | REVISE; F1–F3 ⭐ apply; report saved |
| 2026-08-31T13:38 | gh-change-sync | #88 Backlog (plan_reviewed) |
| 2026-08-31T13:42 | 10x-plan | REVISE patches F1–F3 applied; status planned |
| 2026-08-31T13:50 | 10x-plan-review | SOUND; F1–F3 FIXED; status plan_reviewed |
| 2026-08-31T13:52 | git | branch feature/manual-archive-and-extend from origin/main; clan-runs WIP in stash@{0} |
| 2026-08-31T14:05 | 10x-implement p1 | mismatch: no clan_only on main; Crew Lead adapt S-15 |
| 2026-08-31T14:25 | 10x-implement p1 | commit fd08d41; 1.9 N/A; worktree /tmp/bym-s24 |
| 2026-08-31T14:26 | gh-change-sync | #88 In progress (implementing) |
| 2026-08-31T14:40 | 10x-impl-review p1 | APPROVED 0 findings |
| 2026-08-31T15:00 | 10x-implement p2 | commit c9f6275; app lifecycle + 5-cap |
| 2026-08-31T15:15 | 10x-impl-review p2 | APPROVED 0 findings |
| 2026-08-31T15:35 | 10x-implement p3 | commit 5079165; HTTP/UI/docs; manuals skipped |
| 2026-08-31T15:50 | 10x-impl-review p3 | APPROVED 0 findings |
| 2026-08-31T16:10 | 10x-impl-review full | APPROVED 0 findings; status impl_reviewed |

## Decisions the Crew Lead made (no human)

### Critical

- **cutover** — Existing past-grace unstamped rows when dropping derived 1h. Chose **backfill stamp (A)**. Why: otherwise guest `/runs` floods and organizers instantly exceed the 5-cap; one-way `archived_at = starts_at + 1 hour` matches today’s public list.
- **archive-writer** — How organizer/admin stamp `archived_at`. Chose **SECURITY DEFINER RPC `archive_run` (A)**. Why: S-13 closed the column grant on purpose; PostgREST must not SET/clear the stamp; function re-checks organizer or `is_admin()`.
- **lifecycle-encoding** — Upcoming / in-progress / archived / extend after 1h is gone. Chose **unbounded in-progress until stamp; optional one-shot `extended_until` ≤ now+6h as derived auto-archive (A)**. Why: FR-003 says the clock alone does not end in-progress; extend is optional scheduled exit, not a new 6h grace for every run.
- **five-cap-enforcement** — How FR-008 max 5 is enforced and what occupies a slot. Chose **dual defense: SQL BEFORE INSERT + create_invite_only_run + app `?error=` (A)**. Why: PostgREST must not skip the cap; slot uses the same active predicate (stamp or elapsed extend).
- **elapsed-extend-stamp** — When `extended_until` elapses. Chose **derived-only; no cron/lazy UPDATE (A)**. Why: same dual-read as S-04 but only for opted-in rows; `archive_run` stays the only app writer of `archived_at`.
- **extend-writer** — How organizer writes `extended_until`. Chose **SECURITY DEFINER `extend_run` RPC; column off GRANT UPDATE (A)**. Why: same closed-grant shape as `archive_run`; PostgREST cannot forge a deadline; admin must not extend.
- **F1-player-rpc** — `list_player_public_runs` missing `extended_until`. Chose **Fix A: add column to RETURNS TABLE and map it**. Why: guest Incoming would treat elapsed-extend as active and 404 the detail link.
- **F2-cap-race** — Concurrent creates can both pass count=4. Chose **Fix A: `pg_advisory_xact_lock` on organizer_id in the cap trigger**. Why: same lock spirit as `auto_join_run`; PostgREST double-submit is the realistic path.
- **F3-banned-archive** — Plan allowed banned organizer archive; middleware blocks all non-auth POST. Chose **Fix A: align RPC with middleware; do not exempt the banned gate**. Why: no new write hole; admin can still archive; unban then organizer archives.
- **phase-1-commit** — Ritual phase-end commit. Chose **COMMIT_OK**. Why: YOLO authorizes phase-end commits; never push. Refs #88.
- **p1-rls-base** — Live RLS on this branch is S-15, not clan_only. Chose **adapt from S-15 (A)**; skip mixing S-21. Why: S-24 is parallel with Stream A; copying clan_only would put unshipped S-21 enum/RLS on this PR. When S-21 merges it retargets `is_run_active_row`. Progress 1.9 = N/A on this branch.
- **phase-2-commit** — Ritual phase-end commit. Chose **COMMIT_OK**. Why: YOLO authorizes phase-end commits; never push. Refs #88.
- **phase-3-commit** — Ritual phase-end (and epilogue if the skill runs it). Chose **COMMIT_OK**. Why: YOLO; last phase + SHA write-back. Refs #88.
- **archive-anyway** — Archive despite open manual Progress rows. Chose **continue archiving**. Why: YOLO auto-archive when only human-action boxes remain; automated 1.1–1.11, 1.14, 2.1–2.5, 3.1–3.4 passed and full impl-review is APPROVED.

### Non-obvious

- **research-vs-plan** — Whether to map the codebase before planning. Chose **hire /10x-research**. Why: S-24 is explicit blast radius on the shipped 1-hour derived window + RLS; planning without a map of predicates would guess at policies.
- **research-scope** — How wide to map. Chose **full lifecycle blast radius**. Why: archive/active predicates live in RLS, SQL helpers, list/dashboard/admin/profile, and create; a narrow map would miss the 5-run cap surface.
- **complexity** — Plan complexity. Chose **HIGH (C)**. Why: ~10 SQL window sites, stamp writer, cutover, optional extend, 5-cap, and authz; research already mapped files so we skip remapping but not [S] contracts.
- **mutation-window** — Organizer UPDATE / invites / comments / join after 1h is gone. Chose **same as audience-active (A)**. Why: one predicate; a never-archived in-progress run stays mutable the same way today’s grace did.
- **extend-ux** — Organizer extend control. Chose **confirm + 1h/2h/3h/6h buttons (A)**. Why: cap is obvious; avoids Worker vs Postgres TZ datetime-local bugs.
- **admin-archive-ux** — Where admin Archive sits vs Delete. Chose **Admin section Archive next to Delete; organizer header still has Archive + Extend (A)**. Why: non-organizer admins have no Edit header today; delete ≠ archive must stay visible.
- **archive-upcoming** — Can upcoming runs be archived to free a cap slot. Chose **archive any non-archived run; Extend stays in-progress only (A)**. Why: 5-cap is usable before S-30 owner-delete; FR-002 does not limit the button to in-progress.
- **phases** — Plan phase breakdown. Chose **3 phases: SQL contract, app lifecycle/create cap, HTTP+UI+docs**. Why: independently verifiable; Phase 1 can SQL-smoke before UI.

### Obvious

- **change-id** — Use roadmap Change ID `manual-archive-and-extend` (S-24). Why: 1:1 Kanban link; kebab-case unique vs `run-archival-lifecycle`.
- **intent** — Seed Notes from roadmap S-24 outcome + PRD refs + predecessor path. Why: YOLO empty-intent rule plus matching roadmap row.
- **gh-parent** — No `--parent`. Why: change-id equals a roadmap Change ID → 1:1 link; ignore parent.
- **branch** — `feature/manual-archive-and-extend` from `origin/main`, not `feature/clan-runs`. Why: trunk convention; do not mix S-24 commits into another slice.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 Studio 1.12–1.13: skipped (YOLO residual risk)
- Phase 2 UI 2.6–2.14: skipped (YOLO residual risk)
- Phase 3 UI 3.5–3.12: skipped (YOLO residual risk)

## Stop / escape hatches

- none

## GitHub

- change-sync: #88 events new, planned, plan_reviewed, implementing (In progress, link-roadmap)
