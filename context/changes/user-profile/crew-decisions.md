---
change_id: user-profile
mode: YOLO
started: 2026-08-20
updated: 2026-08-20
status: in-progress
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

## Decisions the Crew Lead made (no human)

### Critical
- **plan-q2** — Public profile URL. Chose **A `/players/{uuid}`**. Why: nicknames are mutable; UUID matches `/admin/users/{id}` and `/runs/{id}`; own-profile can stay a separate signed-in `/profile`.
- **plan-q3** — Nickname-change request storage. Chose **A dedicated `nickname_change_requests` table**. Why: S-16 needs a fulfillable queue with history and a one-pending invariant; columns-on-profiles lose deny history.
- **plan-q4** — KoG points schema this slice. Chose **A `kog_points` + `kog_points_verified` now, flag member-locked**. Why: FR-018 requires showing whether points were admin-checked; S-16 only adds the admin toggle.
- **plan-q5** — Email change on own-profile. Chose **A `updateUser` + pending “check inbox” copy**. Why: GoTrue often does not flip `user.email` until confirm; do not lie in the UI; no SMTP/project setting changes in this slice.
- **plan-q6** — Verified nickname lock. Chose **A DB trigger + API gate**. Why: `profiles_update_own` would otherwise let a JWT UPDATE nickname; trigger matches role/ban privileged-column pattern; API maps to “request a change instead.”
- **plan-q7** — Password change. Chose **A require current password, then `updateUser`**. Why: stolen session cannot silently rotate password; works when `secure_password_change` is off; avoid OTP/mailer scope.
- **commit-phase** — Phase-end ritual commits. Chose **COMMIT_OK in YOLO**. Why: user chose full-loop YOLO; never push.

### Non-obvious
- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the signal is weak; S-10 is a named roadmap slice with PRD refs, and `/10x-plan` will map the existing nickname/admin-profile surfaces itself.
- **intent-from-roadmap** — Empty user intent on a new folder. Chose **roadmap S-10 outcome as Notes**. Why: YOLO humanizes the slug, but `user-profile` is the roadmap Change ID so the S-10 outcome is the real seed.
- **plan-q1** — Plan complexity. Chose **A MEDIUM (8 questions)**. Why: multi-page + small migration + Auth `updateUser`, without redesigning RLS; LOW would skip URL/schema/lock decisions.
- **plan-q8** — Top-bar identity. Chose **A nickname → `/profile`; null → “Set nickname” (never email)**. Why: FR-017 removes email from chrome; keep own vs public URLs distinct.
- **plan-q9** — Second pending nickname request. Chose **A replace the pending nickname**. Why: typo-friendly; S-16 always sees the latest ask; unique partial index keeps one pending row.
- **plan-q10** — Phase split. Chose **A three phases (schema → own-profile → public+links)**. Why: schema first unblocks both UIs; clickable nicks wait until `/players/{uuid}` exists so links do not 404.

### Obvious
- **change-id** — kebab-case `user-profile` matches roadmap Change ID S-10.
- **gh-parent** — 1:1 link existing S-10 card; no `--parent`.
- **next-stage** — `/10x-plan` (no research/frame signal).
- **review-triage** — REVISE with 4 LOW one-liners. Chose **apply-all** (dashboard NicknameLink, `lower()` uniqueness, session `user.email` for password re-auth, fixed `ensureOwnProfile` copy). Why: LOW-impact obvious contract text; no approach change.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- none yet

## Stop / escape hatches

- none

## GitHub

- change-sync `--event new`: **blocked** — S-10 (`user-profile`) not on the Kanban board. Need `/gh-roadmap-sync` first, then re-run sync. Did not auto-run roadmap-sync (requires user confirmation).
