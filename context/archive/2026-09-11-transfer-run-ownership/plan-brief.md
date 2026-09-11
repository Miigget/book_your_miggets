# Pass run ownership (S-29) — Plan Brief

> Full plan: `context/changes/transfer-run-ownership/plan.md`

## What & Why

FR-011 / US-01: the run owner can pass ownership to a confirmed participant. The new owner inherits archive/edit/delete because those keys off `runs.organizer_id`. Pending applicants are not eligible. Clan-only is refused this slice so Complete/verify/edit stay honest (they still require the organizer to be the clan owner).

## Starting Point

Organizers already have Archive / Complete / Extend / Delete on run detail (`OrganizerRunLifecycleControls`). `organizer_id` is not in authenticated GRANT UPDATE. `runs_update_own` cannot swap the column and would freeze a table UPDATE after Complete. The 5-cap trigger fires on INSERT only. Confirmed roster is already loaded on `/runs/{id}`.

## Desired End State

On an audience-active public / friends / invite run, the organizer picks another confirmed player, confirms, and ownership moves. They stay on the page; chrome follows the new `organizer_id`. Clan-only has no Transfer. A recipient at 5 audience-active runs is blocked.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Who is owner | `runs.organizer_id` only | Not clan owner, not officers | Crew |
| Target | Confirmed participant, not pending, not self | Roadmap risk is roster bypass | Crew |
| Route | `POST /api/runs/{id}/transfer` | Organizer mutation; not admin | Crew |
| When | Audience-active (including completed) | Same window as owner-delete; Complete freeze does not include transfer | Crew |
| UI | Same island as Archive/Delete; no Dashboard | One organizer chrome surface | Crew |
| Mechanism | DEFINER `transfer_run_ownership`; no GRANT on `organizer_id` | WITH CHECK cannot swap; roster-open would freeze after Complete | Plan |
| Clan-only | Refuse this slice | Keeps inherit-edit / Complete / verify honest | Plan (q-clan B) |
| 5-cap | Block if recipient already has 5 actives | INSERT trigger would not fire on the swap | Plan (q-cap A) |
| Success URL | Stay on `/runs/{id}` | Detail has no notice Banner; “Organized by” is the proof | Plan |

## Scope

**In scope:** DEFINER RPC; service + POST route; Transfer select on organizer chrome; `AGENTS.md`; recipient 5-cap; verified gate for restricted targets

**Out of scope:** Clan-only transfer; GRANT UPDATE `organizer_id`; participant-row changes; officer/admin transfer; Dashboard; notifications; test runner

## Architecture / Approach

DEFINER RPC (complete/archive shape): caller must be current organizer and not banned; run audience-active and not `clan_only`; target confirmed on this run; lock 8724 on the **new** id and refuse at 5 actives; then `UPDATE organizer_id` only. App maps outcomes to `RunError`. Native `<select>` + confirm in `OrganizerRunLifecycleControls`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Organizer transfer | RPC + API + picker + AGENTS.md | Using `is_run_roster_open_row` would block transfer after Complete; reusing create’s “You already have 5” would blame the wrong person |

**Prerequisites:** Shipped confirmed roster; local Supabase.
**Estimated effort:** One short session, single phase.

## Open Risks & Assumptions

- Friends-only listing follows `are_friends(organizer_id, …)`: after transfer, friends of the old owner who are not friends with the new one drop off the Friends section (confirmed seats remain).
- Unseated old organizer stays unseated; we do not insert a participant row.
- YOLO skips plan-review and per-phase impl-review; SQL smoke must prove GRANT still blocks a raw `organizer_id` UPDATE.
- Manual UI click-through is a human-action gate (YOLO residual if skipped).

## Success Criteria (Summary)

- Organizer can pass an audience-active non-clan run to another confirmed player and immediately lose organizer chrome.
- Pending, self, clan-only, archived, non-owner, and 5-cap recipient all fail closed.
- New owner can archive/edit/delete; Complete freeze still does not block transfer.
