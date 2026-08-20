---
change_id: user-profile
mode: YOLO
started: 2026-08-20
updated: 2026-08-20
status: complete
---

# Crew decisions — user-profile

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-20T08:50 | 10x-new | created change.md (S-10 seed from roadmap) |
| 2026-08-20T08:55 | 10x-plan | DECISION_REQUEST (complexity + 3 load-bearing) |
| 2026-08-20T09:00 | 10x-plan | DECISION_REQUEST round-2 (email, nick lock, password, chrome) |
| 2026-08-20T09:05 | 10x-plan | DECISION_REQUEST round-3 (pending replace, phases) |
| 2026-08-20T09:10 | 10x-plan | plan.md + plan-brief.md written; status planned |
| 2026-08-20T09:20 | 10x-plan-review | REVISE (4 LOW); apply-all ⭐ |
| 2026-08-20T09:25 | 10x-plan-review | SOUND after F1–F4; status plan_reviewed |
| 2026-08-20T09:40 | 10x-implement p1 | schema/trigger/view/types; commit 8ba2189 |
| 2026-08-20T09:50 | 10x-impl-review p1 | APPROVED |
| 2026-08-20T10:10 | 10x-implement p2 | /profile + APIs + topbar; commit 54c0f06 |
| 2026-08-20T10:20 | 10x-impl-review p2 | NEEDS ATTENTION (F1 uniqueness RLS) |
| 2026-08-20T10:25 | 10x-implement p2 F1 | public_profiles uniqueness; commit 4eaef03 |
| 2026-08-20T10:30 | 10x-impl-review p2 | re-review APPROVED |
| 2026-08-20T10:45 | 10x-implement p3 | /players/{uuid} + NicknameLink; commit c03c802 |
| 2026-08-20T10:55 | 10x-impl-review p3 | APPROVED |
| 2026-08-20T11:05 | 10x-impl-review | full APPROVED; status impl_reviewed |
| 2026-08-20T11:10 | 10x-archive | YOLO auto-archive (only manuals remain) |

## Decisions the Crew Lead made (no human)

### Critical
- **plan-q2** — Public profile URL. Chose **A `/players/{uuid}`**. Why: nicknames are mutable; UUID matches `/admin/users/{id}` and `/runs/{id}`; own-profile can stay a separate signed-in `/profile`.
- **plan-q3** — Nickname-change request storage. Chose **A dedicated `nickname_change_requests` table**. Why: S-16 needs a fulfillable queue with history and a one-pending invariant; columns-on-profiles lose deny history.
- **plan-q4** — KoG points schema this slice. Chose **A `kog_points` + `kog_points_verified` now, flag member-locked**. Why: FR-018 requires showing whether points were admin-checked; S-16 only adds the admin toggle.
- **plan-q5** — Email change on own-profile. Chose **A `updateUser` + pending “check inbox” copy**. Why: GoTrue often does not flip `user.email` until confirm; do not lie in the UI; no SMTP/project setting changes in this slice.
- **plan-q6** — Verified nickname lock. Chose **A DB trigger + API gate**. Why: `profiles_update_own` would otherwise let a JWT UPDATE nickname; trigger matches role/ban privileged-column pattern; API maps to “request a change instead.”
- **plan-q7** — Password change. Chose **A require current password, then `updateUser`**. Why: stolen session cannot silently rotate password; works when `secure_password_change` is off; avoid OTP/mailer scope.
- **commit-phase** — Phase-end and archive ritual commits. Chose **COMMIT_OK in YOLO**. Why: user chose full-loop YOLO; never push.
- **archive-manuals** — Archive despite unchecked Progress manuals. Chose **auto-archive**. Why: YOLO rule when only human-action rows remain; automated 1.1–1.5, 2.1–2.5, 3.1–3.5 passed and phase/full reviews APPROVED.

### Non-obvious
- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the signal is weak; S-10 is a named roadmap slice with PRD refs, and `/10x-plan` mapped nickname/admin-profile surfaces itself.
- **intent-from-roadmap** — Empty user intent on a new folder. Chose **roadmap S-10 outcome as Notes**. Why: YOLO humanizes the slug, but `user-profile` is the roadmap Change ID so the S-10 outcome is the real seed.
- **plan-q1** — Plan complexity. Chose **A MEDIUM (8 questions)**. Why: multi-page + small migration + Auth `updateUser`, without redesigning RLS; LOW would skip URL/schema/lock decisions.
- **plan-q8** — Top-bar identity. Chose **A nickname → `/profile`; null → “Set nickname” (never email)**. Why: FR-017 removes email from chrome; keep own vs public URLs distinct.
- **plan-q9** — Second pending nickname request. Chose **A replace the pending nickname**. Why: typo-friendly; S-16 always sees the latest ask; unique partial index keeps one pending row.
- **plan-q10** — Phase split. Chose **A three phases (schema → own-profile → public+links)**. Why: schema first unblocks both UIs; clickable nicks wait until `/players/{uuid}` exists so links do not 404.
- **impl-p2-F1** — Nickname uniqueness lookup blinded by `profiles_select_own`. Chose **point `findProfileIdByNickname` at `public_profiles`**. Why: verified requests never hit `23505`; S-16 would otherwise receive a taken nick.
- **impl-p2-F2** — Create-run still interpolates PostgREST text outside nickname path. Chose **skip**. Why: observation, pre-existing, out of S-10 nickname contract.

### Obvious
- **change-id** — kebab-case `user-profile` matches roadmap Change ID S-10.
- **gh-parent** — 1:1 link existing S-10 card; no `--parent`.
- **next-stage** — `/10x-plan` (no research/frame signal).
- **review-triage** — REVISE with 4 LOW one-liners. Chose **apply-all**.
- **skip-roadmap-sync** — change-sync blocked because S-10 is not on the board. Chose **do not auto-run `/gh-roadmap-sync`**. Why: that skill requires explicit user confirmation.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 SQL 1.6–1.9: specialist ran locally (not skipped).
- Phase 2 manual 2.6–2.13: skipped (YOLO residual risk) — guest/signed-in `/profile`, unverified nick, verified request replace, email pending vs applied, password, points flag, banned POST, localhost click-through. Dev server was not running (`127.0.0.1:4321` refused).
- Phase 3 manual 3.6–3.12: skipped (YOLO residual risk) — guest public profile fields, 404, nick clicks on lists/detail/landing, nested title vs nick, admin table vs archive-card, topbar still `/profile`. Banned public-profile URL (plan-review F6) not smoked.

## Stop / escape hatches

- none. Phase 2 NEEDS ATTENTION → F1 fix + re-review APPROVED. Did not hire `/10x-frame`.

## GitHub

- change-sync `--event new|planned|implementing`: **blocked** — S-10 (`user-profile`) not on the Kanban board. Run `/gh-roadmap-sync` then `/gh-change-sync user-profile`. Did not auto-run roadmap-sync.
