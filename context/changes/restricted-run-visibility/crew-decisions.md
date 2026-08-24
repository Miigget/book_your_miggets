---
change_id: restricted-run-visibility
mode: YOLO
started: 2026-08-24
updated: 2026-08-24
status: in-progress
---

# Crew decisions — restricted-run-visibility

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When             | Stage           | What                                                                                          |
| ---------------- | --------------- | --------------------------------------------------------------------------------------------- |
| 2026-08-24T11:08 | 10x-new         | created change.md (status: new); gh-change-sync #57 Backlog                                   |
| 2026-08-24T11:12 | 10x-research    | wrote research.md; status preparing                                                           |
| 2026-08-24T11:25 | 10x-plan        | wrote plan.md + plan-brief.md; status planned; gh-change-sync #57 planned                     |
| 2026-08-24T11:40 | 10x-plan-review | verdict REVISE (0 critical, 4 warnings); applying ⭐ fixes then re-review                     |
| 2026-08-24T11:50 | 10x-plan        | REVISE pass applied F1–F5 to plan.md + plan-brief.md                                          |
| 2026-08-24T12:05 | 10x-plan-review | re-review SOUND (0 critical, 1 LOW already in patched plan); gh-change-sync #57 plan_reviewed |

## Decisions the Crew Lead made (no human)

### Critical

- **plan-q2-invite-storage** — How to store invite-only membership (snapshot already locked). Chose **B: child table `run_invites(run_id, user_id)`** with cycle-safe `is_run_invitee()`. Why: matches `is_confirmed_participant` / `are_friends` helper pattern and independent GRANTs; uuid[] is harder to RLS and grant-scope.

- **plan-q3-edit-and-seated** — After seats, may organizer change visibility/invites, and do confirmed participants keep SELECT if they fall out of audience? Chose **B: visibility and invite list stay editable; confirmed seats keep SELECT; pending outsiders 404 like strangers (no auto-delete)**. Why: matches PRD Q1 + snapshot-at-edit; does not strand teammates; friends-only live graph still hides non-joiners.

- **review-F1-unverified-update** — Unverified organizers can PATCH visibility to restricted. Chose **A: copy INSERT conjunct onto `runs_update_own` WITH CHECK (public OR currently verified) and reject unverified non-public in the edit API with the same `?error=` as create**. Why: PRD v1.1 unverified-restricted must not be bypassable via edit.

- **review-F2-invite-rpcs** — Invite-only writer RPC was optional and edit never named it. Chose **A: two named INVOKER RPCs — `create_invite_only_run` and `set_run_visibility_and_invites`; Phase 2 invite-only create/edit must use them; never pair `updateRun` + sync as separate statements**. Why: PostgREST has no multi-statement transaction; empty invite-only is a locked invariant.

### Non-obvious

- **research-vs-plan** — After `/10x-new`, specialist hinted `/10x-research` because visibility is a new RLS axis on runs + S-11 friends graph. Chose **hire research**. Why: the turn clearly needs a map of list queries, create/edit, and current policies before planning; not the weak-signal YOLO skip.

- **gh-parent** — change-id equals roadmap Change ID `restricted-run-visibility` (S-15). Chose **1:1 link, no `--parent`**. Why: hybrid rule — ignore parent when ids match.

- **plan-q1-complexity** — Confirm plan complexity. Chose **B: MEDIUM**. Why: research + locked product defaults; remaining work is additive schema + dual-axis RLS + UI following existing slice patterns. HIGH would pad the interview.

- **plan-q4-phases** — How to cut implementation phases. Chose **A: 3 phases (RLS+leaks → create/edit → /runs sections)**. Why: dual-defense boundary lands before UI can lie; both modes share the RLS axis in phase 1 (roadmap: do not split modes).

- **plan-q5-admin-list** — Where does an admin discover restricted runs they are not audience for? Chose **B: extra “Restricted” section on /runs for admins only**. Why: public stack stays public even for admins; S-06 still has an on-page discovery path; friend-admin sees a run once under Friends.

- **plan-q6-empty-invites** — May invite-only be saved with zero invitees? Chose **A: always ≥1 invitee on create and edit**. Why: invite-only stays “picked friends”; friends-only is the empty-audience mode; failed edit keeps previous snapshot.

- **review-LOW-F3-F5** — Apply three LOW plan edits together? Chose **apply (F3+F4+F5)**. Why: obvious contract completions — inline window in `can_view_run`, guest `/runs` always `publicOnly`, load nicknames for snapshot invitees missing from `listPublicFriends`.

### Obvious (optional, keep short)

- Intent seeded from roadmap S-15 / FR-027, FR-028 rather than empty slug humanization.
- **review-r2-LOW-rpc-args** — Residual SOUND warning to name full `set_run_visibility_and_invites` patch columns + `create_invite_only_run RETURNS uuid`. Chose **already present in patched plan** (Phase 1 contract lists identifying triple + updateRun columns; create RETURNS uuid). Why: obvious one-line; no extra plan cycle.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- none yet

## Stop / escape hatches

- none

## GitHub

- change-sync: #57 events new, planned, plan_reviewed → Backlog (link-roadmap)
