---
project: "Book Your Miggets"
version: 2
status: draft
created: 2026-07-16
updated: 2026-08-31
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

The King of Gores (KoG) community in TeeWorlds is relatively small, and the game client offers no tools for organizing shared runs. Finding the right players, agreeing on a time, and filling a team for harder maps happens mainly through in-game chat, server-hopping, external community chat, and private messages — which is inconvenient, time-consuming, and often fails.

As a player, the goal is to start playing soon after joining a session, not waste the first ~30 minutes hunting for players. There is no built-in team finder or run scheduler; assembling a team or enough players at a similar skill level takes a long time and requires significant effort.

**Insight:** The niche is real and the pain is acute, but nobody in the community has shipped a dedicated tool yet — the status quo (external community chat + in-game coordination) persists by default, not by choice.

## User & Persona

**Primary persona: Run organizer** — an experienced KoG player who wants to schedule a run on a specific map, set requirements (e.g., minimum points threshold), and fill the team ahead of time so everyone can show up and play.

Secondary pain (not primary persona for v1): players looking to join runs also lose time in the current ad-hoc coordination flow, but the MVP is shaped around the organizer creating and filling runs.

## Success Criteria

### Primary

End-to-end MVP flow:

1. Organizer registers / logs in (email + password).
2. Organizer creates a run: selects map, sets date/time, max participants, minimum points threshold, and join mode (approval-required or auto-join).
3. Run appears on the public active-runs list.
4. Another player (guest) browses and filters runs, finds the run, registers, and applies to join.
5. **Approval mode:** organizer accepts or denies each applicant. **Auto-join mode:** player is confirmed immediately if capacity allows.
6. Confirmed players appear on the participant list; team fills before game time.
7. After the run ends (1-hour in-progress grace, then archive), confirmed participants can revisit it in their archived runs.

### Secondary

Organizer can view and manage all runs they created in one place (my-runs dashboard).

### Post-MVP (v1.1)

MVP (v1) is shipped. The next increment adds identity, trust, and private-run visibility around the same core loop:

1. A member manages their own profile (nickname until verified, email, password, self-reported KoG points). The top bar shows nickname. Every nickname in the app links to that player's public profile.
2. After admin verification (`is_verified`), the member cannot change nickname themselves — they request a change; admin edits profiles (including nickname and points) from the existing admin player page, and can mark points as checked in-game.
3. Verified members add each other as friends from the profile (list + requests live there).
4. An organizer can post a friends-only run or an invite-only run (picked friends). Those runs are hidden from everyone else, including guests.
5. A confirmed participant posts comments on a run they were accepted to.
6. An organizer edits an active run they created, or creates a category-only run (no specific map).
7. Admin maintains a label dictionary (name + color) and assigns labels that show on the public profile.

### Guardrails

- Run creation completes in under 1 minute; applying to a run takes under 30 seconds.
- Past runs do not clutter the active list — the organizer or an admin archives a run (optional organizer extend of at most 6 hours, then derived exit); archived, not deleted. An organizer may have at most 5 audience-active runs.

## User Stories

### US-01: Organizer fills a run with approved players

- **Given** a registered organizer and an active KoG community player looking for a run,
- **When** the organizer creates a run with map, time, capacity, minimum points threshold, and approval-required join mode, and a player applies to join,
- **Then** the organizer can accept or deny the applicant, confirmed players appear on the participant list, and the run remains on the active list until the organizer or an admin archives it (or an optional organizer extend of at most 6 hours elapses). Confirmed participants can reopen the archive. An organizer may have at most 5 audience-active runs.

### US-02: Player auto-joins a run

- **Given** a registered organizer who created a run with auto-join mode and a player looking to join,
- **When** the player applies and capacity is available,
- **Then** the player is immediately confirmed on the participant list without organizer action.

### US-03: Player manages their profile

- **Given** a registered member,
- **When** they open their own profile,
- **Then** they can set nickname (only if not admin-verified), change email and password, and set their current self-reported KoG points; if verified, they can only request a nickname change; the top bar shows nickname instead of email; every nickname elsewhere in the app links to that player's public profile.

### US-04: Player adds verified friends

- **Given** two admin-verified members looking at a public profile,
- **When** one sends a friend request from that profile and the other accepts or declines,
- **Then** accepted pairs appear on each other's friends list on the profile, unverified members cannot be added, and a declined or pending request is not a friendship.

### US-05: Confirmed participant comments on a run

- **Given** a member who is a confirmed participant on a run,
- **When** they post a comment on that run,
- **Then** the comment appears on the run for readers who can view that run, and members who were not accepted cannot post.

### US-06: Organizer edits an active run

- **Given** an organizer who created a run that is still active (upcoming or in-progress grace),
- **When** they change allowed fields on that run,
- **Then** the public list and detail views show the updated values, and edits are rejected once the run is archived.

### US-07: Organizer posts a category-only run

- **Given** an organizer creating a run who does not want to lock a specific map yet,
- **When** they set a map category (difficulty) and leave the map unset,
- **Then** the active-runs list and run detail show that category on the card, without a map name.

### US-08: Organizer posts a friends-only run

- **Given** a verified organizer with at least one friend,
- **When** they create a run with friends-only visibility,
- **Then** only the organizer, those friends, and admins can see it; it appears in a distinct section (or otherwise highlighted) on the friends' active list, not on the public guest list.

### US-09: Organizer posts an invite-only run

- **Given** a verified organizer picking specific friends,
- **When** they create a run with invite-only visibility and select those friends,
- **Then** only the organizer, the invited friends, and admins can see or apply to that run.

### US-10: Admin edits a player profile

- **Given** an admin on the existing player page and a member who is verified or has a pending nickname-change request,
- **When** the admin edits nickname or KoG points, marks points as verified in-game, or accepts/denies a nickname-change request,
- **Then** the public profile reflects the change and the member cannot overwrite a verified nickname themselves.

### US-11: Admin labels players

- **Given** an admin with a label dictionary,
- **When** they create a label (name + color) and assign it to a player,
- **Then** that label is visible to everyone on the player's public profile.

## Functional Requirements

### Authentication

- FR-001: User can register with email and password. Priority: must-have
  > Socrates: No counter-argument; registration stands as written for multi-user scheduling.
- FR-002: User can log in with email and password. Priority: must-have
  > Socrates: No counter-argument; persistent identity required for create/apply/accept-deny flows.

### Run creation & management

- FR-003: Organizer can create a run by selecting a map (from list or search), date/time, max participants, minimum points threshold, and join mode (approval-required or auto-join). Priority: must-have
  > Socrates: No counter-argument; structured run posts with map and requirements are core value.
- FR-004: When join mode is approval-required, organizer can accept or deny players who applied to join their run. Priority: must-have
  > Socrates: Counter-argument considered: open auto-join fills teams faster. Resolution: kept
  > accept/deny for skill gating; auto-join added as organizer-selectable mode (FR-014) to scale
  > team formation without removing approval when needed.
- FR-014: When join mode is auto-join, member is confirmed on the participant list immediately upon applying, subject to remaining capacity. Priority: must-have
  > Socrates: Resolved via open question — auto-join addresses approval bottleneck at scale.
- FR-005: Organizer can view all runs they created in one place (my-runs dashboard). Priority: nice-to-have
  > Socrates: No counter-argument; already scoped as nice-to-have.

### Run discovery

- FR-006: Guest can browse the list of active runs without logging in. Priority: must-have
  > Socrates: No counter-argument; guest browse lowers friction for discovery.
- FR-007: User can search and filter runs (e.g., by map, date, or requirements). Priority: must-have
  > Socrates: No counter-argument; finding the right map/run is the core pain being solved.

### Participation

- FR-008: Member can apply to join an existing run. Priority: must-have
  > Socrates: No counter-argument; apply-to-join is the core participation action.
- FR-009: User can view the list of accepted participants for each run. Priority: must-have
  > Socrates: No counter-argument; transparency helps players decide whether to apply.

### Administration

- FR-010: Admin can delete runs. Priority: must-have
  > Socrates: No counter-argument; admin override needed for abusive or inappropriate content.
- FR-011: Admin can ban users. Priority: must-have
  > Socrates: No counter-argument; safety valve needed even in a small community.
- FR-012: Admin can mark a user as verified (`is_verified` flag). Priority: must-have
  > Socrates: No counter-argument; minimal trust signal for v1 until third-party community verification ships.

### System behavior

- FR-013: System keeps runs visible for 1 hour after scheduled start time, then moves them to an archive (retained indefinitely in MVP, not deleted). During the 1-hour grace period, runs are marked as "in-progress" or "already started". Priority: must-have
  > Socrates: Counter-argument considered: grace period may clutter active list. Resolution: kept
  > 1-hour grace for late stragglers; runs show in-progress/started status during grace; then archive.
- FR-015: Confirmed participant can view archived runs they took part in (via app-confirmed participation). Priority: must-have
  > Socrates: Resolved via open question — participant archive history is part of MVP.
- FR-016: Admin can view a specific player's archived run history from that player's profile. Priority: must-have
  > Socrates: Resolved via open question — admin archive access is profile-scoped.

### Identity & social (post-MVP)

- FR-017: Member can open their own profile to change email and password, set self-reported KoG points, and — if not admin-verified — set or change nickname; signed-in chrome shows nickname instead of email. Priority: must-have
  > Socrates: Nickname already exists for apply/create; email/password and points belong on the same own-profile surface.
- FR-018: Guest or member can open a player's public profile from any nickname shown in the app (roster, organizer, friends, comments). Public profile shows nickname, verification, KoG points (and whether admin-verified), and assigned labels — never email. Priority: must-have
  > Socrates: Admin already has a player page (FR-016); public identity is the member-facing counterpart.
- FR-019: Verified member can send, accept, and decline friend requests to other verified members, and view their friends list, from the profile. Unverified members cannot be added as friends. Priority: must-have
  > Socrates: Friends are a trust graph; gating on `is_verified` keeps unverified accounts out of private runs later.
- FR-020: Confirmed participant can post comments on a run they were accepted to. Priority: must-have
  > Socrates: PRD v1 parked comments on the Discord bot. In-app comments on the run itself are the post-MVP substitute; Discord sync stays deferred.
- FR-023: After admin verification, the member cannot change their own nickname; they can submit a nickname-change request for admin. Priority: must-have
  > Socrates: Verification is a public trust signal; a self-serve rename after verify would let someone spoof a known nick.
- FR-024: Admin can edit a member's profile (including nickname and KoG points) from the existing admin player page, fulfill or deny nickname-change requests, and mark points as verified after an in-game check. Priority: must-have
  > Socrates: Same page as FR-016; do not invent a second admin profile surface.

### Run composition (post-MVP)

- FR-021: Organizer can edit an active run they created. Priority: must-have
  > Socrates: FR-005 is view-all, not edit. Edit is a new capability with constraints (capacity vs roster, archived lock) resolved at planning.
- FR-022: Organizer can create a run with a map category and no specific map; the category is shown on the run card. Priority: must-have
  > Socrates: Map is already optional; without a stored category, map-less cards have nothing to show. Category uses the catalog difficulty values, not a new taxonomy.
- FR-027: Organizer can create a friends-only run. Only the organizer, the organizer's friends, and admins can see it; friends see it highlighted or in a separate section, never on the public guest list. Priority: must-have
  > Socrates: Visibility is orthogonal to join mode (approval vs auto-join). Private by friendship, not by secrecy of the URL alone.
- FR-028: Organizer can create an invite-only run by picking friends from their friends list. Only the organizer, those invitees, and admins can see or apply. Priority: must-have
  > Socrates: Stricter than friends-only; same visibility machinery, different audience set.

### Admin labels (post-MVP)

- FR-029: Admin can create and maintain a dictionary of player labels, each with a name and a color. Priority: must-have
  > Socrates: A small dictionary avoids one-off free text on every profile.
- FR-030: Admin can assign those labels to players; assigned labels are visible to everyone on the player's public profile. Priority: must-have
  > Socrates: Labels are a public trust/role signal, not a private admin note.

## Non-Functional Requirements

- User-perceived run creation completes in under 1 minute; applying to join a run completes in under 30 seconds.

## Business Logic

A player counts toward a run's team when the organizer has accepted their application (approval-required mode), or immediately upon applying if the organizer enabled auto-join for that run and capacity remains.

The organizer defines run requirements as inputs: map selection (or category without a map), scheduled date/time, maximum participant count, minimum points threshold, join mode, and visibility (public, friends-only, or invite-only). Players submit join applications against those requirements. In approval-required mode, the rule evaluates each application when the organizer accepts or denies. In auto-join mode, the rule confirms the player on apply if slots remain. Output in both cases: the run's confirmed participant roster up to stated capacity.

Users encounter this rule on the run detail view: in approval mode, applicants appear pending until acted on; in auto-join mode, applicants become confirmed immediately. Only confirmed players appear on the public participant list and count toward filled slots.

Archived runs remain accessible to any user who was a confirmed participant on that run. Admins can view any player's full archived run history from that player's profile.

A member's public identity is their nickname, verification badge, self-reported KoG points (with whether an admin has verified those points in-game), and any admin-assigned labels — never their email. The signed-in top bar shows nickname. Every nickname shown in the app (roster, organizer, friends, comments) links to that public profile.

Until an admin marks the member verified (`is_verified`), the member may change their own nickname. After verification, nickname is locked: the member may only submit a change request; an admin applies or denies it from the existing admin player page. Admins may edit nickname and KoG points on that page at any time, and may mark points as verified after checking in-game (this is not live stat sync from the game client).

Friendship is mutual after accept, and only between verified members. Requests are sent and the friends list is viewed from the profile. Pending and declined requests are not friends. Unverified members have public profiles but no Add-friend control.

Run visibility is orthogonal to join mode. Default remains public (guest-visible). A friends-only run is visible to the organizer, the organizer's current friends, and admins — friends see it in a distinct section of the active list (or otherwise highlighted), never on the guest list. An invite-only run is visible to the organizer, the invited friends, and admins. Join mode (approval vs auto-join) still applies among people who can see the run.

Only confirmed participants may post comments on a given run. Who can *read* those comments follows the same visibility as the run itself (public on an active public run; restricted-run readers only), unless planning narrows that (see Open Questions).

An organizer may edit an active run they created. Archived runs are immutable except by admin delete. Capacity must not drop below the current confirmed roster; remaining field constraints are a planning decision.

A run's map may stay unset. In that case the organizer may set a map category (a difficulty value from the map catalog). The active-runs card and detail view show that category so guests can still tell the intended difficulty.

Admin-defined labels (name + color) are a dictionary. Assigned labels are public on the profile; they are not free-text tags typed by the player.

## Access Control

**MVP (v1, shipped):**
- **Guest (unauthenticated):** can browse and search/filter the list of active runs and view participant lists.
- **Member (registered, email + password):** can create runs, sign up for existing runs, and view archived runs they participated in as a confirmed player.
- **Admin:** can delete runs, ban users, manually mark users as verified (`is_verified` flag), and view any player's archived run history from that player's profile.

**Post-MVP (v1.1):**
- **Guest:** can open a player's public profile from any nickname; can read comments on **public** active runs they can already view. Cannot see friends-only or invite-only runs.
- **Member (unverified):** can edit own nickname, email, password, and self-reported points; can view public profiles. Cannot add friends or create friends-only / invite-only runs.
- **Member (verified):** in addition, can send/accept/decline friend requests and view the friends list on profiles; can create friends-only and invite-only runs; can see friends-only runs from people they are friends with, and invite-only runs they were invited to. Nickname is locked (change request only). Can still comment on runs where they are a confirmed participant; can edit active runs they organized; can create a category-only run.
- **Admin:** can see all runs including restricted ones; can edit any member's profile (nickname, points, points-verified) and nickname-change requests from the existing admin player page; can maintain the label dictionary and assign labels to players.

**Deferred to v2+:**
- Discord OAuth login and integration with the main KoG Discord server for faster/automatic player verification.
- **Discord bot** that creates a Discord event or forum post for each run on the app. Where supported, one shared bot serves multiple Discord servers; events and posts stay in sync with the app as players sign up or comment.
- **Announcement channel** (optional add-on): the bot posts reminders about upcoming runs/events so members do not miss scheduled sessions.
- **Clan Leaders** and official **KoG administrators/moderators** as distinct roles.
- Friend activity feeds, and comments from non-participants.

## Non-Goals

- **Avoid: TeeWorlds client integration** — MVP operates outside the game; no in-client hooks or overlays.
- **Avoid: automatic player stats from the game** — no live stat sync from the TeeWorlds client. Members may self-report KoG points on their profile; an admin may check in-game and mark or edit that number (FR-017, FR-024). Run minimum-points thresholds stay organizer-set.
- **Avoid: mobile apps** — web-only for v1; responsive layout may suffice for phone browsers but no native apps.
- **Avoid: archive deletion or archival retention tiering** — archived runs are retained indefinitely in MVP; retention policy can be revisited if popularity drives storage pressure.

## Open Questions

1. **After players have applied or been confirmed, which run fields may the organizer still change?** — Owner: user. Affects FR-021. Candidate default: title, start time, map/category, min points, capacity (not below confirmed roster), and invite list / visibility; lock join mode after the first confirmation.
2. **Are run comments readable by anyone who can view the run, or only by confirmed participants?** — Owner: user. Affects FR-020. Candidate default: same visibility as the run page (guests read comments on public active runs).
3. **Friends-only list presentation — separate section vs highlight in the same list?** — Owner: user. Affects FR-027. Candidate default: a distinct "Friends" (and "Invited") section on `/runs` for the signed-in viewer, so restricted runs never mix into the public stack.
4. **If two friends unfriend after an invite-only run was created, does the invitee keep access?** — Owner: user. Affects FR-028. Candidate default: invite is a snapshot of selected friends at create/edit time, not a live friendship check.
