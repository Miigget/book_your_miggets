# Restricted run visibility — Plan Brief

> Full plan: `context/changes/restricted-run-visibility/plan.md`
> Research: `context/changes/restricted-run-visibility/research.md`

## What & Why

Verified organizers can post **friends-only** or **invite-only** runs so guests and everyone else never see them. Today every active run is world-readable (list, landing, PostgREST, confirmed participant rows). S-15 adds a second RLS axis beside the active window so privacy is not a UI filter on a publishable anon key.

## Starting Point

`runs` SELECT is the FR-013 active window for anon and authenticated, plus unbounded organizer/admin and archived-confirmed-participant paths. S-11 already shipped live `are_friends()` and `listPublicFriends`. There is no `visibility` column and no invite table. `/runs` is one flat list; landing reuses `listActiveRuns`.

## Desired End State

A verified organizer sets visibility on create/edit. Friends see friends-only runs in a **Friends** section on `/runs`; invitees see invite-only in **Invited**. Public/guest stacks stay public-only. Landing preview is public-only. Hidden runs 404 like missing. Admins still open detail to delete; leftovers they are not in the audience for appear in an admin-only **Restricted** section.

## Key Decisions Made

| Decision                | Choice                                                                        | Why (1 sentence)                                                               | Source                   |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| List presentation       | Distinct Public / Friends / Invited on `/runs`                                | Restricted rows must never mix into the guest stack                            | Crew / Research          |
| Friends-only graph      | Live `are_friends(organizer, viewer)`                                         | Unfriend/unverify drops discovery; matches S-11                                | Crew / Research          |
| Invite-only graph       | Snapshot table at create/edit                                                 | Unfriend must not revoke an invite until the organizer edits                   | Crew / Research          |
| Authz                   | RLS + matching app loaders; 404 not 403                                       | Publishable key is the boundary (F-01); existence must not leak                | Crew / Research          |
| Admin discovery         | SELECT stays; extra **Restricted** section on `/runs`; no `/admin` index      | S-06 delete needs a list path without mixing into Public                       | Plan                     |
| Seated after shrink     | Confirmed keep SELECT; pending 404, rows kept                                 | Do not strand teammates; do not auto-delete applications                       | Plan                     |
| Invite storage          | `run_invites(run_id, user_id)` + `is_run_invitee()`                           | Cycle-safe EXISTS + independent grants; uuid[] is weaker RLS                   | Plan                     |
| Invite-only empty list  | Always ≥1 invitee (create and edit)                                           | Friends-only is the empty-audience mode; US-09 is a pick                       | Plan                     |
| Restricted create/edit  | Verified only; unverified public OK                                           | PRD Access Control v1.1; edit must not bypass INSERT                           | Crew / PRD / Plan-review |
| Unverified UPDATE       | Same WITH CHECK as INSERT; same `?error=` on edit API                         | After unverify, a save that leaves the row restricted fails until `public`     | Plan-review F1 A         |
| Invite-only writers     | `create_invite_only_run` + `set_run_visibility_and_invites` (INVOKER)         | One transaction; never `updateRun` + sync; RPC UPDATEs the run row (S-13)      | Plan-review F2 A         |
| `can_view_run` window   | Inline `archived_at is null and starts_at > now() - 1 hour`                   | Never call `is_run_in_active_window` (one-way: window helper → `can_view_run`) | Plan-review F3           |
| Guest catalog           | Guest `/runs` + Welcome always `publicOnly`; signed-in `/runs` never          | Dual defense if RLS regresses; Friends/Invited must still load                 | Plan-review F4           |
| Leftover invitee labels | `public_profiles` nicknames for snapshot ids missing from `listPublicFriends` | Unfriended invitees stay selected/removable without raw UUIDs                  | Plan-review F5           |
| Phases                  | (1) schema+RLS+leaks (2) create/edit (3) list/landing                         | Both modes share the RLS axis; UI must not ship ahead of the boundary          | Plan                     |
| Landing                 | Public-only preview even when signed in                                       | Friends/Invited discovery belongs on `/runs`                                   | Crew / Plan              |

## Scope

**In scope:** `visibility` enum + `run_invites`; `can_view_run` / `is_run_invitee`; rewrite active SELECT; close participants dump, `auto_join_run`, window-oracle, mutation oracles; create/edit form + verified gate on create **and** edit; two named invite-only RPCs; `/runs` sections; public landing + guest `publicOnly`; 404 copy unchanged; AGENTS.md bullet.

**Out of scope:** comments feature work (do not widen read ACL), player labels, admin profile edits, admin run index, Vitest/Jest, prefix-protecting `/runs`.

## Architecture / Approach

Two PERMISSIVE axes: active window (inlined; never via `is_run_in_active_window` on `runs`) and audience (`public` / live friends / invite snapshot). `runs` policies call `are_friends` + `is_run_invitee` only. Sibling tables and DEFINER RPCs call `can_view_run`, which inlines the window and never calls `is_run_in_active_window`. Invite-only writes use `create_invite_only_run` (create) and `set_run_visibility_and_invites` (edit instead of `updateRun`) so ≥1 invitees commit atomically. Unverified restricted is the same WITH CHECK on INSERT and UPDATE.

## Phases at a Glance

| Phase                   | What it delivers                                             | Key risk                                                       |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| 1. Schema + RLS + leaks | Hidden from PostgREST; named RPCs; verified UPDATE conjunct  | Helper/policy cycle or leftover participant `run_id` dump      |
| 2. Create/edit + picker | Verified restricted create/edit; RPC-only invite-only writes | Pairing `updateRun` + sync leaves 0-invitee rows               |
| 3. `/runs` + landing    | Sections + guest/Welcome `publicOnly` + 404                  | Admin duplicate listing or restricted cards on landing/`/runs` |

**Prerequisites:** S-11 archived (`are_friends`, `listPublicFriends`); local Supabase; no new test runner.
**Estimated effort:** ~3 sessions (one phase each); Phase 1 is the load-bearing RLS slice.

## Open Risks & Assumptions

- `run_participants_select_own` still returns your pending row after you lose audience (UUID already known); not closed
- Tightening confirmed SELECT also stops the guest dump of **archived public** `run_id`s — intentional
- Empty invite-only cannot be a CHECK on `runs` INSERT; the two named RPCs are mandatory
- After unverify, any organizer save that leaves the row restricted fails until they switch to public (F1 A tradeoff)
- YOLO skips human UI gates until someone clicks through Progress Manual rows

## Success Criteria (Summary)

- Guests never see friends-only/invite-only runs (UI or REST); guest `/runs` and Welcome always `publicOnly`
- Friends/invitees find them in the right `/runs` section and can apply under existing join mode
- Organizer/admin/confirmed seat never lose a run they should still see; hidden everyone else 404s
- Unverified members cannot create or PATCH restricted visibility; invite-only writes never land with 0 invitees
