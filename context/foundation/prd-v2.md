---
project: "Book Your Miggets"
version: 2
status: draft
created: 2026-08-27
context_type: brownfield
product_type: web-app
target_scale:
  users: medium
timeline_budget:
  delivery_weeks: 8
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

Book Your Miggets is a Team Finder / Run Scheduler for the King of Gores (KoG) community in TeeWorlds. What exists today is the shipped PRD v2 / roadmap through F-01 and S-01…S-17 (live `v0.1.15`): create and list runs, apply/approve, auto-join, 1-hour in-progress grace then archive, search/filter, organizer dashboard and edit, participant archive, comments, own/public profiles, friends, friends-only and invite-only runs, admin delete/ban/verify, admin profile edits, and player labels.

Tech stack as recorded in the roadmap baseline: Astro SSR, React islands, Tailwind, Supabase, Cloudflare Workers.

Roles in the product today: guest (unauthenticated browse), member (registered; unverified vs admin-verified), and admin. There are no community users yet.

## Problem Statement & Motivation

The change is an extension of that shipped system — not a rewrite. Two tracks: (1) significant features on the existing run loop (screenshots in comments, organizer/admin archive button, 1-hour in-progress window then derived archive unless the organizer extends ≤ 6 hours, team-size scope under Advanced settings, changelog page, capacity default and max 64, schedule at most 1 year ahead and never in the past, max 5 active runs per organizer, multi-map on one run, map poll, pass ownership to a participant, owner can delete a run); (2) a new clans module (create, invite friends, public clan directory and details, ranking by clan points, clan runs created by owner/officers, manual complete, admin verified-finish via in-game `/teamrank` plus screenshots, points only after verified finish).

Why now: the core loop is shipped and several of these ideas were parked (clans as v2+, 1-hour grace). There are no community users yet, so the author is adding product ideas before launch rather than waiting on production feedback.

Must preserve: nothing already shipped may break; those slices work and stay.

## User & Persona

**Primary persona: Run organizer** — same as the existing PRD: an experienced KoG player who schedules and fills runs. This change adds session-length, team-size, multi-map, ownership, and anti-troll controls around that same job.

**Secondary persona: Clan owner / officer** — creates a clan, invites friends, runs clan sessions, submits proof, and cares that verified finishes turn into clan points. Not the persona this PRD delta optimizes first.

**Not a community-user persona yet:** the app has no users; these are the author's ideas.

## Success Criteria

### Primary

Both sessions work — the change is not done if only one track ships.

**Run-loop session**

1. Organizer creates a run: multiple maps, capacity default 64 (max 64), start not in the past and at most 1 year ahead, team-size scope available under Advanced settings (production join mode stays the default control), subject to max 5 active runs.
2. Players join: auto-join up to the min band when team-size is used, then approval for the rest; otherwise today’s join mode; still counting toward capacity.
3. After start, the run is in-progress until the organizer or admin archives via a button, or until a timed extension of at most 6 hours elapses; owner can pass ownership to a confirmed participant or delete the run.
4. Confirmed participants can attach screenshots in comments.
5. Organizer can create a map poll (each option is a specific map); confirmed participants vote; when the organizer closes the poll the winning map becomes the run’s map. This is separate from listing multiple maps to play in one session.
6. Footer Changelog links to `/changelog` (release notes).

**Clan / team-competition session**

7. A verified member creates a clan and invites friends; guests can browse the clan directory and clan details (name, tag, picture, members, clan points).
8. Clan owner or officer creates a clan run and invites clan members.
9. Owner or officer marks the clan run completed and can put `/teamrank` + finish-line screenshots in comments.
10. Admin checks in-game `/teamrank` that declared participants finished, marks verified-finish; only then clan points (from map points) are added and clans rank by those points.

### Secondary

No demotion — everything in both sessions is must-have. The hoped-for outcome is that people actively use the app to organize runs and that clans drive community via team competition. That outcome is not a substitute for Primary; Primary is both sessions working.

### Guardrails

- Nothing already shipped (F-01, S-01…S-17) may break: create/list/filter, apply/approve, auto-join, comments ACL (confirmed / unseated organizer / admin), friends, friends-only / invite-only visibility, profiles, admin moderation.
- Clan features must not leak restricted runs. Screenshots must not widen who can post or read comments.
- Unextended runs leave the active list 1 hour after start (derived archive). Organizer/admin can archive earlier via a button; organizer extend ≤ 6h keeps a live session past that hour. The 5-cap still applies.

## User Stories

### US-01: Organizer runs a session

- **Given** a registered organizer creating a run, and confirmed players on the roster
- **When** they set multiple maps or a map poll, optional team-size under Advanced settings, capacity (default 64, max 64), and a start time not in the past and at most 1 year ahead (and they are under the 5 active-run cap); confirmed players vote and the organizer closes the poll so the winning map locks; the run stays in-progress for 1 hour after start, or until they or an admin archive via a button, or until an extension of at most 6 hours elapses; confirmed participants attach screenshots in comments; the owner may pass ownership or delete the run
- **Then** the team can organize and play that session in-app; a forgotten run does not stay on the public list forever; apply/approve, auto-join (except team-size bands), comment ACL, friends, and restricted-run visibility still work as today
- **Before:** one map (or category), 1-hour grace then auto-archive, no poll, no owner delete, no screenshots, no 5-run cap, no 64/year limits

#### Acceptance Criteria
- Map poll and multi-map remain separate tools; poll votes are confirmed-participants only; closing the poll sets the run map to the winner
- Unextended runs leave the active list 1 hour after start; organizer/admin archive button ends in-progress earlier; extend is optional and cannot be longer than 6 hours
- Archiving frees an active-run slot; owner delete is allowed (admin delete already existed)
- Create form: production join mode remains the default control; team-size and other new options live under Advanced settings

### US-02: Clan scores points after verified finish

- **Given** a verified member who created a clan, friends to invite, and an admin
- **When** the clan owner or officer creates a clan run, invites clan members, marks it completed, and posts `/teamrank` plus finish-line screenshots in comments, and the admin checks in-game `/teamrank` then marks verified-finish
- **Then** clan points from the map(s) are added only after verified-finish, guests see clan directory/details and ranking by clan points, and restricted runs still do not leak
- **Before:** clans were parked (v2+); no clan points, no clan runs, no verified-finish

#### Acceptance Criteria
- Guests can view clans and ranking; clan owner/officer are positions inside the clan, not global roles
- Points do not increase on complete alone — only on admin verified-finish
- `/teamrank` and finish-line proof uses the same screenshot comments as FR-001 (no separate screenshot type)
- Clan features must not leak friends-only / invite-only runs

## Scope of Change

### Comments

- [new] FR-001: Confirmed participant can attach screenshots in comments on a run they were accepted to. Priority: must-have.
  > Socrates: Counter-argument considered: screenshots invite abuse (size, NSFW, off-topic) and will swamp comment threads. Resolution: kept; they exist for `/teamrank` and finish-line proof; abuse accepted for this change.

### Run lifecycle

- [new] FR-002: Organizer or admin can archive a run via a button. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [modified] FR-003: A run auto-archives 1 hour after `starts_at` unless the organizer or admin archives earlier, or the organizer extends (then the run leaves when that deadline elapses). S-24 had dropped the fixed window and left forgotten runs on the public list indefinitely; production restored the 1-hour default. Priority: must-have.
  > Socrates: Counter-argument considered: a 4h default is still too short so extend is the real rule. Resolution: keep the original 1-hour default as the safety net; extend remains the way to keep a live session.
- [new] FR-004: Organizer can apply a timed extension to an in-progress run; that extension cannot be longer than 6 hours. Priority: must-have.
  > Socrates: Counter-argument considered: unlimited extend means runs never leave the active list. Resolution: kept organizer extend; an extension cannot be longer than 6 hours.

### Run composition

- [new] FR-005: Organizer can set a team-size scope so a minimum number of players auto-join and remaining slots up to max require approval. New run options including this one live under Advanced settings; the default join control on create stays as in production (approval vs auto-join). Priority: must-have.
  > Socrates: Counter-argument considered: two join modes plus a min/max band clutters the create form. Resolution: kept; production join option stays the default control; extra/new features go in Advanced settings.
- [modified] FR-006: Organizer can set capacity; default is 64 and the maximum is 64. Was: unlimited as default (dropped). Now: default 64 and max 64. Priority: must-have.
  > Socrates: Counter-argument considered: unlimited as default makes “filled” meaningless. Resolution: dropped unlimited; default capacity is 64 and max is 64.
- [new] FR-007: Organizer cannot schedule a run in the past or more than 1 year ahead. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-008: Organizer can have at most 5 active (non-archived) runs; archiving a run frees a slot. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-009: Organizer can attach multiple maps to one run for a single session. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-010: Organizer can create a map poll on a run where each option is a specific map; confirmed participants can vote; when the organizer closes the poll, the winning map becomes the run’s map. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.

### Ownership

- [new] FR-011: Run owner can pass ownership to a confirmed participant. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [modified] FR-012: Run owner can delete the run. Was: only admin can delete. Now: run owner can delete. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.

### Changelog

- [new] FR-013: Guest can open `/changelog` from a footer Changelog link and read release notes. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.

### Clans

- [new] FR-014: Verified member can create a clan. Priority: must-have.
  > Socrates: Counter-argument considered: anyone can create a clan → empty/joke clans flood the directory. Resolution: only verified accounts can create clans.
- [new] FR-015: Clan owner can invite friends to join the clan. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-016: Guest can view all existing clans. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-017: Guest can view clan details (name, tag, profile picture, members, clan points). Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-018: Guest can see clans ranked by clan points. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-019: Clan points are collected according to map points via completing a clan run that is verified-finish. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-020: Clan owner or officer can create a clan run and invite clan members to participate. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-021: Clan owner or officer can mark a clan run as completed. Priority: must-have.
  > Socrates: Counter-argument considered: self-serve completed will dump unfinished runs on the admin verify queue. Resolution: kept; junk in the queue is accepted — verify is the filter.
- [new] FR-022: Admin can mark a completed clan run as verified-finish after checking in-game `/teamrank` that declared participants finished. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [new] FR-023: Clan points are added only after the run is marked verified-finish. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.

### Preserved (must survive)

- [preserved] FR-024: Guest can browse and filter the public active-runs list. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [preserved] FR-025: Member can apply to a run; organizer can accept or deny in approval mode. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [preserved] FR-026: Member can auto-join when the run allows auto-join and capacity remains, except where team-size scope puts remaining slots on approval. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [preserved] FR-027: Comment posting and reading stay within the existing ACL (confirmed participants, admins, unseated organizers); screenshots do not widen who can post or read. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [preserved] FR-028: Verified members can use friends; friends-only and invite-only runs stay hidden from everyone else. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [preserved] FR-029: Member can manage their own profile; guest or member can open a public player profile. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.
- [preserved] FR-030: Admin can ban users and mark users as verified. Priority: must-have.
  > Socrates: No counter-argument; it stands as written.

## Constraints & Compatibility

- Keep existing run and player URLs working. Restricted runs stay 404, not 403. Comment ACL stays confirmed / unseated organizer / admin. Guest public active list stays.
- Existing runs keep working (no “break the old roster to add clans”).
- No live TeeWorlds client sync — admin still checks `/teamrank` in-game by hand (same pattern as points-verified on profiles).
- Backward compatible for guests/members/admins as they already sign in; clan owner/officer are not new global roles.
- User-perceived run creation completes in under 1 minute; applying to join a run completes in under 30 seconds (existing guardrails).
- Adding screenshots on comments and opening clan directory/detail must not cause those timings to fail.

## Business Logic Changes

The system currently counts a player toward a run’s team when the organizer has accepted their application, or immediately on auto-join if a slot remains.

This change modifies that rule: the same roster decision still applies, plus optional team-size scope (auto-join only fills the min band; remaining slots up to max need approval). A run leaves the active list 1 hour after start, or when archived via button, or when a timed extension of at most 6 hours elapses. If the organizer closes a map poll, the winning option becomes that run’s map (separate from listing several maps for one session).

Clan points (from map points) are added only after an admin marks a completed clan run as verified-finish; clans are ranked by those points.

Inputs the user supplies: join mode and optional team-size bands, poll options and votes, archive/extend actions, clan run complete, admin verified-finish, map points on the finished maps. Outputs: confirmed roster, which map is locked on the run, whether the run is still on the active list, and clan points/ranking only after verified-finish. Users hit this on create/join, run detail (poll, archive, comments with screenshots), and public clan directory/ranking.

## Access Control Changes

No changes planned to how people sign in — current model preserved: email + password; guest / member (unverified vs admin-verified) / admin.

**Preserved:**
- Guest: browse/search public runs, public player profiles.
- Member: create/join runs, comments on runs they are confirmed on, own profile; verified members get friends and friends-only / invite-only runs.
- Admin: delete runs, ban, verify users, see restricted runs, edit profiles, labels.

**Planned additions (not a new global role enum):**
- Clan owner and clan officer are positions *inside a clan*. They do not become a site-wide role like admin.
- Any **verified** member can create a clan. Owner/officers invite friends, create clan runs, invite clan members, and mark a clan run completed.
- Guests can view the clan directory and clan details (name, tag, picture, members, clan points).
- Organizer and admin can archive a run via a button. Run owner can delete a run (today only admin can). Owner can pass ownership to a confirmed participant.
- Admin marks a completed clan run as verified-finish (after in-game `/teamrank` check); clan points are added only then.

## Non-Goals

- **Avoid: TeeWorlds client hooks or scraping `/teamrank`** — the app stays outside the game; an admin still checks `/teamrank` in-game by hand. Rationale: live client integration was already out of scope; clan verify must not sneak it back in.
- **No new externally advertised SLA in this change.** Rationale: existing timing guardrails stay; this change does not add a new operator-facing availability promise.

## Open Questions

None captured. Quality cross-check status: accepted (no gaps at handoff).
