# Clan-only runs — Plan Brief

> Full plan: `context/changes/clan-runs/plan.md`
> Research: `context/changes/clan-runs/research.md`

## What & Why

Clan owners need a run that only current clan members (and admins) can find, without leaking friends-only / invite-only and without a second scheduler. S-21 also has to stop Dashboard `"Could not load your runs."` after archived restricted runs — a real RLS recursion on organizer participant counts, not a UI catch.

## Starting Point

S-15 already shipped `run_visibility` (`public | friends_only | invite_only`), 404-not-403, and signed-in Public / Friends / Invited / Restricted. Friends-only is a live DEFINER helper + plain insert/`updateRun`; invite-only is a snapshot RPC. Clans have an owner and `clan_members` with no officer role. Dashboard head-counts still use INVOKER `EXISTS (SELECT … FROM runs)` on `run_participants`.

## Desired End State

A clan owner creates a **clan-only** run on the same entity. Members see it under **Clan** on signed-in `/runs` and can join with existing join_mode. Guests and non-members get the missing-run 404. Dashboard loads archived friends-only / invite-only inventories. Cards say **Clan only**.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Entity | Same run, new `clan_only` visibility | Avoids a second scheduler and Public leak | Crew / Research |
| Audience | Live `is_same_clan(organizer_id, uid)` over `clan_members` | Friends-only analog; not a frozen invite snapshot | Crew / Plan |
| `runs.clan_id` | None this slice | Helper must not SELECT `runs`; S-23 can add an FK later | Plan |
| Who creates | Clan **owner** only (`clans.owner_id`) | No officer column exists | Crew |
| `/runs` catalog | Dedicated **Clan** section | Never mix into Public; admin leftovers stay Restricted | Plan |
| Create picker | Hide clan-only unless `ownsClan` (keep on edit if already clan-only) | No dead option; tamper still fails API + RLS | Plan |
| Errors | Updated unverified string + dedicated owner string | Two honest gates; no PostgREST in `?error=` | Plan |
| Edit | `clan_only` via `updateRun` like friends-only | Invite-only stays on the existing RPC | Plan |
| Dashboard | Rewrite `run_participants_select_organizer` → `is_run_organizer` | Fixes 42P17; catch-only would still fail SQL smoke | Research / Plan |
| Enum migrate | Two files (ADD VALUE, then RLS) | PG 17 forbids using a new enum label in the same transaction | Plan |

## Scope

**In scope:** `clan_only` enum + RLS/`can_view_run` + owner WITH CHECK; owner-only create/edit on existing APIs/form; Clan section; dashboard organizer-count policy; `formatVisibility`; AGENTS.md.

**Out of scope:** S-22 complete, S-23 points, officers UI, `runs.clan_id`, clan invite copy of `run_invites`, Vitest, prefix-protect `/runs`.

## Architecture / Approach

Fourth value on the existing visibility axis. `is_same_clan` DEFINER-reads `clan_members` only and is inlined on `runs_select_active_authenticated` (never `can_view_run` from `runs` policies). `can_view_run` gets a matching branch so apply/auto-join stay aligned. Create/edit for clan-only is the friends-only insert/`updateRun` path plus `userOwnsClan`. Publishable-key RLS is the leak boundary; `/runs` partition is presentational.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Enum, RLS, dashboard recursion | Two migrations, types, `formatVisibility`, 42P17 gone | Combining ADD VALUE + policies in one transaction; catch-only “fix” |
| 2. Owner gate + form/APIs | Hide/show option, two error strings, insert/`updateRun` | Wrong gate string; accidentally routing clan-only through invite RPCs |
| 3. Clan section + AGENTS.md | Signed-in Clan bucket; docs | Mixing clan-only into Public or Restricted duplicates |

**Prerequisites:** Local Supabase + app; S-18/S-19 shipped; an organizer with archived friends-only and invite-only runs for Phase 1 smoke.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- 42P17 is the dashboard failure; SQL smoke as **authenticated** (not superuser) must confirm it. If the error is something else, capture Worker `dashboard run lists failed` and adapt the policy still — do not catch-only.
- Leave/transfer does not exist; live organizer-clan graph is enough until S-23.
- Unseated members can see the run but not comments (existing ACL).

## Success Criteria (Summary)

- Clan owner publishes a clan-only run; members find it under Clan and can join; guests/non-members 404; anon PostgREST does not list it.
- Friends-only / invite-only still do not appear in Public.
- Dashboard loads after archived restricted runs; cards show **Clan only**.
