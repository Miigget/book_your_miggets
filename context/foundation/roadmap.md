---
project: "Book Your Miggets"
version: 1
status: draft
created: 2026-07-27
updated: 2026-08-17
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

**S-02: user can register, apply to join a run, and be accepted or denied by the organizer — confirmed players appear on the roster** — shipped in `v0.1.3`. This completes the US-01 approval loop, and with `main_goal: market-feedback` it is the earliest point at which real KoG users can tell us whether the app beats chat-based coordination.

> "North star" here means: the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as its Prerequisites allow, because everything else only matters if this works.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | run-domain-schema | (foundation) minimal run-domain schema + RLS baseline landed | — | Access Control, Business Logic, FR-012 | done |
| S-01 | create-and-list-runs | create a run; any guest sees it on the public active-runs list | F-01, seeded map catalog | FR-003, FR-006, US-01 | done |
| S-02 | apply-and-approve-participants | register, apply to a run, get accepted/denied; roster shows confirmed players | S-01 | FR-001, FR-002, FR-004, FR-008, FR-009, US-01 | done |
| S-03 | search-filter-runs | search and filter active runs by map, date, or requirements | S-01 | FR-007 | done |
| S-04 | run-archival-lifecycle | see runs marked in-progress during the 1-hour grace, then archived off the active list | S-01 | FR-013, US-01 | done |
| S-05 | auto-join-mode | join an auto-join run and be confirmed instantly if capacity allows | S-02 | FR-014, US-02 | done |
| S-06 | admin-moderation-tools | (admin) delete runs, ban users, mark users verified | S-01, F-01 | FR-010, FR-011, FR-012 | done |
| S-07 | participant-archive-history | (confirmed participant) revisit archived runs they took part in | S-02, S-04 | FR-015, US-01 | done |
| S-08 | my-runs-dashboard | (organizer) view all runs they created in one place | S-01 | FR-005 | proposed |
| S-09 | admin-player-archive-view | (admin) view any player's archived run history from their profile | S-04, S-06 | FR-016 | in-progress |

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

What's already in place in the codebase as of `2026-08-07` (updated after S-05 + S-06 in `v0.1.6`; earlier: S-04 in `v0.1.5`, north-star S-02 in `v0.1.3`, F-01 + S-01 in `v0.1.1`, create-run/profile + Deploy DB sync in `v0.1.2`).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro SSR + React islands + Tailwind/shadcn; auth/dashboard; public run list/detail with filled/capacity, in-progress labels during the 1h grace, apply/approve/leave-team, and instant auto-join on matching runs; admin moderation UI (delete run, ban, verify); auth-gated create form (`/runs`, `/runs/[id]`, `/runs/new`, `/admin`).
- **Backend / API:** partial — SSR on Cloudflare Workers; auth endpoints; `POST /api/runs`, `POST /api/profile/nickname`, participant mutations (`apply` / `withdraw` / `leave-team` / `decide` with race-safe auto-join), plus admin moderation APIs; middleware gates `/dashboard`, `/runs/new`, and `/admin`; active list/detail/mutations enforce the FR-013 active window; banned users are blocked from mutations.
- **Data:** present for F-01/S-01/S-02/S-04/S-05/S-06 — migrations for `profiles`, `runs`, `run_participants`, `maps`; organizer auto-seat trigger + DELETE withdraw/leave policies; `ensure_own_profile` + race-safe `auto_join_run` RPCs; KoGmaps seed/import; RLS active-window SELECT for guest/member; generated `src/types/database.ts`.
- **Auth:** present — Supabase email/password end-to-end: signup/signin/signout routes, cookie sessions, protected-route middleware, auth pages, safe `returnTo` back to `/runs/{uuid}` for the guest→apply path. FR-001/FR-002 are exercised inside the participation flow; admin role gating for moderation.
- **Deploy / infra:** present — Cloudflare Workers via wrangler; CI (lint/build on PR/`main`); production Deploy on tag `v*` runs Supabase `db push`, seeds `kog-maps.sql` only when that file changed since the previous tag, then deploys the Worker (`.github/workflows/deploy.yml`); live at [https://book-your-miggets.bookyourmiggets.workers.dev](https://book-your-miggets.bookyourmiggets.workers.dev) (`v0.1.6`).
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
- **Status:** done

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
- **Status:** done

### S-02: Apply to join and organizer approval

- **Outcome:** user can register, apply to join an approval-required run, and the organizer can accept or deny each applicant; confirmed players appear on the public participant list and count toward capacity.
- **Change ID:** apply-and-approve-participants
- **PRD refs:** FR-001, FR-002, FR-004, FR-008, FR-009, US-01
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-06, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** this is the north star — the pending/confirmed state machine is the product's core rule (Business Logic §), and the apply action carries the under-30-seconds guardrail; getting the states wrong here poisons every downstream slice.
- **Status:** done

### S-03: Search and filter runs

- **Outcome:** user can search and filter the active-runs list by map, date, or requirements.
- **Change ID:** search-filter-runs
- **PRD refs:** FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04, S-05, S-06, S-07, S-08, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** finding the right run is the core pain being solved, but filter scope creep is easy — stay on the three axes FR-007 names.
- **Status:** done

### S-04: Run lifecycle — in-progress grace and archival

- **Outcome:** user can see a run marked "in-progress / already started" during the 1-hour grace after its scheduled start, after which it leaves the active list into the archive (retained, not deleted).
- **Change ID:** run-archival-lifecycle
- **PRD refs:** FR-013, US-01
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** MVP uses derived-at-read + RLS active window (no stamped `archived_at` yet); clock skew between Postgres `now()` and Worker `Date` is seconds-level and accepted. Sequenced before community launch so past runs don't clutter the active list.
- **Status:** done

### S-05: Auto-join mode

- **Outcome:** user can apply to an auto-join run and be confirmed on the participant list immediately if capacity remains.
- **Change ID:** auto-join-mode
- **PRD refs:** FR-014, US-02
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-06, S-07, S-08, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** concurrent applies against the last slot is the one race condition in the product; sequenced after S-02 so the base application machinery exists to extend.
- **Status:** done

### S-06: Admin moderation tools

- **Outcome:** admin can delete runs, ban users, and mark a user as verified (`is_verified`).
- **Change ID:** admin-moderation-tools
- **PRD refs:** FR-010, FR-011, FR-012
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-08
- **Blockers:** —
- **Unknowns:**
  - How is the first admin designated (manual DB flag at deploy vs seeded account)? — **Resolved (S-06 planning):** manual SQL promote (`update public.profiles set role = 'admin' where id = …`), reusing the F-01 runbook and documented in README; no seeded credentials in the repo.
- **Risk:** launching a community tool without a moderation safety valve is the real risk; the slice itself is small and fully parallelizable with the core loop.
- **Status:** done

### S-07: Participant archive history

- **Outcome:** confirmed participant can view the archived runs they took part in.
- **Change ID:** participant-archive-history
- **PRD refs:** FR-015, US-01
- **Prerequisites:** S-02, S-04
- **Parallel with:** S-05, S-06, S-08, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** visibility hinges on the "confirmed participant only" rule — this is where the RLS policies from F-01 get exercised against archived data for the first time.
- **Status:** done

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
- **Status:** in-progress

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | run-domain-schema | Establish run-domain schema and RLS baseline | — | Done (shipped); archived → `context/archive/2026-07-29-run-domain-schema/` |
| S-01 | create-and-list-runs | Run creation + public active-runs list | — | Done in `v0.1.1` (+ `v0.1.2`); archived → `context/archive/2026-07-29-create-and-list-runs/` |
| S-02 | apply-and-approve-participants | Apply to join + organizer approval + roster | — | Done in `v0.1.3` (north star); archived → `context/archive/2026-07-31-apply-and-approve-participants/` |
| S-03 | search-filter-runs | Search and filter active runs | yes | Parallel candidate off S-01 |
| S-04 | run-archival-lifecycle | Run lifecycle: in-progress grace + archival | — | Done in `v0.1.5`; archived → `context/archive/2026-08-07-run-archival-lifecycle/` |
| S-05 | auto-join-mode | Auto-join mode | — | Done in `v0.1.6`; archived → `context/archive/2026-08-07-auto-join-mode/` |
| S-06 | admin-moderation-tools | Admin moderation: delete runs, ban, verify | — | Done in `v0.1.6`; archived → `context/archive/2026-08-07-admin-moderation-tools/` |
| S-07 | participant-archive-history | Participant archive history | yes | Unblocked by S-04 (S-02 done) |
| S-08 | my-runs-dashboard | My-runs dashboard | yes | Cuttable nice-to-have off S-01 |
| S-09 | admin-player-archive-view | Admin view of player archived run history | yes | Unblocked by S-06 (S-04 done) |

## Open Roadmap Questions

1. **Where does the KoG map catalog come from — a manually seeded static list, or imported from existing KoG map data?** — **Resolved (S-01 planning):** import from [KoGmaps `mapinfo.txt`](https://github.com/Gamer12120/KoGmaps/blob/main/mapinfo.txt); vendor a snapshot + offline loader for seed; automate GitHub re-pulls later. Unparseable DATE strings stored as null.
2. **What is the minimum slice set before announcing to the KoG community?** — Owner: user. Block: none (suggested floor for market feedback: S-02 ✓ + S-04 + S-06 — loop works, list stays clean, moderation exists — but this is the user's call).

## Parked

- **TeeWorlds client integration** — Why parked: PRD §Non-Goals; MVP operates outside the game.
- **Automatic player stats from the game** — Why parked: PRD §Non-Goals; minimum points threshold stays organizer-set.
- **Native mobile apps** — Why parked: PRD §Non-Goals; web-only for v1, responsive layout may suffice.
- **Archive deletion / retention tiering** — Why parked: PRD §Non-Goals; retain indefinitely until scale demands otherwise.
- **Discord OAuth + KoG Discord verification** — Why parked: PRD §Access Control, deferred to v2+.
- **Discord bot (events/forum posts) + announcement channel** — Why parked: PRD §Access Control, deferred to v2+.
- **Clan Leader and official KoG admin/moderator roles** — Why parked: PRD §Access Control, deferred to v2+.

## Done

| Roadmap ID | Change ID | Shipped | Notes |
|---|---|---|---|
| F-01 | run-domain-schema | schema on local + remote (pre-`v0.1.1`) | Archived 2026-08-07 → `context/archive/2026-07-29-run-domain-schema/` |
| S-01 | create-and-list-runs | `v0.1.1` (+ hardening `v0.1.2`) | Create + public list/detail + KoGmaps catalog; `ensure_own_profile` + Deploy DB sync; archived 2026-08-07 |
| S-02 | apply-and-approve-participants | `v0.1.3` | Apply/withdraw/accept/deny + public roster + organizer seat/leave; auto-join apply deferred to S-05; archived 2026-08-07 |
| S-04 | run-archival-lifecycle | `v0.1.5` | Derived-at-read 1h grace + active-window RLS; in-progress labels; past-grace runs leave the guest active list; archived 2026-08-07 |
| S-05 | auto-join-mode | `v0.1.6` | Race-safe `auto_join_run` RPC + apply path/UI for instant confirm when capacity remains; archived 2026-08-07 |
| S-06 | admin-moderation-tools | `v0.1.6` | Admin delete-run / ban / verify APIs + UI; ban enforcement on mutations; first-admin promote runbook; archived 2026-08-07 |

- **F-01: (foundation) the first migration lands: minimal tables for user profiles (role, `is_verified`, ban flag), runs, and join applications/participations with per-role RLS policies, plus the migration workflow proven locally and in deploy. Downstream slices extend this contract with their own migrations — this foundation does not pre-build every column.** — Archived 2026-08-07 → `context/archive/2026-07-29-run-domain-schema/`. Lesson: —.
- **S-01: user can create a run (map from list/search, date/time, max participants, minimum points threshold, join mode) and any guest can browse the public active-runs list without logging in.** — Archived 2026-08-07 → `context/archive/2026-07-29-create-and-list-runs/`. Lesson: —.
- **S-02: user can register, apply to join an approval-required run, and the organizer can accept or deny each applicant; confirmed players appear on the public participant list and count toward capacity.** — Archived 2026-08-07 → `context/archive/2026-07-31-apply-and-approve-participants/`. Lesson: —.
- **S-04: user can see a run marked "in-progress / already started" during the 1-hour grace after its scheduled start, after which it leaves the active list into the archive (retained, not deleted).** — Archived 2026-08-07 → `context/archive/2026-08-07-run-archival-lifecycle/`. Lesson: —.
- **S-05: user can apply to an auto-join run and be confirmed on the participant list immediately if capacity remains.** — Archived 2026-08-07 → `context/archive/2026-08-07-auto-join-mode/`. Lesson: —.
- **S-06: admin can delete runs, ban users, and mark a user as verified (`is_verified`).** — Archived 2026-08-07 → `context/archive/2026-08-07-admin-moderation-tools/`. Lesson: —.
- **S-03: user can search and filter the active-runs list by map, date, or requirements.** — Archived 2026-08-17 → `context/archive/2026-08-17-search-filter-runs/`. Lesson: —.
- **S-07: confirmed participant can view the archived runs they took part in.** — Archived 2026-08-17 → `context/archive/2026-08-17-participant-archive-history/`. Lesson: —.
