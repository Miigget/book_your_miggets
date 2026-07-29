---
project: "Book Your Miggets"
version: 1
status: draft
created: 2026-07-27
updated: 2026-07-27
prd_version: 1
main_goal: market-feedback
top_blocker: capacity
---

# Roadmap: Book Your Miggets

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

The King of Gores (KoG) community in TeeWorlds has no tool for organizing shared runs — finding players at a similar skill level and filling a team happens through in-game chat and external community channels, and often fails. Book Your Miggets lets a run organizer schedule a run with requirements (map, time, capacity, minimum points, join mode) and fill the team ahead of time. The core hypothesis — the assumption everything else depends on — is that organizers will post runs and players will apply through the app instead of falling back to chat.

## North star

**S-02: user can register, apply to join a run, and be accepted or denied by the organizer — confirmed players appear on the roster** — this completes the US-01 approval loop, and with `main_goal: market-feedback` it is the earliest point at which real KoG users can tell us whether the app beats chat-based coordination.

> "North star" here means: the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as its Prerequisites allow, because everything else only matters if this works.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | run-domain-schema | (foundation) minimal run-domain schema + RLS baseline landed | — | Access Control, Business Logic, FR-012 | ready |
| S-01 | create-and-list-runs | create a run; any guest sees it on the public active-runs list | F-01, seeded map catalog | FR-003, FR-006, US-01 | proposed |
| S-02 | apply-and-approve-participants | register, apply to a run, get accepted/denied; roster shows confirmed players | S-01 | FR-001, FR-002, FR-004, FR-008, FR-009, US-01 | proposed |
| S-03 | search-filter-runs | search and filter active runs by map, date, or requirements | S-01 | FR-007 | proposed |
| S-04 | run-archival-lifecycle | see runs marked in-progress during the 1-hour grace, then archived off the active list | S-01 | FR-013, US-01 | proposed |
| S-05 | auto-join-mode | join an auto-join run and be confirmed instantly if capacity allows | S-02 | FR-014, US-02 | proposed |
| S-06 | admin-moderation-tools | (admin) delete runs, ban users, mark users verified | S-01, F-01 | FR-010, FR-011, FR-012 | proposed |
| S-07 | participant-archive-history | (confirmed participant) revisit archived runs they took part in | S-02, S-04 | FR-015, US-01 | proposed |
| S-08 | my-runs-dashboard | (organizer) view all runs they created in one place | S-01 | FR-005 | proposed |
| S-09 | admin-player-archive-view | (admin) view any player's archived run history from their profile | S-04, S-06 | FR-016 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Core loop | `F-01` → `S-01` → `S-02` → `S-05` | The market-feedback spine: create, fill, then scale filling with auto-join. |
| B | Discovery | `S-03` | Joins Stream A at `S-01`; parallelizable the moment the active list exists. |
| C | Lifecycle & history | `S-04` → `S-07` | `S-07` also joins Stream A at `S-02` (needs confirmed participation). |
| D | Moderation & admin | `S-06` → `S-09` | Pre-launch safety valve; `S-09` joins Stream C at `S-04`. |
| E | Organizer convenience | `S-08` | Standalone nice-to-have off `S-01`; first candidate to defer. |

## Baseline

What's already in place in the codebase as of `2026-07-27` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro SSR + React islands + Tailwind/shadcn scaffold (`astro.config.mjs`, `components.json`); auth and dashboard pages exist, no product UI for runs yet.
- **Backend / API:** partial — SSR on Cloudflare Workers; only auth endpoints (`src/pages/api/auth/`) and route-gating middleware (`src/middleware.ts`); no product endpoints.
- **Data:** partial — Supabase clients wired (`src/lib/supabase.ts`) but `supabase/migrations/` contains no SQL; no schema, seeds, or generated DB types.
- **Auth:** present — Supabase email/password end-to-end: signup/signin/signout routes, cookie sessions, protected-route middleware, auth pages. FR-001 and FR-002 are satisfied by this baseline; S-02 exercises them inside the participation flow rather than re-building them.
- **Deploy / infra:** present — Cloudflare Workers via wrangler; CI (lint/build) plus auto-deploy-on-merge (`.github/workflows/{ci,deploy}.yml`).
- **Observability:** partial — Workers observability enabled in `wrangler.jsonc`; no app-level logging or error tracking. No NFR gates launch on this, so no foundation is opened for it.

## Foundations

### F-01: Run-domain schema and RLS baseline

- **Outcome:** (foundation) the first migration lands: minimal tables for user profiles (role, `is_verified`, ban flag), runs, and join applications/participations with per-role RLS policies, plus the migration workflow proven locally and in deploy. Downstream slices extend this contract with their own migrations — this foundation does not pre-build every column.
- **Change ID:** run-domain-schema
- **PRD refs:** Access Control (guest/member/admin roles), Business Logic (confirmed-roster rule), FR-012 (`is_verified` flag lives here)
- **Unlocks:** S-01, S-02, S-06 — no run can be created, applied to, or moderated without these entities; RLS correctness is also what later makes the FR-015/FR-016 archive-visibility rules enforceable.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** sequenced first because every slice reads or writes these entities; the failure mode is over-modeling ahead of real flows — keep it to the minimal contract and let each slice add what it needs via new migrations.
- **Status:** ready

## Slices

### S-01: Create a run and see it on the public list

- **Outcome:** user can create a run (map from list/search, date/time, max participants, minimum points threshold, join mode) and any guest can browse the public active-runs list without logging in.
- **Change ID:** create-and-list-runs
- **PRD refs:** FR-003, FR-006, US-01
- **Prerequisites:** F-01, seeded map catalog (a usable list of KoG maps — see Open Roadmap Question 1)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** first user-visible proof; the map-selection UX carries the "run creation under 1 minute" guardrail, so a poor catalog makes the core action feel slow.
- **Status:** proposed

### S-02: Apply to join and organizer approval

- **Outcome:** user can register, apply to join an approval-required run, and the organizer can accept or deny each applicant; confirmed players appear on the public participant list and count toward capacity.
- **Change ID:** apply-and-approve-participants
- **PRD refs:** FR-001, FR-002, FR-004, FR-008, FR-009, US-01
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-06, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** this is the north star — the pending/confirmed state machine is the product's core rule (Business Logic §), and the apply action carries the under-30-seconds guardrail; getting the states wrong here poisons every downstream slice.
- **Status:** proposed

### S-03: Search and filter runs

- **Outcome:** user can search and filter the active-runs list by map, date, or requirements.
- **Change ID:** search-filter-runs
- **PRD refs:** FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04, S-05, S-06, S-07, S-08, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** finding the right run is the core pain being solved, but filter scope creep is easy — stay on the three axes FR-007 names.
- **Status:** proposed

### S-04: Run lifecycle — in-progress grace and archival

- **Outcome:** user can see a run marked "in-progress / already started" during the 1-hour grace after its scheduled start, after which it leaves the active list into the archive (retained, not deleted).
- **Change ID:** run-archival-lifecycle
- **PRD refs:** FR-013, US-01
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** timed archival is not first-class on this stack (per `tech-stack.md`) — whether it's cron-driven or derived at read time is a `/10x-plan` decision; sequenced before community launch so the "past runs don't clutter the active list" guardrail holds from day one.
- **Status:** proposed

### S-05: Auto-join mode

- **Outcome:** user can apply to an auto-join run and be confirmed on the participant list immediately if capacity remains.
- **Change ID:** auto-join-mode
- **PRD refs:** FR-014, US-02
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-06, S-07, S-08, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** concurrent applies against the last slot is the one race condition in the product; sequenced after S-02 so the base application machinery exists to extend.
- **Status:** proposed

### S-06: Admin moderation tools

- **Outcome:** admin can delete runs, ban users, and mark a user as verified (`is_verified`).
- **Change ID:** admin-moderation-tools
- **PRD refs:** FR-010, FR-011, FR-012
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-08
- **Blockers:** —
- **Unknowns:**
  - How is the first admin designated (manual DB flag at deploy vs seeded account)? — Owner: user. Block: no.
- **Risk:** launching a community tool without a moderation safety valve is the real risk; the slice itself is small and fully parallelizable with the core loop.
- **Status:** proposed

### S-07: Participant archive history

- **Outcome:** confirmed participant can view the archived runs they took part in.
- **Change ID:** participant-archive-history
- **PRD refs:** FR-015, US-01
- **Prerequisites:** S-02, S-04
- **Parallel with:** S-05, S-06, S-08, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** visibility hinges on the "confirmed participant only" rule — this is where the RLS policies from F-01 get exercised against archived data for the first time.
- **Status:** proposed

### S-08: My-runs dashboard

- **Outcome:** organizer can view and manage all runs they created in one place.
- **Change ID:** my-runs-dashboard
- **PRD refs:** FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-06, S-07, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** nice-to-have (the only one) — first candidate to cut if the 3-week budget tightens; nothing depends on it.
- **Status:** proposed

### S-09: Admin view of a player's archive

- **Outcome:** admin can open a player's profile and view that player's full archived run history.
- **Change ID:** admin-player-archive-view
- **PRD refs:** FR-016
- **Prerequisites:** S-04, S-06
- **Parallel with:** S-03, S-05, S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** introduces the player-profile surface for the first time; small slice, but it widens access control (admin bypasses the confirmed-participant rule), so it leans on S-06's role gating.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | run-domain-schema | Establish run-domain schema and RLS baseline | yes | Run `/10x-plan run-domain-schema` |
| S-01 | create-and-list-runs | Run creation + public active-runs list | no | Waiting on F-01; seed map catalog alongside |
| S-02 | apply-and-approve-participants | Apply to join + organizer approval + roster | no | Waiting on S-01; north star |
| S-03 | search-filter-runs | Search and filter active runs | no | Waiting on S-01; parallel candidate |
| S-04 | run-archival-lifecycle | Run lifecycle: in-progress grace + archival | no | Waiting on S-01; parallel candidate |
| S-05 | auto-join-mode | Auto-join mode | no | Waiting on S-02 |
| S-06 | admin-moderation-tools | Admin moderation: delete runs, ban, verify | no | Waiting on S-01; parallel candidate |
| S-07 | participant-archive-history | Participant archive history | no | Waiting on S-02 + S-04 |
| S-08 | my-runs-dashboard | My-runs dashboard | no | Waiting on S-01; cuttable nice-to-have |
| S-09 | admin-player-archive-view | Admin view of player archived run history | no | Waiting on S-04 + S-06 |

## Open Roadmap Questions

1. **Where does the KoG map catalog come from — a manually seeded static list, or imported from existing KoG map data?** — Owner: user. Block: none (S-01 can ship with a manual seed; revisit before S-03's search UX so map names are consistent).
2. **What is the minimum slice set before announcing to the KoG community?** — Owner: user. Block: none (suggested floor for market feedback: S-02 + S-04 + S-06 — loop works, list stays clean, moderation exists — but this is the user's call).

## Parked

- **TeeWorlds client integration** — Why parked: PRD §Non-Goals; MVP operates outside the game.
- **Automatic player stats from the game** — Why parked: PRD §Non-Goals; minimum points threshold stays organizer-set.
- **Native mobile apps** — Why parked: PRD §Non-Goals; web-only for v1, responsive layout may suffice.
- **Archive deletion / retention tiering** — Why parked: PRD §Non-Goals; retain indefinitely until scale demands otherwise.
- **Discord OAuth + KoG Discord verification** — Why parked: PRD §Access Control, deferred to v2+.
- **Discord bot (events/forum posts) + announcement channel** — Why parked: PRD §Access Control, deferred to v2+.
- **Clan Leader and official KoG admin/moderator roles** — Why parked: PRD §Access Control, deferred to v2+.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)
