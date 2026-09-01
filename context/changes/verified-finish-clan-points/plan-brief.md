# Admin verified-finish and clan points — Plan Brief

> Full plan: `context/changes/verified-finish-clan-points/plan.md`
> Research: `context/changes/verified-finish-clan-points/research.md`

## What & Why

Admin marks a completed clan-only run as verified-finish after checking in-game `/teamrank` that declared participants finished. Only then are clan points (from `maps.points`) added and public ranking updates. Complete must not award; scraping `/teamrank` stays parked.

## Starting Point

S-22 already stamps `completed_at` (roster frozen, comments open until Archive, points untouched). `/clans` already sorts by `points`, but every clan is 0: GRANT and trigger `clans_freeze_points_and_owner` no-op any points UPDATE. Admin already reads the S-20 screenshot thread on `/runs/{id}`. There is no `verified_at` and no award RPC.

## Desired End State

An admin control on `/runs/{id}` (including archived) stamps verified-finish once, adds the map’s points to the organizer’s clan, and shows a Verified-finish chip to anyone who can open the run. Ranking moves with no list-query change. Category-only runs cannot be verified. Mistakes cannot be undone this slice.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Points writer | DEFINER RPC only; no GRANT on `clans.points` | Freeze trigger is the real lock; PostgREST must stay unable to write points | Research |
| Award target | Clan `owner_id = runs.organizer_id` | No `runs.clan_id`; owner_id is frozen | Research |
| Delta | `maps.points` for single `map_id` | S-27 unshipped; category-only has no catalog row | Research |
| Queue | Detail-only on `/runs/{id}` | Invocation / S-22 deferred queue; junk-in-queue accepted | Research / Plan |
| Verify vs Archive | Allowed whenever `completed_at` is set | FR-022 requires completed, not audience-active; Archive already frees the 5-cap | Plan |
| Null `map_id` | Reject `no_map` (no stamp, no award) | FR-019 awards map points; fake 0-success looks like a writer bug | Plan |
| Screenshot gate | None in SQL | In-game `/teamrank` is the source of truth | Plan |
| Un-verify | No undo; `already_verified` does not add again | Same one-shot as Complete; no subtract writer | Plan |
| Empty roster | Allow (admin judgment) | Complete does not require seats; organizer often unseated and roster is frozen | Plan |
| Run chip | Verified-finish on `/runs/{id}`, including archived | Viewers who can open the run should see why ranking moved | Plan |
| Trigger bypass | Transaction-local GUC `app.clan_points_award` | Copy `app.clan_delete_teardown`; GRANT stays closed | Plan |

## Scope

**In scope:** `verified_at`; GUC on freeze trigger; `verify_clan_run_finish`; `POST /api/admin/runs/{id}/verify-finish`; AdminRunControls button; detail chip; AGENTS.md.

**Out of scope:** scrape; Complete-awards; queue; officers; `runs.clan_id`; un-verify; screenshot SQL gate; multi-map sum; list-card chips; Vitest.

## Architecture / Approach

Admin POST → cookie session + role check (copy admin archive) → DEFINER `verify_clan_run_finish` (admin-only, `not_found` for everyone else). One transaction: stamp `verified_at` where still null, set GUC, `UPDATE clans.points += maps.points`. Complete, comments, 5-cap, and audience-active predicates stay untouched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. SQL contract | Stamp + GUC + DEFINER award; GRANT closed | Trigger bypass too wide, or award-before-stamp double-count |
| 2. App API | DTO + RPC wrapper + admin HTTP | Raw PostgREST in `?error=`; non-admin leak vs 403 |
| 3. Admin UI + chip + docs | Button, Verified-finish chip, AGENTS.md | Chip hidden after Archive (must stay visible) |

**Prerequisites:** S-22 and S-20 shipped; local Supabase; an admin profile.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Mistaken verify over-awards until a later admin tool (no subtract).
- Empty-roster junk can still be awarded if admin clicks.
- Deleted clan → `no_clan` fail-closed; category-only completed runs can never score this slice.
- `maps.points = 0` is a real delta (stamp + add 0), distinct from `no_map`.

## Success Criteria (Summary)

- Admin verifies a completed clan-only mapped run → chip + clan points + ranking move; retry does not add again.
- Complete alone never changes `clans.points`; comments still write until Archive.
- Guests still 404 on clan_only; non-admins cannot verify; map-less cannot stamp.
