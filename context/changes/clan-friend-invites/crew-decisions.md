---
change_id: clan-friend-invites
mode: YOLO
started: 2026-08-31
updated: 2026-08-31
status: in-progress
---

# Crew decisions — clan-friend-invites

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-31T11:22 | 10x-new | created change.md (status: new) |
| 2026-08-31 | 10x-plan | plan.md + plan-brief.md (status: planned) |
| 2026-08-31 | 10x-plan-review | REVISE — F1–F4 triaged, F5/F6 pending; plan not rewritten that turn |
| 2026-08-31 | 10x-plan-review (re-review) | SOUND — F1–F6 landed; status plan_reviewed |
| 2026-08-31 | 10x-implement p1 | schema + accept trigger; commit 3869abd on feature/clan-friend-invites |
| 2026-08-31 | 10x-impl-review p1 | APPROVED (0 findings) |

## Decisions the Crew Lead made (no human)

### Critical
- **q1-seating** — How accept seats a member given F-02 no client INSERT. Chose **B DEFINER trigger on accept**. Why: invitee only UPDATEs the invite; trigger inserts `clan_members`; grant matrix stays intact; PK abort rolls back the accept.
- **q2-invite-rows** — What `clan_invites` keeps vs roster. Chose **B pending|declined; accept deletes invite**. Why: `clan_members` remains the only “in the clan” truth; declined stays for reopen without accepted/member drift.
- **q4-invitee-ui** — Where invitee accepts/declines. Chose **A Profile inbox only**. Why: AGENTS.md pending inbox is on `/profile`; public clan page stays guest-first and must not leak pending-invite chrome.
- **q5-already-member** — Friend already in a clan. Chose **A Exclude anyone already in a clan**. Why: never create a doomed pending invite; one-clan PK is visible before send.
- **q6-leave** — Self-leave or owner-kick this slice. Chose **A Out of scope (sticky membership)**. Why: FR-015 is invite→accept; leave/kick/transfer is a later beat; owner leave would need officers.
- **q7-multi-pending** — Two owners invite the same friend. Chose **C Accept clears other pendings**. Why: inbox matches one-clan reality; no leftover doomed Accept buttons; declined rows on other clans stay.
- **F1** — Admin clan delete vs `clan_invites` CASCADE + accept trigger. Chose **A `clan_invites_delete_admin` + `set_config` teardown flag**. Why: F-02 already needed admin CASCADE delete; `pg_trigger_depth` cannot tell CASCADE from Accept; skip misfire if admin is also the invitee.
- **F2** — Dual UPDATE policies without freezing identity columns. Chose **A BEFORE UPDATE freeze `clan_id`/`invitee_id`/`inviter_id`**. Why: same Postgres OR-hole friends already closed; invitee must not re-point a declined row onto another clan’s unique pair.

### Non-obvious
- **research-skip** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the research signal is not explicit; S-19 is a known roadmap slice and `/10x-plan` will map clans + friends itself.
- **parent-link** — change-id equals roadmap Change ID S-19. Chose **1:1 link existing card** (no `--parent`). Why: hybrid rule for matching Change IDs.
- **q-complexity** — Plan complexity LOW/MEDIUM/HIGH. Chose **B MEDIUM** (7–10 [S] questions). Why: first client `clan_members` write + invite rows + owner picker + invitee respond + RLS; not a domain redesign (C) and not a thin overlay (A) given F-02 INSERT freeze.
- **q3-owner-ui** — Where owner picks friends. Chose **A Owner picker on `/clans/{id}`**. Why: FR-015 is a clan action; bulk invite via CreateRunForm-style picker; guests must never see the owner’s friend graph.
- **q8-unfriend** — Unfriend while clan invite pending. Chose **A Check friends on accept; hide in inbox**. Why: write-time `are_friends` like run invitees; no friends→clans trigger; not a run_invites snapshot.
- **q9-phases** — Three-phase plan (schema+trigger → owner path → profile inbox). Chose **A Looks good, proceed**. Why: independently verifiable like S-18; Phase 1 proves F-02 INSERT freeze before UI.

### Obvious
- Intent seeded from roadmap S-19 / FR-015 rather than empty slug humanization.
- Stay on current working tree; do not stash/reset while a parallel release agent is active. Do not stage unrelated dirty foundation files.
- **branch** — Phase 1 ritual: `git checkout -b feature/clan-friend-invites` from main, then commit only touched set. Why: trunk branching; keep release agent’s unstaged foundation files off our commit.
- **roadmap-skip** — Skip in-progress flip on PREDIRTY `roadmap.md`. Why: parallel release owns that dirty file.
- **commit-p1** — YOLO ritual COMMIT_OK for Phase 1. SHA `3869abd`. Refs: #83.
- Cite PRD v2 FR-015 (clan invites), not the old `prd.md` FR-015 (archived-run history).
- **F3** — Clan detail error banner. Chose **fix**: `serverError && (!isAdmin || isOwner)`; do not invert `!isAdmin`.
- **F4** — Copy constant. Chose **fix**: new send-path constant for owner; keep `CLAN_ALREADY_MEMBER` (“You already belong…”) for viewer/Accept PK.
- **F5** — RLS `auth.uid()` wrapping. Chose **apply**: write every `clan_invites` policy as `(select auth.uid())` like `friend_requests`.
- **F6** — Accept DELETE missing ban check. Chose **apply**: add `public.is_not_banned()` to accept DELETE USING.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 Local Studio (1.6, 1.10): skipped (YOLO residual risk) — SQL smoke + advisors covered behavior; columns/enum/unique/grants not eyeballed in Studio UI.

## Stop / escape hatches

- none

## GitHub

- change-sync: #83 events new, planned, plan_reviewed → Backlog; implementing → In progress (link-roadmap S-19)
