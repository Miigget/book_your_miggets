---
change_id: run-comments
mode: YOLO
started: 2026-08-20
updated: 2026-08-20
status: in-progress
---

# Crew decisions — run-comments

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-20T11:01 | 10x-new | created change.md (status: new) |
| 2026-08-20T11:15 | 10x-plan | complexity MEDIUM (8 questions) — Crew Lead A |
| 2026-08-20T11:20 | 10x-plan | round-1: organizer=B, archived=B, own-mutate=A, admin-delete=A |
| 2026-08-20T11:25 | 10x-plan | round-2: likes-ui=A, content=A, threading=A, author-left=A |
| 2026-08-20T11:30 | 10x-plan | phases=A (schema → API → UI) |
| 2026-08-20T11:35 | 10x-plan | plan.md + plan-brief.md written; S-12 planning; #45 planned |
| 2026-08-20T11:40 | 10x-plan-review | REVISE; triage F1=A, F2=A → SOUND |
| 2026-08-20T11:50 | 10x-implement p1 | Schema+RLS; commit 9e16af7; manual SQL verified |
| 2026-08-20T12:00 | 10x-impl-review p1 | APPROVED (0 findings) |
| 2026-08-20T12:20 | 10x-implement p2 | Service+API; commit b004669; 2.3–2.10 curl-verified |
| 2026-08-20T12:30 | 10x-impl-review p2 | APPROVED (0 findings) |
| 2026-08-20T12:40 | 10x-implement p3 | Run page comments UI; curl smoke vs localhost:4321 |

## Decisions the Crew Lead made (no human)

### Critical
- **visibility** — Who can read run comments? Human seed: only confirmed (accepted) participants and admins. Chose **participants + admins**, not PRD candidate default (same visibility as the run page / guests on public runs). Why: product owner overrode S-12 Unknown + PRD open question #2 in the crew invocation.
- **likes** — Are comment likes in scope? Human seed: comments can be liked. Chose **in scope**. Why: explicit requirement in the invocation; treat as part of S-12, not a later slice.
- **plan-organizer** — Unseated organizer vs comments. Chose **B: read-only**. Why: they already moderate the run; posting stays confirmed-only so leaving the seat does not restore a write slot.
- **plan-archived** — Comments after archive. Chose **B: read on archived, post/like only while active**. Why: same mutation window as apply/leave; debrief remains visible on `/runs/history`.
- **plan-admin-delete** — Admin safety valve. Chose **A: hard-delete any comment**. Why: UGC needs takedown without deleting the whole run; matches existing admin-delete-run pattern.
- **plan-author-left** — Comments after author leaves roster. Chose **A: keep comments, freeze new posts**. Why: leave-team must not erase coordination history; NicknameLink still works via user_id.

### Non-obvious
- **research skip** — Hire `/10x-research` before plan? Chose **skip**. Why: YOLO default when the research signal is weak; this is a known S-12 slice with a clear product seed. Plan specialist may still spawn nested Explore agents.
- **plan-q1-complexity** — Complexity HIGH/MEDIUM/LOW? Chose **A: MEDIUM, 8 questions**. Why: two tables + RLS + island on a public page, but existing apply/approve patterns; HIGH would pad convention questions, LOW would skip organizer/archived/moderation.
- **plan-own-mutate** — Author edit/delete? Chose **A: append-only**. Why: smallest slice; owner did not ask for edit; admin delete covers abuse.
- **plan-likes-ui** — Like presentation. Chose **A: count + my liked state**. Why: enough social signal without a liker roster; guests/admins/unseated organizers see count only.
- **plan-content** — Comment body rules. Chose **A: plain text, trim, max 1000**. Why: no markdown XSS surface; 1000 covers server/time notes; 280 is too tight.
- **plan-threading** — Thread shape. Chose **A: flat chronological**. Why: KoG coordination is a short log; replies add parent_id + delete-orphan UI beyond S-12.
- **plan-phases** — Phase breakdown. Chose **A: 3 phases (schema+RLS → service+API → run page UI)**. Why: matches apply-and-approve; keeps RLS verifiable before services; admin delete stays in phase 2 so UI is one pass.
- **review-F1** — `loadActiveRunForMutation` vs CommentError. Chose **A: duplicate active-window query in comments.ts**. Why: preserve CommentError for 2.7; do not refactor participants.ts in this slice.
- **review-F2** — Duplicate `?error=` banners. Chose **A: `?commentError=` for the three new routes**. Why: leave apply/leave UX on `?error=`; comments errors land only on RunComments.

### Obvious
- change-id `run-comments` is kebab-case and matches roadmap S-12 → gh-change-sync 1:1 (no `--parent`).
- Next skill after `/10x-new`: `/10x-plan` (no bug+fix / frame signal).

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 manual: SQL-verified by implementer (YOLO)
- Phase 2 manual: curl-verified by implementer (YOLO)
- Phase 3 manual 3.3–3.11: smoke-tested via curl against `http://localhost:4321` (dev quick-login). Residual: `window.confirm` not clicked (curl POSTs skip JS); archived admin-delete error banner not replayed (active `?commentError=` banner verified)

## Stop / escape hatches

- none

## GitHub

- change-sync: #45 events new, planned, plan_reviewed, implementing (In progress, link-roadmap S-12)
