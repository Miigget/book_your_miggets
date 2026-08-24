---
change_id: admin-profile-edits
mode: YOLO
started: 2026-08-24
updated: 2026-08-24
status: in-progress
---

# Crew decisions — admin-profile-edits

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-24 | 10x-new | created change.md (status: new) |
| 2026-08-24 | gh-change-sync | #58 Backlog (event new, link-roadmap S-16) |
| 2026-08-24 | 10x-plan | complexity: MEDIUM (~8 questions) |
| 2026-08-24 | 10x-plan | plan.md + plan-brief.md written (status: planned) |
| 2026-08-24 | gh-change-sync | #58 Backlog (event planned) |
| 2026-08-24 | 10x-plan-review | REVISE — triage F1–F4 |
| 2026-08-24 | 10x-plan | refine: applied F1–F4 ⭐ into plan.md (status: planned) |
| 2026-08-24 | 10x-plan-review | SOUND — F1–F4 verified in plan |

## Decisions the Crew Lead made (no human)

### Critical

- (none yet)

### Non-obvious

- **intent-from-roadmap** — Empty CLI intent on a new folder. Chose **roadmap S-16 outcome as Notes** (not a bare slug humanization). Why: user named a roadmap Change ID; the slice outcome + FR-023/FR-024/US-10 + S-17 out of scope is the real seed.
- **research-skip** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the research signal is not explicit; `/10x-plan` nested Explore covers codebase grounding.
- **plan-complexity** — HIGH/MEDIUM/LOW for `/10x-plan`. Chose **A (MEDIUM, ~8 questions)**. Why: schema/RLS already from S-10; remaining work is multi-file APIs + player-page editors + request state machine, not a redesign and not a one-form clone.
- **q2-inbox** — Where admins discover nickname-change requests. Chose **B (fulfill on player page; pending hint on `/admin` list)**. Why: FR-024 mutations stay on `/admin/users/{id}`; a list marker makes the S-10 queue findable without a second admin URL.
- **q3-pending-vs-direct-nick** — Admin nick save while a request is pending. Chose **A (close pending: accept if nick matches request, else deny)**. Why: `/profile` pending UI must not disagree with the live nick; frees the one-pending slot; Accept cannot overwrite an admin edit.
- **q4-accept-uniqueness** — Accept vs taken nickname. Chose **A (apply nick + mark accepted together; on 23505 keep pending and error)**. Why: no accepted-but-not-applied lie; member/admin can retry; uniqueness is the S-10 failure mode this slice owns.
- **q5-points-ux** — Edit vs mark-verified. Chose **A (separate save-points and Mark verified / Unverify) with constraint: changing the stored number clears `kog_points_verified`**. Why: FR-024 is two acts; a stale true flag after an un-checked number would lie on public profiles.
- **q6-who-gets-editors** — Nickname/points editors on `/admin/users/{id}`. Chose **A (every player the page can open: unverified, verified, banned)**. Why: PRD “at any time”; banned public `/players/{id}` still needs identity/points correction; one UI.
- **q7-request-history** — Which request rows to show. Chose **A (pending only; no past-row list)**. Why: S-16 is a fulfill inbox matching `/profile`; full audit is SQL; avoids scope creep.
- **q8-review-columns** — Migration on `nickname_change_requests`. Chose **A (no migration; status + updated_at)**. Why: S-10 table is enough; reviewer UI was not requested; CD migration risk not justified.
- **q9-unverify-pending** — S-06 unverify while a request is pending. Chose **A (deny the pending row when unverifying)**. Why: otherwise a later Accept can overwrite a self-serve nick; same close-the-queue idea as q3.
- **plan-phases** — Phase split (in-plan, no extra DECISION_REQUEST). Accepted **2 phases: trigger/services/APIs → UI**. Why: contract smoke before click-through; matches prior admin slices.
- **direct-nick-uniqueness** — Direct admin nick save vs taken nick (baked in-plan). Accepted **error + keep pending (do not close)**. Why: same as Accept collision — do not deny the member’s ask because of a uniqueness race.
- **empty-points** — Empty KoG points field. Accepted **null**. Why: matches S-10 member profile (clearable self-report).
- **F1-trigger-member-flag** — Plan-review trigger would let members SET `kog_points_verified=true`. Chose **fix**: keep all-role points clear; inside `if not is_admin()` restore `old.kog_points_verified` when points unchanged. Why: that restore is the only lock; Mark verified must still work for admins; 1.9 promised members cannot fake “Checked in-game.”
- **F2-unverify-deny-helper** — Literal reuse of deny-on-missing would break S-06 Unverify. Chose **fix**: Deny API still errors when no pending row; `setUserVerified(false)` is deny-if-any (missing pending is success). Why: common Unverify path must not abort.
- **F3-pending-load-failure** — Player-page pending query failure unspecified. Chose **fix A**: own try; on failure log, keep editors, inline error, omit Accept/Deny. Why: archive list already degrades; do not 500 nick/points editors on a queue read.
- **F4-verify-null-points** — Mark verified when `kog_points` is null. Chose **fix A**: `setKogPointsVerified(true)` errors when points are null; hide/disable Mark verified when empty; Unverify still allowed. Why: FR-024 is an in-game check of a number; public must not show “— / Checked in-game.”

### Obvious (optional, keep short)

- kebab-case id `admin-profile-edits` unique; next skill `/10x-plan`.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- none yet

## Stop / escape hatches

- none

## GitHub

- change-sync: #58 events new → Backlog (link-roadmap S-16)
