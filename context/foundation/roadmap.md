---
project: "Book Your Miggets"
version: 3
status: draft
created: 2026-08-27
updated: 2026-08-31
prd_version: 2
main_goal: quality
top_blocker: none
---

# Roadmap: Book Your Miggets

> Derived from `context/foundation/prd-v2.md` (v2, brownfield delta) + auto-researched codebase baseline.
> Previous roadmap (F-01 + S-01…S-17 all done) archived at `context/foundation/archive/2026-08-27-roadmap.md`.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index of **this increment**. Shipped F-01 / S-01…S-17 live in `## Done`.

## Vision recap

The core loop is already live: organizers post runs, players apply, friends and restricted visibility work, and there are still no community users. This increment extends that system rather than replacing it. The core hypothesis — the assumption the rest of this increment depends on — is that KoG players will compete as clans whose points only count after an admin verified-finish, while the same organizers get session tools (longer in-progress, multi-map, poll, caps) that do not break what already shipped.

Both tracks must work; shipping only clans or only the run-loop extras is not done. Nothing in F-01 / S-01…S-17 may regress.

## North star

**S-18: verified member can create a clan; guests can browse the directory, open clan details, and see clans ranked by points** — this is the validation milestone (the first complete flow that would show the new competition surface is real) under `main_goal: quality`: a public clan directory with RLS that does not leak friends-only or invite-only runs, before we touch the 1-hour archive window.

> "North star" here means: the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as its Prerequisites allow, because everything else only matters if this works.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-02 | clan-domain-schema | (foundation) minimal clan schema + guest/member/admin RLS landed | — | Access Control Changes, FR-014, FR-028 | done |
| S-18 | create-clan-directory | create a clan; guests browse directory, details, and points ranking | F-02, shipped verified members + public profiles | FR-014, FR-016, FR-017, FR-018, FR-028, FR-029, FR-030, US-02 | done |
| S-19 | clan-friend-invites | (clan owner) invite friends into the clan | S-18, shipped friends | FR-015, US-02 | done |
| S-20 | comment-screenshots | (confirmed participant) attach screenshots in comments without widening ACL | shipped run comments | FR-001, FR-027, US-01, US-02 | ready |
| S-21 | clan-runs | (owner/officer) create a clan run and invite clan members | S-18, S-19, shipped run create | FR-020, FR-028, US-02 | proposed |
| S-22 | complete-clan-run | (owner/officer) mark a clan run completed | S-21 | FR-021, US-02 | proposed |
| S-23 | verified-finish-clan-points | (admin) mark verified-finish; clan points and ranking update only then | S-22, S-20, shipped admin role | FR-019, FR-022, FR-023, FR-018, FR-030, US-02 | proposed |
| S-24 | manual-archive-and-extend | archive via button or extend ≤ 6h; 1-hour auto-archive gone; max 5 active runs | shipped active list + 1-hour window | FR-002, FR-003, FR-004, FR-008, FR-024, US-01 | done |
| S-25 | run-create-limits | set capacity default/max 64; cannot schedule in the past or > 1 year ahead | shipped run create/edit | FR-006, FR-007, US-01 | ready |
| S-26 | team-size-scope | set min auto-join / max approval bands under Advanced settings | shipped approval + auto-join | FR-005, FR-025, FR-026, US-01 | ready |
| S-27 | multi-map-runs | attach multiple maps to one run for a single session | shipped run create + category-only | FR-009, US-01 | ready |
| S-28 | map-poll | create a map poll; confirmed participants vote; closing locks the winning map | shipped confirmed roster + map catalog | FR-010, US-01 | ready |
| S-29 | transfer-run-ownership | (owner) pass ownership to a confirmed participant | shipped confirmed roster | FR-011, US-01 | ready |
| S-30 | owner-delete-run | (owner) delete their run | shipped admin delete | FR-012, US-01 | ready |
| S-31 | changelog-page | open `/changelog` from a footer Changelog link and read release notes | — | FR-013, US-01 | ready |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Clans | `F-02` → `S-18` → `S-19` → `S-21` → `S-22` → `S-23` | Quality: access-control contract before the north star; points stay 0 until `S-23`. |
| B | Comment proof | `S-20` | Joins Stream A at `S-23` (`/teamrank` + finish-line screenshots). Parallel with `F-02`. |
| C | Run loop | `S-24` / `S-25` / `S-26` / `S-27` / `S-28` | Parallel with Stream A. `S-24` is the 1-hour-window blast radius; quality says do not leave it last. |
| D | Owner tools & chrome | `S-29` / `S-30` / `S-31` | Parallel with A–C; no clan dependency. |

## Baseline

What's already in place in the codebase as of `2026-08-27` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

Shipped product (previous roadmap, all `done`): F-01 + S-01…S-17 — create/list/filter, apply/approve, auto-join, 1-hour in-progress then archive, organizer dashboard/edit, participant archive, comments, own/public profiles, friends, friends-only/invite-only runs, admin delete/ban/verify, admin profile edits, player labels. Live `v0.1.15` (later slices tagged or archived; see `## Done`).

- **Frontend:** present — SSR app + interactive islands; public run list/detail, dashboard, profiles, admin, auth-gated create/edit.
- **Backend / API:** present — file-based mutation routes (auth, runs, friends, profile, admin) + route middleware.
- **Data:** present — migrations/RLS for profiles, runs, participants, maps, comments, friends, labels, clan tables (F-02). **Absent:** screenshot/attachment columns on comments.
- **Auth:** present — email/password sessions, protected routes, guest vs member vs admin. Clan owner/officer are not global roles yet (and must not become them).
- **Deploy / infra:** present — Worker host, CI on PR/`main`, production on tag `v*`.
- **Observability:** partial — platform observability on the Worker; no app-level error tracker. No NFR in `prd-v2.md` gates launch on this, so no foundation is opened.

## Foundations

### F-02: Clan-domain schema and RLS contract

- **Outcome:** (foundation) the smallest clan tables exist (clan, membership with owner as the first member, points defaulting to 0) with per-role RLS so a verified member can insert a clan, a guest can read the public directory/details, and friends-only / invite-only runs still cannot leak through clan rows.
- **Change ID:** clan-domain-schema
- **PRD refs:** Access Control Changes, FR-014, FR-028
- **Unlocks:** S-18 (create + guest directory/details/ranking); reduces the leak risk that would make S-18 unplannable
- **Prerequisites:** —
- **Parallel with:** S-20, S-24, S-25, S-26, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** sequenced first because quality forbids deferring the new access-control axis, and the north star cannot be planned without a guest-readable clan row that is not a run. Failure mode is pre-building clan runs, officers, and points rules here — those stay in S-21…S-23.
- **Status:** done

## Slices

### S-18: Create a clan and public directory

- **Outcome:** verified member can create a clan (name, tag, profile picture); guests can browse all clans, open details (name, tag, picture, members, points), and see clans ranked by points (zeros until S-23).
- **Change ID:** create-clan-directory
- **PRD refs:** FR-014, FR-016, FR-017, FR-018, FR-028, FR-029, FR-030, US-02
- **Prerequisites:** F-02, shipped verified members + public profiles
- **Parallel with:** S-20, S-24, S-25, S-26, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:**
  - How is a clan officer appointed (owner-only is enough for “owner or officer” until this is decided)? — Owner: user. Block: no.
- **Risk:** this is the north star — ranking with all-zero points is still a real directory; stuffing invite/run/verify into this slice would hide whether the public surface works. Profile picture introduces upload here (S-20 reuses it); keep email off clan pages.
- **Status:** done

### S-19: Invite friends into a clan

- **Outcome:** clan owner can invite friends to join the clan; accepted members appear on the clan roster guests already see.
- **Change ID:** clan-friend-invites
- **PRD refs:** FR-015, US-02
- **Prerequisites:** S-18, shipped friends
- **Parallel with:** S-20, S-24, S-25, S-26, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** sequenced after S-18 so there is a clan to join; gating invites on the existing friends graph keeps unverified accounts out (same trust bar as restricted runs).
- **Status:** done

### S-20: Screenshots in run comments

- **Outcome:** confirmed participant can attach screenshots in comments on a run they were accepted to; who can post or read does not widen.
- **Change ID:** comment-screenshots
- **PRD refs:** FR-001, FR-027, US-01, US-02
- **Prerequisites:** shipped run comments
- **Parallel with:** F-02, S-18, S-19, S-24, S-25, S-26, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** abuse (size/NSFW) is accepted in the PRD; the slice still must not open comment read/write to guests or pending applicants. Needed by S-23 as the in-app `/teamrank` + finish-line proof path, but admin still checks in-game by hand.
- **Status:** ready

### S-21: Clan runs

- **Outcome:** clan owner or officer can create a clan run and invite clan members to participate; guests and non-members do not see it as a public run, and friends-only / invite-only runs still do not leak.
- **Change ID:** clan-runs
- **PRD refs:** FR-020, FR-028, US-02
- **Prerequisites:** S-18, S-19, shipped run create
- **Parallel with:** S-20, S-24, S-25, S-26, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:**
  - Is a clan run a new audience on the existing run, or a separate listing? — Owner: user. Block: no. Candidate default: same run entity, audience = clan members + admin, never mixed into the guest public stack.
- **Risk:** reusing run create without a new visibility axis will either leak onto `/runs` or fork a second scheduler. Join Stream A here so S-22/S-23 have a real clan session to complete.
- **Status:** proposed

### S-22: Mark a clan run completed

- **Outcome:** clan owner or officer can mark a clan run as completed; points do not change yet.
- **Change ID:** complete-clan-run
- **PRD refs:** FR-021, US-02
- **Prerequisites:** S-21
- **Parallel with:** S-20, S-24, S-25, S-26, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** junk in the admin verify queue is accepted (PRD); the failure mode is adding points on complete — that stays locked until S-23.
- **Status:** proposed

### S-23: Verified-finish and clan points

- **Outcome:** admin can mark a completed clan run as verified-finish after checking in-game `/teamrank` that declared participants finished; only then are clan points (from map points) added and the public ranking updated.
- **Change ID:** verified-finish-clan-points
- **PRD refs:** FR-019, FR-022, FR-023, FR-018, FR-030, US-02
- **Prerequisites:** S-22, S-20, shipped admin role
- **Parallel with:** S-24, S-25, S-26, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** last mile of US-02; scraping `/teamrank` is parked — this slice is a manual admin mark plus the screenshot thread from S-20, not a game client. Ranking in S-18 stays honest (zeros until this lands).
- **Status:** proposed

### S-24: Manual archive, extend, and active-run cap

- **Outcome:** organizer or admin can archive a run via a button; organizer can extend an in-progress run by at most 6 hours; the 1-hour auto-archive window is gone; an organizer may have at most 5 non-archived runs (archiving frees a slot). Guests still browse/filter the public active list.
- **Change ID:** manual-archive-and-extend
- **PRD refs:** FR-002, FR-003, FR-004, FR-008, FR-024, US-01
- **Prerequisites:** shipped active list + 1-hour window
- **Parallel with:** F-02, S-18, S-19, S-20, S-21, S-22, S-23, S-25, S-26, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** this is the blast radius on shipped lifecycle (derived 1-hour window + RLS). Quality sequences it in parallel with Stream A, not after clans are finished. Pairing the 5-run cap here so removing auto-archive does not leave organizers stuck at 5 with no way to free a slot.
- **Status:** done

### S-25: Capacity 64 and schedule bounds

- **Outcome:** organizer can set capacity (default 64, maximum 64) and cannot schedule a run in the past or more than 1 year ahead.
- **Change ID:** run-create-limits
- **PRD refs:** FR-006, FR-007, US-01
- **Prerequisites:** shipped run create/edit
- **Parallel with:** F-02, S-18, S-19, S-20, S-21, S-22, S-23, S-24, S-26, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** form-level guards only; keep them off the Advanced dump so the 1-minute create guardrail still holds. 5-active lives in S-24 because it depends on how runs leave the active set.
- **Status:** ready

### S-26: Team-size scope

- **Outcome:** organizer can set a team-size scope under Advanced settings so a minimum number of players auto-join and remaining slots up to max require approval; the default create control stays approval vs auto-join. Apply/approve and auto-join otherwise keep working.
- **Change ID:** team-size-scope
- **PRD refs:** FR-005, FR-025, FR-026, US-01
- **Prerequisites:** shipped approval + auto-join
- **Parallel with:** F-02, S-18, S-19, S-20, S-21, S-22, S-23, S-24, S-25, S-27, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** a third join mode on the default form would break the 1-minute create guardrail; Advanced settings is the PRD’s resolution. Concurrent last-slot races already exist in auto-join — bands must not reintroduce a double-confirm.
- **Status:** ready

### S-27: Multi-map session

- **Outcome:** organizer can attach multiple maps to one run for a single session; the active list and detail show that set.
- **Change ID:** multi-map-runs
- **PRD refs:** FR-009, US-01
- **Prerequisites:** shipped run create + category-only
- **Parallel with:** F-02, S-18, S-19, S-20, S-21, S-22, S-23, S-24, S-25, S-26, S-28, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** keep this independent of S-28 (PRD: poll and multi-map are separate tools). Category-only runs still need a coherent card when some maps are unset.
- **Status:** ready

### S-28: Map poll

- **Outcome:** organizer can create a map poll whose options are specific maps; confirmed participants vote; when the organizer closes the poll, the winning map becomes the run’s map.
- **Change ID:** map-poll
- **PRD refs:** FR-010, US-01
- **Prerequisites:** shipped confirmed roster + map catalog
- **Parallel with:** F-02, S-18, S-19, S-20, S-21, S-22, S-23, S-24, S-25, S-26, S-27, S-29, S-30, S-31
- **Blockers:** —
- **Unknowns:**
  - If a run also has a multi-map list, does closing the poll replace that list or only lock the single `map` field? — Owner: user. Block: no. Candidate default: poll writes the locked map field; the multi-map list is unchanged.
- **Risk:** votes must stay confirmed-participants-only (same bar as comments). Closing the poll is organizer-only so a random roster vote cannot rewrite the card mid-session without that close action.
- **Status:** ready

### S-29: Pass run ownership

- **Outcome:** run owner can pass ownership to a confirmed participant.
- **Change ID:** transfer-run-ownership
- **PRD refs:** FR-011, US-01
- **Prerequisites:** shipped confirmed roster
- **Parallel with:** F-02, S-18, S-19, S-20, S-21, S-22, S-23, S-24, S-25, S-26, S-27, S-28, S-30, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** the new owner inherits archive/edit/delete; transferring to a pending applicant would bypass the roster rule — confirmed-only is the gate.
- **Status:** ready

### S-30: Owner deletes a run

- **Outcome:** run owner can delete the run (admin delete already exists).
- **Change ID:** owner-delete-run
- **PRD refs:** FR-012, US-01
- **Prerequisites:** shipped admin delete
- **Parallel with:** F-02, S-18, S-19, S-20, S-21, S-22, S-23, S-24, S-25, S-26, S-27, S-28, S-29, S-31
- **Blockers:** —
- **Unknowns:** —
- **Risk:** owner delete is not archive (S-24); deleting must not strand participant archive history already shipped. Prefer the same hard-delete path admin uses, now also allowed for the owner.
- **Status:** ready

### S-31: Changelog page

- **Outcome:** guest can open `/changelog` from a footer Changelog link and read release notes.
- **Change ID:** changelog-page
- **PRD refs:** FR-013, US-01
- **Prerequisites:** —
- **Parallel with:** F-02, S-18, S-19, S-20, S-21, S-22, S-23, S-24, S-25, S-26, S-27, S-28, S-29, S-30
- **Blockers:** —
- **Unknowns:** —
- **Risk:** smallest independent slice; do not block it on clans or lifecycle. Copy can track GitHub Release notes already produced at tag time.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-02 | clan-domain-schema | Minimal clan schema + RLS (guest directory, no run leak) | yes | Unlocks north star S-18 |
| S-18 | create-clan-directory | Create clan + public directory/details/ranking | no | Waits on F-02 |
| S-19 | clan-friend-invites | Clan owner invites friends | no | Done — archived 2026-08-31 |
| S-20 | comment-screenshots | Screenshots in comments (ACL unchanged) | yes | Parallel with F-02 |
| S-21 | clan-runs | Clan run + invite clan members | yes | Unlocked by S-19 |
| S-22 | complete-clan-run | Owner/officer marks clan run completed | no | Waits on S-21 |
| S-23 | verified-finish-clan-points | Admin verified-finish; points + ranking | no | Waits on S-22, S-20 |
| S-24 | manual-archive-and-extend | Archive button, extend ≤ 6h, drop 1h window, max 5 active | yes | Blast radius on shipped lifecycle |
| S-25 | run-create-limits | Capacity 64 + schedule not past / ≤ 1 year | yes | — |
| S-26 | team-size-scope | Team-size bands under Advanced settings | yes | — |
| S-27 | multi-map-runs | Multiple maps on one run | yes | Separate from S-28 |
| S-28 | map-poll | Map poll; close locks winning map | yes | — |
| S-29 | transfer-run-ownership | Pass run ownership to a confirmed participant | yes | — |
| S-30 | owner-delete-run | Run owner can delete the run | yes | — |
| S-31 | changelog-page | Footer Changelog → `/changelog` | yes | — |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. Include one row for every `F-NN` and `S-NN`. It should be compact enough to copy into issues, but it must not duplicate the detailed roadmap body.

## Open Roadmap Questions

1. **How is a clan officer appointed?** — Owner: user. Block: none (owner-only fulfills “owner or officer” until this is decided). Affects S-21 / S-22.
2. **Is a clan run a new audience on the existing run, or a separate listing?** — Owner: user. Block: S-21 (planning not blocked; candidate default: same run entity, audience = clan members + admin, never mixed into the guest public stack).
3. **If a run has both a multi-map list and a poll, does closing the poll replace the list or only lock the single map field?** — Owner: user. Block: S-28 (planning not blocked; candidate default: poll writes the locked map field; multi-map list unchanged).

## Parked

- **TeeWorlds client hooks or scraping `/teamrank`** — Why parked: PRD §Non-Goals; admin still checks in-game by hand (S-23).
- **New externally advertised SLA** — Why parked: PRD §Non-Goals; existing create/apply timing guardrails stay.
- **Discord OAuth + KoG Discord verification** — Why parked: previous PRD Access Control, still deferred; verification remains the existing admin flag.
- **Discord bot (events/forum posts) + announcement channel** — Why parked: previous Access Control; in-app comments + screenshots (S-20) are the substitute.
- **Clan Leader and official KoG admin/moderator as global roles** — Why parked: previous Access Control; this increment adds owner/officer as positions *inside* a clan only.
- **Friend activity feeds, and comments from non-participants** — Why parked: previous Access Control; comment ACL stays (FR-027).
- **Native mobile apps / TeeWorlds client integration / automatic player stats / archive retention tiering** — Why parked: previous Non-Goals; unchanged.

## Done

Previous full roadmap archived 2026-08-27 → `context/foundation/archive/2026-08-27-roadmap.md`.

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
- **S-15: organizer can create a friends-only run (visible to their friends, highlighted or in a separate list section) or an invite-only run (visible only to friends they pick); guests and everyone else do not see those runs.** — Archived 2026-08-24 → `context/archive/2026-08-24-restricted-run-visibility/`. Lesson: —.
- **S-16: admin can edit a player's nickname and KoG points from the existing admin player page, mark points as verified after an in-game check, and accept or deny nickname-change requests from verified members.** — Archived 2026-08-24 → `context/archive/2026-08-24-admin-profile-edits/`. Lesson: —.
- **S-17: admin can create a dictionary of labels (name + color), assign them to players, and everyone sees those labels on the player's public profile.** — Archived 2026-08-25 → `context/archive/2026-08-25-player-labels/`. Lesson: —.
- **F-02: (foundation) the smallest clan tables exist (clan, membership with owner as the first member, points defaulting to 0) with per-role RLS so a verified member can insert a clan, a guest can read the public directory/details, and friends-only / invite-only runs still cannot leak through clan rows.** — Archived 2026-08-27 → `context/archive/2026-08-27-clan-domain-schema/`. Lesson: —.
- **S-18: verified member can create a clan (name, tag, profile picture); guests can browse all clans, open details (name, tag, picture, members, points), and see clans ranked by points (zeros until S-23).** — Archived 2026-08-27 → `context/archive/2026-08-27-create-clan-directory/`. Lesson: —.
- **S-19: clan owner can invite friends to join the clan; accepted members appear on the clan roster guests already see.** — Archived 2026-08-31 → `context/archive/2026-08-31-clan-friend-invites/`. Lesson: —.
- **S-24: organizer or admin can archive a run via a button; organizer can extend an in-progress run by at most 6 hours; the 1-hour auto-archive window is gone; an organizer may have at most 5 non-archived runs (archiving frees a slot). Guests still browse/filter the public active list.** — Archived 2026-08-31 → `context/archive/2026-08-31-manual-archive-and-extend/`. Lesson: —.
