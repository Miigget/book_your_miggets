---
project: "Book Your Miggets"
version: 1
status: draft
created: 2026-07-16
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

### Guardrails

- Run creation completes in under 1 minute; applying to a run takes under 30 seconds.
- Past runs do not clutter the active list — runs move to archive 1 hour after scheduled start time (archived, not deleted).

## User Stories

### US-01: Organizer fills a run with approved players

- **Given** a registered organizer and an active KoG community player looking for a run,
- **When** the organizer creates a run with map, time, capacity, minimum points threshold, and approval-required join mode, and a player applies to join,
- **Then** the organizer can accept or deny the applicant, confirmed players appear on the participant list, and the run remains on the active list until 1 hour after its scheduled start time, after which it moves to an archive visible to confirmed participants.

### US-02: Player auto-joins a run

- **Given** a registered organizer who created a run with auto-join mode and a player looking to join,
- **When** the player applies and capacity is available,
- **Then** the player is immediately confirmed on the participant list without organizer action.

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

## Non-Functional Requirements

- User-perceived run creation completes in under 1 minute; applying to join a run completes in under 30 seconds.

## Business Logic

A player counts toward a run's team when the organizer has accepted their application (approval-required mode), or immediately upon applying if the organizer enabled auto-join for that run and capacity remains.

The organizer defines run requirements as inputs: map selection, scheduled date/time, maximum participant count, minimum points threshold, and join mode. Players submit join applications against those requirements. In approval-required mode, the rule evaluates each application when the organizer accepts or denies. In auto-join mode, the rule confirms the player on apply if slots remain. Output in both cases: the run's confirmed participant roster up to stated capacity.

Users encounter this rule on the run detail view: in approval mode, applicants appear pending until acted on; in auto-join mode, applicants become confirmed immediately. Only confirmed players appear on the public participant list and count toward filled slots.

Archived runs remain accessible to any user who was a confirmed participant on that run. Admins can view any player's full archived run history from that player's profile.

## Access Control

**MVP:**
- **Guest (unauthenticated):** can browse and search/filter the list of active runs and view participant lists.
- **Member (registered, email + password):** can create runs, sign up for existing runs, and view archived runs they participated in as a confirmed player.
- **Admin:** can delete runs, ban users, manually mark users as verified (`is_verified` flag), and view any player's archived run history from that player's profile.

**Deferred to v2+:**
- Discord OAuth login and integration with the main KoG Discord server for faster/automatic player verification.
- **Discord bot** that creates a Discord event or forum post for each run on the app. Where supported, one shared bot serves multiple Discord servers; events and posts stay in sync with the app as players sign up or leave comments on the run.
- **Announcement channel** (optional add-on): the bot posts reminders about upcoming runs/events so members do not miss scheduled sessions.
- **Clan Leaders** and official **KoG administrators/moderators** as distinct roles.

## Non-Goals

- **Avoid: TeeWorlds client integration** — MVP operates outside the game; no in-client hooks or overlays.
- **Avoid: automatic player stats from the game** — minimum points threshold is manually set by organizer; no live stat sync.
- **Avoid: mobile apps** — web-only for v1; responsive layout may suffice for phone browsers but no native apps.
- **Avoid: archive deletion or archival retention tiering** — archived runs are retained indefinitely in MVP; retention policy can be revisited if popularity drives storage pressure.

## Open Questions

No open questions at PRD generation — quality cross-check from `/10x-shape` reported all elements present.
