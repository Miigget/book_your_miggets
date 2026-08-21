---
project: "Book Your Miggets"
version: 2
status: draft
created: 2026-07-27
updated: 2026-08-21
prd_version: 2
main_goal: market-feedback
top_blocker: community-launch
---

# Roadmap: Book Your Miggets

> Derived from `context/foundation/prd.md` (v2) + auto-researched codebase baseline.
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
| S-08 | my-runs-dashboard | (organizer) view all runs they created in one place | S-01 | FR-005 | done |
| S-09 | admin-player-archive-view | (admin) view any player's archived run history from their profile | S-04, S-06 | FR-016 | done |
| S-10 | user-profile | manage own profile (nickname if unverified, email, password, KoG points); open others via clickable nicknames | S-02 | FR-017, FR-018, FR-023, US-03 | done |
| S-11 | add-friends | (verified) send/accept/decline friend requests and see friends list on the profile | S-10 | FR-019, US-04 | done |
| S-12 | run-comments | (confirmed participant) post comments on a run they were accepted to | S-02 | FR-020, US-05 | done |
| S-13 | edit-run | (organizer) edit an active run they created | S-01 | FR-021, US-06 | done |
| S-14 | category-only-runs | create a run with a map category and no specific map; category shows on the card | S-01 | FR-022, US-07 | done |
| S-15 | restricted-run-visibility | create friends-only or invite-only runs; hidden from everyone else | S-01, S-11 | FR-027, FR-028, US-08, US-09 | proposed |
| S-16 | admin-profile-edits | (admin) edit player nickname/points, verify points, handle nickname-change requests | S-09, S-10 | FR-023, FR-024, US-10 | ready |
| S-17 | player-labels | (admin) maintain label dictionary (name + color) and assign labels shown on public profiles | S-09, S-10 | FR-029, FR-030, US-11 | ready |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Core loop | `F-01` → `S-01` → `S-02` → `S-05` / `S-12` | The market-feedback spine, plus in-app comments joining at `S-02`. |
| B | Discovery | `S-03` → `S-14` | Category-only runs extend how map-less cards advertise difficulty. |
| C | Lifecycle & history | `S-04` → `S-07` | `S-07` also joins Stream A at `S-02` (needs confirmed participation). |
| D | Moderation & admin | `S-06` → `S-09` → `S-16` / `S-17` | Profile edits and labels join Stream E at `S-10`. |
| E | Organizer & identity | `S-08` → `S-13` / `S-10` → `S-11` → `S-15` | Friends unlock restricted run visibility. |

## Baseline

What's already in place in the codebase as of `2026-08-21` (MVP slices F-01 + S-01…S-09 plus post-MVP S-10 / S-12 / S-13 shipped; live `v0.1.15`). S-14 (`category-only-runs`) is implemented and archived on `feature/category-only-runs`, not tagged yet. Earlier tags: S-13 `v0.1.15`, S-12 `v0.1.14`, S-10 `v0.1.13`, landing/filter chrome `v0.1.12`/`v0.1.11`, S-08 `v0.1.10`, S-09 `v0.1.9`, S-07 `v0.1.8`, S-03 `v0.1.7`, S-05+S-06 `v0.1.6`, S-04 `v0.1.5`, north-star S-02 `v0.1.3`, F-01+S-01 `v0.1.1` (+ `v0.1.2`).
PRD v1 must-haves are covered. Remaining PRD v2 slices: S-11, S-15…S-17. Landing/chrome polish is tracked as GitHub issues, not slices — do not open a new foundation just to re-scaffold what is below.

- **Frontend:** present — Astro SSR + React islands + Tailwind/shadcn; public run list/detail (search/filter behind a toggle, filled/capacity, in-progress labels, apply/approve/leave/kick, auto-join, comments+likes for confirmed readers, organizer Edit); organizer `/dashboard` (created active + past); participant `/runs/history`; member `/profile` + public `/players/{id}`; clickable nicknames; admin moderation + `/admin/users/{id}` archive; auth-gated create/edit (`/runs/new`, `/runs/{id}/edit`, `/dashboard`, `/runs/history`, `/profile`, `/admin`).
- **Backend / API:** present — SSR on Cloudflare Workers; auth endpoints; `POST /api/runs` + `POST /api/runs/{id}` (edit); profile APIs (nickname / nickname-request / email / password / points); participant mutations (`apply` / `withdraw` / `leave-team` / `kick` / `decide` with race-safe auto-join); comment post/like + admin comment-delete; admin moderation APIs; middleware gates `/dashboard`, `/runs/new`, `/runs/{id}/edit`, `/runs/history`, `/profile`, `/admin`; active list/detail/mutations enforce the FR-013 active window; banned users are blocked from mutations; archived detail loaders for participant / organizer-owner / admin.
- **Data:** present — migrations for `profiles`, `runs`, `run_participants`, `maps`, `nickname_change_requests`, `run_comments`, `run_comment_likes`; `kog_points` / `kog_points_verified` on profiles; organizer auto-seat trigger + DELETE withdraw/leave/kick policies; UPDATE invariants on active runs (join-mode lock, capacity floor); `ensure_own_profile` + race-safe `auto_join_run` RPCs; KoGmaps seed/import; RLS active-window SELECT for guest/member plus organizer/admin archive visibility; comment ACL (confirmed / admin / unseated organizer read); generated `src/types/database.ts`.
- **Auth:** present — Supabase email/password end-to-end: signup/signin/signout routes, cookie sessions, protected-route middleware, auth pages, member email/password change from `/profile`, safe `returnTo` back to `/runs/{uuid}` for the guest→apply path. FR-001/FR-002 are exercised inside the participation flow; admin role gating for moderation.
- **Deploy / infra:** present — Cloudflare Workers via wrangler; CI (lint/build on PR/`main`); production Deploy on tag `v*` runs Supabase `db push`, seeds `kog-maps.sql` only when that file changed since the previous tag, then deploys the Worker (`.github/workflows/deploy.yml`); live at [https://book-your-miggets.bookyourmiggets.workers.dev](https://book-your-miggets.bookyourmiggets.workers.dev) (`v0.1.15`).
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
- **Status:** done

### S-09: Admin view of a player's archive

- **Outcome:** admin can open a player's profile and view that player's full archived run history.
- **Change ID:** admin-player-archive-view
- **PRD refs:** FR-016
- **Prerequisites:** S-04, S-06
- **Parallel with:** S-03, S-05, S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** introduces the player-profile surface for the first time; small slice, but it widens access control (admin bypasses the confirmed-participant rule), so it leans on S-06's role gating.
- **Status:** done

### S-10: Own profile, public profile, clickable nicknames

- **Outcome:** user can manage their own profile (nickname if not verified, email, password, self-reported KoG points), see nickname in the top bar instead of email, and open any player's public profile by clicking a nickname anywhere in the app; a verified member cannot change nickname themselves and instead submits a change request.
- **Change ID:** user-profile
- **PRD refs:** FR-017, FR-018, FR-023, US-03
- **Prerequisites:** S-02
- **Parallel with:** S-12, S-13, S-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** this is the identity surface friends, labels, and roster links need; keep email off the public page; admin fulfillment of nickname/points lives in S-16 so this slice stays member-facing.
- **Status:** done

### S-11: Add verified friends

- **Outcome:** verified user can send, accept, or decline friend requests to other verified members and see the friends list on the profile (including Add friend on someone else's public profile).
- **Change ID:** add-friends
- **PRD refs:** FR-019, US-04
- **Prerequisites:** S-10
- **Parallel with:** S-12, S-13, S-14, S-16, S-17
- **Blockers:** —
- **Unknowns:** —
- **Risk:** sequenced after S-10 so a request has a public profile to live on; unverified accounts stay out of the graph so S-15 private runs cannot leak through fake friends.
- **Status:** done

### S-12: Comments on runs you were accepted to

- **Outcome:** confirmed participant can post comments on a run they were accepted to.
- **Change ID:** run-comments
- **PRD refs:** FR-020, US-05
- **Prerequisites:** S-02
- **Parallel with:** S-10, S-13, S-14
- **Blockers:** —
- **Unknowns:**
  - Are comments readable by anyone who can view the run, or only by confirmed participants? — **Resolved (S-12 planning):** read is confirmed participants, admins, and unseated organizers — not guests/pending/denied. Posting and likes stay confirmed-participant-only on active runs.
- **Risk:** in-app comments substitute the Discord-bot comment sync parked for v2+; posting must stay confirmed-participant-only so random guests cannot spam a roster.
- **Status:** done

### S-13: Edit an active run

- **Outcome:** organizer can edit an active run they created.
- **Change ID:** edit-run
- **PRD refs:** FR-021, US-06
- **Prerequisites:** S-01
- **Parallel with:** S-10, S-12, S-14
- **Blockers:** —
- **Unknowns:**
  - After players have applied or been confirmed, which fields may still change? — **Resolved (S-13 planning):** title, start time, map, min points, capacity not below confirmed roster (including organizer auto-seat); lock `join_mode` after any non-organizer participant row (pending/confirmed/denied). Organizer auto-seat means "first confirmation" is not a useful lock trigger.
- **Risk:** join-mode or capacity edits can desync the pending/confirmed machine from S-02/S-05; lock the dangerous fields rather than invent a migration of existing applications.
- **Status:** done

### S-14: Category-only runs

- **Outcome:** organizer can create a run with a map category and no specific map; that category shows on the run card.
- **Change ID:** category-only-runs
- **PRD refs:** FR-022, US-07
- **Prerequisites:** S-01
- **Parallel with:** S-10, S-12, S-13
- **Blockers:** —
- **Unknowns:** —
- **Risk:** map is already optional, so the failure mode is a card with neither map nor category; store category on the run (catalog difficulty values) rather than inferring it from a missing map.
- **Status:** done

### S-15: Friends-only and invite-only runs

- **Outcome:** organizer can create a friends-only run (visible to their friends, highlighted or in a separate list section) or an invite-only run (visible only to friends they pick); guests and everyone else do not see those runs.
- **Change ID:** restricted-run-visibility
- **PRD refs:** FR-027, FR-028, US-08, US-09
- **Prerequisites:** S-01, S-11
- **Parallel with:** S-12, S-13, S-14, S-16, S-17
- **Blockers:** —
- **Unknowns:**
  - Friends-only presentation — separate section vs highlight in the same list? — Owner: user. Block: no. Candidate default: distinct "Friends" / "Invited" sections on `/runs`.
  - If two friends unfriend after an invite-only run was created, does the invitee keep access? — Owner: user. Block: no. Candidate default: invite is a snapshot at create/edit time.
- **Risk:** visibility is a new RLS axis on top of the active window; both modes share that axis so they ship together — splitting them would duplicate the leak-risk. Admins still see restricted runs so S-06 delete remains possible.
- **Status:** proposed

### S-16: Admin edits player profiles

- **Outcome:** admin can edit a player's nickname and KoG points from the existing admin player page, mark points as verified after an in-game check, and accept or deny nickname-change requests from verified members.
- **Change ID:** admin-profile-edits
- **PRD refs:** FR-023, FR-024, US-10
- **Prerequisites:** S-09, S-10
- **Parallel with:** S-11, S-12, S-13, S-14, S-17
- **Blockers:** —
- **Unknowns:** —
- **Risk:** extends the S-09 admin player page rather than adding a second profile; without this slice, S-10's nickname-change request and points self-report have nowhere to be trusted.
- **Status:** ready

### S-17: Player labels

- **Outcome:** admin can create a dictionary of labels (name + color), assign them to players, and everyone sees those labels on the player's public profile.
- **Change ID:** player-labels
- **PRD refs:** FR-029, FR-030, US-11
- **Prerequisites:** S-09, S-10
- **Parallel with:** S-11, S-12, S-13, S-14, S-16
- **Blockers:** —
- **Unknowns:** —
- **Risk:** keep it a small admin dictionary, not player-authored tags; assignment belongs on the same admin player page as S-16 — coordinate if both are in flight, but they do not depend on each other.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | run-domain-schema | Establish run-domain schema and RLS baseline | — | Done (shipped); archived → `context/archive/2026-07-29-run-domain-schema/` |
| S-01 | create-and-list-runs | Run creation + public active-runs list | — | Done in `v0.1.1` (+ `v0.1.2`); archived → `context/archive/2026-07-29-create-and-list-runs/` |
| S-02 | apply-and-approve-participants | Apply to join + organizer approval + roster | — | Done in `v0.1.3` (north star); archived → `context/archive/2026-07-31-apply-and-approve-participants/` |
| S-03 | search-filter-runs | Search and filter active runs | — | Done in `v0.1.7`; archived → `context/archive/2026-08-17-search-filter-runs/` |
| S-04 | run-archival-lifecycle | Run lifecycle: in-progress grace + archival | — | Done in `v0.1.5`; archived → `context/archive/2026-08-07-run-archival-lifecycle/` |
| S-05 | auto-join-mode | Auto-join mode | — | Done in `v0.1.6`; archived → `context/archive/2026-08-07-auto-join-mode/` |
| S-06 | admin-moderation-tools | Admin moderation: delete runs, ban, verify | — | Done in `v0.1.6`; archived → `context/archive/2026-08-07-admin-moderation-tools/` |
| S-07 | participant-archive-history | Participant archive history | — | Done in `v0.1.8`; archived → `context/archive/2026-08-17-participant-archive-history/` |
| S-08 | my-runs-dashboard | My-runs dashboard | — | Done in `v0.1.10`; archived → `context/archive/2026-08-18-my-runs-dashboard/` |
| S-09 | admin-player-archive-view | Admin view of player archived run history | — | Done in `v0.1.9`; archived → `context/archive/2026-08-17-admin-player-archive-view/` |
| S-10 | user-profile | Own + public profile, clickable nicknames, email/password/points | — | Done in `v0.1.13`; archived → `context/archive/2026-08-20-user-profile/` |
| S-11 | add-friends | Friend requests between verified members (from profile) | yes | Run `/10x-plan add-friends` |
| S-12 | run-comments | Comments on runs you were accepted to | — | Done in `v0.1.14`; archived → `context/archive/2026-08-20-run-comments/` |
| S-13 | edit-run | Organizer edits an active run | — | Done in `v0.1.15`; archived → `context/archive/2026-08-20-edit-run/` |
| S-14 | category-only-runs | Category-only run (no specific map) | — | Implemented on `feature/category-only-runs`; archived → `context/archive/2026-08-21-category-only-runs/` (tag pending `/gh-ship`) |
| S-15 | restricted-run-visibility | Friends-only and invite-only runs | no | Waits on S-11 |
| S-16 | admin-profile-edits | Admin edits nickname/points; nickname-change requests | yes | Run `/10x-plan admin-profile-edits` |
| S-17 | player-labels | Admin label dictionary + assign to public profiles | yes | Run `/10x-plan player-labels` |

## Open Roadmap Questions

1. **Where does the KoG map catalog come from — a manually seeded static list, or imported from existing KoG map data?** — **Resolved (S-01 planning):** import from [KoGmaps `mapinfo.txt`](https://github.com/Gamer12120/KoGmaps/blob/main/mapinfo.txt); vendor a snapshot + offline loader for seed; automate GitHub re-pulls later. Unparseable DATE strings stored as null.
2. **What is the minimum slice set before announcing to the KoG community?** — Owner: user. **Suggested floor is now met** (S-02 + S-04 + S-06, plus the rest of PRD v1 through S-09 / `v0.1.10`, and post-MVP S-10 / S-12 / S-13 / `v0.1.15`). Block: none — this is the remaining product call, not a missing slice. Landing/chrome polish (starter copy, logo, filter collapse, tee background) shipped as GitHub issues in `v0.1.11`/`v0.1.12`, not slices.
3. **After players have applied or been confirmed, which run fields may the organizer still change?** — **Resolved (S-13):** title, start time, map, min points, capacity not below confirmed roster; lock `join_mode` after any non-organizer participant row.
4. **Are run comments readable by anyone who can view the run, or only by confirmed participants?** — **Resolved (S-12):** confirmed participants, admins, and unseated organizers only; guests/pending/denied do not see the thread.
5. **Friends-only list presentation — separate section vs highlight in the same list?** — Owner: user. Block: S-15 (planning not blocked; candidate default: distinct sections).
6. **If two friends unfriend after an invite-only run was created, does the invitee keep access?** — Owner: user. Block: S-15 (planning not blocked; candidate default: invite snapshot).

## Parked

- **TeeWorlds client integration** — Why parked: PRD §Non-Goals; MVP operates outside the game.
- **Automatic player stats from the game** — Why parked: PRD §Non-Goals; no live client sync. Self-reported points + admin in-game check are S-10 / S-16 instead.
- **Native mobile apps** — Why parked: PRD §Non-Goals; web-only for v1, responsive layout may suffice.
- **Archive deletion / retention tiering** — Why parked: PRD §Non-Goals; retain indefinitely until scale demands otherwise.
- **Discord OAuth + KoG Discord verification** — Why parked: PRD §Access Control, deferred to v2+.
- **Discord bot (events/forum posts) + announcement channel** — Why parked: PRD §Access Control, deferred to v2+; in-app comments are S-12 instead of waiting on the bot.
- **Clan Leader and official KoG admin/moderator roles** — Why parked: PRD §Access Control, deferred to v2+.
- **Friend activity feeds, and comments from non-participants** — Why parked: PRD §Access Control; friends-only / invite-only runs are S-15.

## Done

| Roadmap ID | Change ID | Shipped | Notes |
|---|---|---|---|
| F-01 | run-domain-schema | schema on local + remote (pre-`v0.1.1`) | Archived 2026-08-07 → `context/archive/2026-07-29-run-domain-schema/` |
| S-01 | create-and-list-runs | `v0.1.1` (+ hardening `v0.1.2`) | Create + public list/detail + KoGmaps catalog; `ensure_own_profile` + Deploy DB sync; archived 2026-08-07 |
| S-02 | apply-and-approve-participants | `v0.1.3` | Apply/withdraw/accept/deny + public roster + organizer seat/leave; auto-join apply deferred to S-05; archived 2026-08-07 |
| S-04 | run-archival-lifecycle | `v0.1.5` | Derived-at-read 1h grace + active-window RLS; in-progress labels; past-grace runs leave the guest active list; archived 2026-08-07 |
| S-05 | auto-join-mode | `v0.1.6` | Race-safe `auto_join_run` RPC + apply path/UI for instant confirm when capacity remains; archived 2026-08-07 |
| S-06 | admin-moderation-tools | `v0.1.6` | Admin delete-run / ban / verify APIs + UI; ban enforcement on mutations; first-admin promote runbook; archived 2026-08-07 |
| S-03 | search-filter-runs | `v0.1.7` | Map / date / requirements / organizer filters on the active list; archived 2026-08-17 |
| S-07 | participant-archive-history | `v0.1.8` | Confirmed-participant `/runs/history` + archived detail; archived 2026-08-17 |
| S-09 | admin-player-archive-view | `v0.1.9` | Admin `/admin/users/{id}` + archived-detail bypass; archived 2026-08-17 |
| S-08 | my-runs-dashboard | `v0.1.10` | Organizer `/dashboard` (created active + past) + owner archived-detail; archived 2026-08-18 |
| S-10 | user-profile | `v0.1.13` | Own `/profile` + public `/players/{id}` + clickable nicknames + email/password/points + nickname-change requests; archived 2026-08-20 |
| S-12 | run-comments | `v0.1.14` | Confirmed-participant comments + likes; admin delete; in-place run-page actions; archived 2026-08-20 |
| S-13 | edit-run | `v0.1.15` | Organizer `/runs/{id}/edit` + UPDATE invariants; extras in the same tag: member leave + organizer kick + clickable cards; archived 2026-08-20 |
| S-14 | category-only-runs | (tag pending) | Category-only create/edit + Category on cards; archived 2026-08-21 → `context/archive/2026-08-21-category-only-runs/` |

- **F-01: (foundation) the first migration lands: minimal tables for user profiles (role, `is_verified`, ban flag), runs, and join applications/participations with per-role RLS policies, plus the migration workflow proven locally and in deploy. Downstream slices extend this contract with their own migrations — this foundation does not pre-build every column.** — Archived 2026-08-07 → `context/archive/2026-07-29-run-domain-schema/`. Lesson: —.
- **S-01: user can create a run (map from list/search, date/time, max participants, minimum points threshold, join mode) and any guest can browse the public active-runs list without logging in.** — Archived 2026-08-07 → `context/archive/2026-07-29-create-and-list-runs/`. Lesson: —.
- **S-02: user can register, apply to join an approval-required run, and the organizer can accept or deny each applicant; confirmed players appear on the public participant list and count toward capacity.** — Archived 2026-08-07 → `context/archive/2026-07-31-apply-and-approve-participants/`. Lesson: —.
- **S-04: user can see a run marked "in-progress / already started" during the 1-hour grace after its scheduled start, after which it leaves the active list into the archive (retained, not deleted).** — Archived 2026-08-07 → `context/archive/2026-08-07-run-archival-lifecycle/`. Lesson: —.
- **S-05: user can apply to an auto-join run and be confirmed on the participant list immediately if capacity remains.** — Archived 2026-08-07 → `context/archive/2026-08-07-auto-join-mode/`. Lesson: —.
- **S-06: admin can delete runs, ban users, and mark a user as verified (`is_verified`).** — Archived 2026-08-07 → `context/archive/2026-08-07-admin-moderation-tools/`. Lesson: —.
- **S-03: user can search and filter the active-runs list by map, date, or requirements.** — Archived 2026-08-17 → `context/archive/2026-08-17-search-filter-runs/`. Lesson: —.
- **S-07: confirmed participant can view the archived runs they took part in.** — Archived 2026-08-17 → `context/archive/2026-08-17-participant-archive-history/`. Lesson: —.
- **S-09: admin can open a player's profile and view that player's full archived run history.** — Archived 2026-08-17 → `context/archive/2026-08-17-admin-player-archive-view/`. Lesson: —.
- **S-08: organizer can view and manage all runs they created in one place.** — Archived 2026-08-18 → `context/archive/2026-08-18-my-runs-dashboard/`. Lesson: —.
- **S-10: user can manage their own profile (nickname if not verified, email, password, self-reported KoG points), see nickname in the top bar instead of email, and open any player's public profile by clicking a nickname anywhere in the app; a verified member cannot change nickname themselves and instead submits a change request.** — Archived 2026-08-20 → `context/archive/2026-08-20-user-profile/`. Lesson: —.
- **S-12: confirmed participant can post comments on a run they were accepted to.** — Archived 2026-08-20 → `context/archive/2026-08-20-run-comments/`. Lesson: —.
- **S-13: organizer can edit an active run they created.** — Archived 2026-08-20 → `context/archive/2026-08-20-edit-run/`. Lesson: —.
- **S-14: organizer can create a run with a map category and no specific map; that category shows on the run card.** — Archived 2026-08-21 → `context/archive/2026-08-21-category-only-runs/`. Lesson: —.
- **S-11: verified user can send, accept, or decline friend requests to other verified members and see the friends list on the profile (including Add friend on someone else's public profile).** — Archived 2026-08-21 → `context/archive/2026-08-21-add-friends/`. Lesson: —.
