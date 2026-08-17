---
change_id: admin-player-archive-view
mode: YOLO
started: 2026-08-17
updated: 2026-08-17
status: complete
---

# Crew decisions — admin-player-archive-view

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-17T13:27 | 10x-new | created change.md (status: new) |
| 2026-08-17T13:30 | gh-change-sync | --event new → issue #10 Backlog (link-roadmap) |
| 2026-08-17T13:32 | 10x-plan | DECISION complexity → A (MEDIUM, 7–8 questions) |
| 2026-08-17T13:35 | 10x-plan | DECISION round-1 → profile-access A, entry A, archived-detail A, history-membership A |
| 2026-08-17T13:38 | 10x-plan | DECISION round-2 → missing-empty A, banned-player A, profile-chrome A, archived-delete A |
| 2026-08-17T13:42 | 10x-plan | plan.md + plan-brief.md written; status planned |
| 2026-08-17T13:44 | gh-change-sync | --event planned → #10 Backlog |
| 2026-08-17T13:48 | 10x-plan-review | SOUND; F1 observation (delete ?error= banner) deferred to Phase 2 |
| 2026-08-17T13:55 | 10x-implement p1 | profile + list landed; lint/build ok; manuals skipped |
| 2026-08-17T13:58 | 10x-implement p1 | COMMIT_OK → aeca0db; gh-change-sync implementing → #10 In progress |
| 2026-08-17T14:05 | 10x-impl-review p1 | APPROVED (0 findings) |
| 2026-08-17T14:12 | 10x-implement p2 | admin bypass + F1 Banner; lint/build ok |
| 2026-08-17T14:15 | 10x-implement p2 | COMMIT_OK → 62a1627 |
| 2026-08-17T14:20 | 10x-impl-review p2 | APPROVED (0 findings) |
| 2026-08-17T14:25 | 10x-impl-review | full APPROVED; change.md → impl_reviewed |
| 2026-08-17T14:28 | gh-change-sync | --event implemented |
| 2026-08-17T14:30 | 10x-archive | YOLO auto-archive (only manuals remain) |

## Decisions the Crew Lead made (no human)

### Critical
- **profile-access** — Where the player profile lives and who may open it. Chose **A (`/admin/users/{id}`, admin-only)**. Why: inherits S-06 `/admin` 404; members never see a public-looking profile URL; option C is a social profile already ruled out.
- **archived-detail** — What `/runs/{id}` does when an admin opens a card from the player's history. Chose **A (same URL, admin bypasses confirmed-seat 404)**. Why: FR-016 history is useless if every card 404s; guest/member 404 stays; no second detail surface.
- **history-membership** — What “full archived run history” includes. Chose **A (same as S-07: current confirmed + archived)**. Why: reuse `listArchivedRunsForParticipant`; pending/denied and organizer-who-left are S-07/S-08, not this slice.
- **banned-player** — May an admin open a banned player's archive. Chose **A (yes, same as unbanned)**. Why: moderation after a ban needs past runs; `/admin` already lists banned users so a 404 would break that path.
- **phase-1-commit** — Phase-end ritual commit. Chose **COMMIT_OK**. Why: YOLO authorizes phase-end commits; do not push.
- **phase-2-commit** — Phase-end ritual commit. Chose **COMMIT_OK**. Why: YOLO authorizes phase-end commits; do not push.
- **archive** — Archive despite unchecked manuals. Chose **yes**. Why: YOLO auto-archive when only manual Progress rows remain; both phase reviews and full review APPROVED.

### Non-obvious
- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the signal is weak; S-07 archive patterns and S-06 admin gating already exist and `/10x-plan` will map them.
- **complexity** — Plan complexity HIGH/MEDIUM/LOW. Chose **A (MEDIUM, 7–8 questions)**. Why: first profile URL + admin authz widening is more than a mechanical reuse of S-07, but no schema/RPC; ⭐ matches the repo.
- **entry** — How an admin reaches the profile. Chose **A (link from `/admin` users table only)**. Why: no dead links on public rosters; discoverable from the only admin user list.
- **missing-empty** — Invalid/unknown id vs player with zero archives. Chose **A (404 if no profile; empty list if player exists)**. Why: matches `/runs/{id}` 404 and `/runs/history` empty copy; admin can still open a new member.
- **profile-chrome** — Extra fields on the profile page. Chose **A (nickname, user id, archive list only)**. Why: smallest FR-016 surface; ban/verify stay on `/admin`; no duplicate S-06 forms.
- **archived-delete** — Keep Delete run on archived `/runs/{id}` after the admin bypass. Chose **A (yes, same as today)**. Why: FR-010 is not active-only; one rule; `window.confirm` stays the guard.
- **plan-review-F1** — Whether to block on archived-detail swallowing delete `?error=`. Chose **apply in Phase 2 (non-blocking)**. Why: SOUND overall; Banner next to AdminRunControls is a one-line UX fix, not a plan rewrite. Implemented in Phase 2.

### Obvious
- change-id `admin-player-archive-view` matches roadmap S-09 → gh-change-sync 1:1 link, no `--parent`.
- Intent seeded from roadmap S-09 / FR-016 rather than empty slug humanization.
- Next stage `/10x-plan` (workflow default).
- Continue to Phase 2 after Phase 1 APPROVED.
- Full impl-review after both phases APPROVED.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 manual 1.6–1.12: skipped (YOLO residual risk) — guest/member 404 on `/admin/users/{id}`, empty/banned profile, card click
- Phase 2 manuals 2.5–2.10: skipped (YOLO residual risk) — guest/member/left-organizer 404 on archived `/runs/{id}`, back-link split, Delete confirm

## Stop / escape hatches

- none

## GitHub

- change-sync: #10 events new, planned, plan_reviewed, implementing, implemented, archived (link-roadmap S-09)
