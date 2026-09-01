# Mark a clan run completed — Plan Brief

> Full plan: `context/changes/complete-clan-run/plan.md`

## What & Why

Clan owners need to mark a clan-only session completed so S-23 can later verify it. Complete must not award clan points (FR-021 / US-02) and must not reuse Archive — comments still need `/teamrank` and finish-line screenshots.

## Starting Point

S-21 shipped `clan_only` on the existing run (owner-only create, live `is_same_clan`, no `runs.clan_id`, no officers). S-24 shipped `archive_run` / `extend_run` and audience-active (`archived_at` / `extended_until`). There is no `completed_at`. Comment writes stop after archive. `clans.points` is frozen.

## Desired End State

The clan owner Completes an in-progress clan-only run. A **Completed** chip appears for anyone who can already view an audience-active completed run. After Archive, Past, Recent, and archived `/runs/{id}` stay **Archived**. The run stays on the active list (5-cap still occupied) until Archive. Roster/edit/extend freeze; comments stay writable. Points stay 0. No admin queue.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| PRD source | `prd-v2.md` FR-021 | v1 `prd.md` FR-021 is a different organizer-edit requirement | Crew |
| Actor | Clan owner (organizer + `userOwnsClan` + `clan_only`) | Officers do not exist; `userOwnsClan` alone would let another clan owner stamp | Crew / Plan |
| Stamp vs archive | Distinct `completed_at`; never call `archive_run` | Comment writes must survive Complete (US-02) | Plan |
| Eligibility | In-progress only | Upcoming Complete is extra junk; Archive-then-Complete is out | Plan |
| After complete | Freeze join/leave/decide/kick/edit/extend; Archive allowed | Stable roster/map for S-23; 5-cap still needs Archive | Plan |
| Admin UI | Stamp only | S-23 owns the verify queue and points | Plan |
| Visibility | Completed chip on audience-active detail + Clan/dashboard cards; Archived wins after Archive | Members can tell to post proof; Past/Recent/archived detail stay Archived; guests still 404 | Plan |
| Complete UX | Archive-style confirm; not archive, not points | One-shot stamp; do not lecture 5-cap on redirect | Plan |
| Phases | SQL → API → UI/docs | Same split as S-24 | Plan |

## Scope

**In scope:** `completed_at` + DEFINER `complete_clan_run` (GRANT closed); roster/edit/extend freeze; `POST /api/runs/{id}/complete`; owner Complete control; Completed chip; AGENTS.md.

**Out of scope:** S-23 verified-finish and points; officers; `runs.clan_id`; admin queue; un-complete; changing comment ACL; Vitest; clan pages listing runs.

## Architecture / Approach

New nullable `completed_at`. Audience-active **unchanged** (lists, 5-cap, `is_run_in_active_window`). New roster-open predicate = audience-active ∧ `completed_at` null, used only on apply/auto-join/leave/decide/kick/edit/extend. `complete_clan_run` DEFINER-stamps; does not `UPDATE` `clans`. App maps the RPC like `archiveRun`. UI lives on `/runs/{id}` next to Archive.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. SQL stamp + freeze | Column, RPC, GRANT closed, roster-open policies | Putting `completed_at` on `is_run_active_row` (kills comments / 5-cap) |
| 2. HTTP + services | `POST /api/runs/{id}/complete`, DTO, app freeze | Raw PostgREST in `?error=`; freezing comment writes |
| 3. UI + AGENTS.md | Complete button, Completed chip, docs | Complete looking like Archive; inventing officer/admin queue |

**Prerequisites:** Local Supabase + app; S-21 and S-24 on the branch; a clan owner with an in-progress clan-only run.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Completed runs occupy the 5-cap until Archive (accepted; confirm copy says Complete is not Archive).
- “Verify queue” is `completed_at IS NOT NULL` until S-23; junk is accepted.
- Admin `run_participants` UPDATE policy stays unbounded (no admin decide UI).
- Worker `Date` vs Postgres `now()` on in-progress (same S-24 skew).

## Success Criteria (Summary)

- Clan owner Completes an in-progress clan-only run; viewers see Completed while the run is still audience-active; comments still post; points unchanged.
- Roster/edit/extend fail; Archive still leaves the list and frees a slot.
- Guests/non-members still 404; no officer or admin-verify UI.
