# Manual archive, extend, and active-run cap — Plan Brief

> Full plan: `context/changes/manual-archive-and-extend/plan.md`
> Research: `context/changes/manual-archive-and-extend/research.md`

## What & Why

Organizers outgrow the shipped 1-hour auto-archive: a session should stay in-progress until they (or an admin) archive it, or until an optional timed extend elapses. Pairing a max of 5 audience-active runs in this slice means dropping auto-archive does not trap organizers with no way to free a slot. Guests still browse the public active list.

## Starting Point

Archive is derived at read (`archived_at` null **and** `starts_at > now() - 1h`) in RLS and app helpers. Nobody can write `archived_at` (S-13 grants). No extend column, no archive button, no 5-cap. Privilege SELECT (organizer / admin / confirmed) is already unbounded; the app splits Incoming vs Past.

## Desired End State

A run stays on the active list until Archive (upcoming or in-progress) or an optional organizer extend (1/2/3/6h from now) elapses. In-progress is not ended by the clock alone. Creating a 6th active run fails until one is archived or an extend expires. Restricted runs still 404 like missing; comment ACL and S-08 organizer-without-seat archive reopen stay.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Cutover of past-grace rows | Backfill `archived_at = starts_at + 1h` | Otherwise every old run reappears on `/runs` and blows the cap | Plan |
| `archived_at` writer | DEFINER `archive_run`; grant stays closed | S-13 closed the column; PostgREST must not SET/clear it | Plan |
| Lifecycle encoding | Unbounded in-progress until stamp; optional `extended_until` | Clock alone must not end a run that was never extended | Plan / FR-003 |
| Mutations after 1h gone | Same audience-active predicate (list, join, edit, invites, comments) | Smallest contract change; one predicate | Plan |
| 5-cap | SQL BEFORE INSERT (`pg_advisory_xact_lock(8724, hashtext(organizer_id))` then count) + `create_invite_only_run` UX pre-check + app `?error=` | PostgREST cannot skip the cap; lock serializes concurrent creates; elapsed extend frees a slot | Plan / FR-008 |
| Extend UX | Confirm + 1/2/3/6h → `POST /api/runs/{id}/extend` | Avoids datetime-local vs Postgres `now()` | Plan |
| Elapsed extend | Derived-only (no cron, no lazy stamp) | `archive_run` remains the only app writer besides cutover | Plan |
| `extended_until` writer | DEFINER `extend_run`; grant stays closed | Same lock as `archived_at`; organizer-only, one-shot | Plan |
| Admin Archive vs Delete | Admin section, distinct copy; organizer header still has Archive + Extend | Non-organizer admins have no Edit header; delete ≠ archive | Plan |
| Archive phase | Upcoming or in-progress; extend in-progress only | 5-cap usable before S-30 owner-delete | Plan |
| Player public RPC | `list_player_public_runs` RETURNS `extended_until`; still no time predicate | Guest Incoming/Recent must see elapsed extend or they 404 the detail link | Plan-review F1 |
| Banned organizer archive | Follow `is_not_banned()`; no middleware exemption for `/api/runs/{id}/archive` | Matches global banned-write gate; admin archive still works | Plan-review F3 |

## Scope

**In scope:** Drop 1h auto-archive; archive button (organizer + admin); optional extend ≤ 6h; max 5 audience-active runs; guest public list; cutover backfill; AGENTS + stale `prd.md` 1h copy.

**Out of scope:** Un-archive; cron/lazy stamp; admin extend; owner delete (S-30); comment ACL widening; 403s; S-25/S-26; Vitest; clan run lists.

## Architecture / Approach

Shared SQL helper `is_run_active_row(archived_at, extended_until)` retargets every live 1h site (copy **clan_only** bodies from `20260831123822`, not S-15 alone). DEFINER RPCs stamp archive / set extend. `list_player_public_runs` RETURNS `extended_until` with no time predicate. Cap trigger takes `pg_advisory_xact_lock(8724, …)` then counts. App `run-lifecycle.ts` + service gates mirror the predicate so organizer/admin unbounded SELECT cannot leak elapsed-extend rows into active UX. Islands on `/runs/{id}` post to cookie-session APIs (`runFail`, no raw PostgREST in `?error=`). Banned POSTs stay gated globally (no archive exemption).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. SQL contract | Column, backfill, RLS, RPCs, 5-cap trigger | Dropping `clan_only` by rewriting from S-15; backfill order |
| 2. App lifecycle | Helpers, lists, mutations, create cap | `mapRunRow` ignoring stamp/extend; privilege SELECT bypass |
| 3. HTTP / UI / docs | Archive + Extend buttons, `/runs/new` cap, AGENTS/prd.md | Confusing admin Archive with Delete |

**Prerequisites:** Local Supabase; shipped active list + 1h window (already on `main`).
**Estimated effort:** ~3 sessions across 3 phases.

## Open Risks & Assumptions

- Unbounded in-progress can clutter `/runs` if organizers never archive; the 5-cap is the bound, not a clock.
- Worker `Date` vs Postgres `now()` on `extended_until` may disagree by seconds (accepted in S-04).
- Backfill is one-way.
- Admin who is also organizer sees Archive twice (header + Admin section).
- Banned organizers cannot archive until unban (or an admin archives); no middleware exemption.

## Success Criteria (Summary)

- Guest public list never shows stamped or elapsed-extend runs; in-progress past 1h still appears until Archive or extend elapses.
- Organizer/admin Archive and organizer Extend work; a 6th active run cannot be created until a slot frees.
- Restricted 404-not-403, comment ACL, and unseated-organizer archive reopen do not regress.
