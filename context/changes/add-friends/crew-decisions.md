---
change_id: add-friends
mode: YOLO
started: 2026-08-21
updated: 2026-08-21
status: in-progress
---

# Crew decisions — add-friends

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-21T12:49 | 10x-new | created change.md (S-11 intent) |
| 2026-08-21T12:51 | gh-change-sync | --event new → #44 Backlog (link-roadmap) |
| 2026-08-21T12:55 | 10x-plan | DECISION_REQUEST complexity-round-1 → A/A/A/A |
| 2026-08-21T13:00 | 10x-plan | DECISION_REQUEST round-2 → A/A/A/A |
| 2026-08-21T13:05 | 10x-plan | DECISION_REQUEST phases → A |
| 2026-08-21T13:10 | 10x-plan | STAGE_RESULT planned (plan.md + plan-brief.md) |
| 2026-08-21T13:12 | gh-change-sync | --event planned → #44 Backlog |
| 2026-08-21T13:20 | 10x-plan-review | REVISE (0C 3W 1O); apply ⭐ F1/F2 + F3/F4 |
| 2026-08-21T13:25 | 10x-plan | REVISE pass applied F1–F4; status planned |
| 2026-08-21T13:30 | 10x-plan-review | SOUND (0C 0W); status plan_reviewed |
| 2026-08-21T13:31 | gh-change-sync | --event plan_reviewed → #44 Backlog |

## Decisions the Crew Lead made (no human)

### Critical
- **q-schema** — How to store requests vs accepted friendships. Chose **A one `friend_requests` table (pending | accepted | declined)**. Why: copies `nickname_change_requests`; S-15 can query accepted rows; two-table dual-write is overkill on an empty graph.
- **q-list-visibility** — Who sees the accepted friends list. Chose **A public on `/players/{id}` (requests stay private)**. Why: US-04/FR-018 put the list on the profile and every nickname is already a public link; friendship is a trust signal, not a secret.
- **q-unfriend** — Include Remove friend in S-11. Chose **A yes**. Why: S-15 assumes a live graph; a mistaken accept with no undo is worse than one extra mutation.
- **q-unverify** — What happens when admin unverifies a friend. Chose **A keep rows; live graph requires both currently verified**. Why: no destructive trigger on S-06; re-verify restores edges; S-15 can reuse the same helper. C would leak unverified accounts into private runs later.

### Non-obvious
- **research-skip** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the signal is weak; `/10x-plan` will map profile/RLS itself. S-10 (user-profile) is already archived.
- **q-complexity** — Plan complexity. Chose **A MEDIUM (7–10 questions)**. Why: new table + bidirectional RLS + three UX surfaces, but it copies existing profile POST + RLS; HIGH would over-ask S-15 leak-risk now.
- **q-cross-pending** — Add friend while the other already requested you. Chose **A treat as accept**. Why: unique unordered pair stays simple; the click already means they want to be friends; button copy should be Accept request when incoming exists.
- **q-surfaces** — Where Add/Remove vs inbox live. Chose **A Add/Remove on `/players/{id}`; inbox on `/profile`**. Why: pending names never render on a guest-readable route; matches S-10 public vs own split.
- **q-cancel** — Sender withdraw pending. Chose **A yes, delete the pending row**. Why: frees the live-pair unique index (mirrors apply/withdraw); do not reuse declined for sender cancel.
- **q-phases** — Phase split. Chose **A schema → APIs+/profile inbox → public `/players/{id}`**. Why: matches archived S-10; schema is SQL-smokeable before UI; combining 2+3 would mix RLS review with public CTAs.
- **plan-review-F1** — Auth returnTo for `/players/{uuid}`. Chose **Fix A `safeAuthReturnTo`**. Why: Phase 2 forbids widening `safeRunReturnTo`; a friend-only helper does not survive the sign-in page; Fix B would break criterion 2.3.
- **plan-review-F2** — Public Accept missing `request_id`. Chose **Fix A `getRelationship` returns `{ status, requestId }`**. Why: three public buttons stay on three endpoints; same DTO as inbox rows; Fix B would split Accept across surfaces.

### Obvious (optional, keep short)
- **intent** — Empty user intent in YOLO → seed from roadmap S-11 (FR-019, US-04), not a bare slug humanization.
- **gh-parent** — change-id `add-friends` equals roadmap Change ID → 1:1 link, no `--parent`.
- **plan-review-F3** — Align Phase 2 body/Progress headings (drop backticks).
- **plan-review-F4** — Phase 3: viewer `isVerified` from `getOwnProfile`; do not extend `locals.profile`. Island `ServerError` + `reloadKeepingScroll` (no new Banner on `[id].astro`).

### Obvious
- **intent** — Empty user intent in YOLO → seed from roadmap S-11 (FR-019, US-04), not a bare slug humanization.
- **gh-parent** — change-id `add-friends` equals roadmap Change ID → 1:1 link, no `--parent`.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- none yet

## Stop / escape hatches

- none

## GitHub

- change-sync: #44 events new → Backlog; planned → Backlog (link-roadmap S-11)
