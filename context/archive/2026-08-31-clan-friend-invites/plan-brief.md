# Clan friend invites — Plan Brief

> Full plan: `context/changes/clan-friend-invites/plan.md`

## What & Why

Clan owner can invite friends to join the clan so accepted members appear on the public roster guests already see (S-19 / PRD v2 FR-015 / US-02). Gating on the existing friends graph keeps unverified accounts out at the same trust bar as restricted runs.

## Starting Point

S-18 shipped `/clans` + `/clans/{id}` with a `public_profiles` nickname roster. `clan_members` still has no client INSERT (owner seated by DEFINER trigger; one clan per player). Friends already have request → profile inbox → accept/decline. Owner has no mutation UI on clan detail (admin-only). No `clan_invites` table. Page-level `?error=` is `serverError && !isAdmin`.

## Desired End State

Owner picks eligible friends on `/clans/{id}`. Invitee Accept/Decline (owner Cancel) on `/profile`. Accept seats `clan_members` and the guest roster updates. Pending invites and the owner’s friend list never appear for guests. Admin clan delete still works when invites exist (no misfired seating).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Seating | DEFINER trigger on accept; no `clan_members` INSERT grant | Same family as `seat_owner_on_clan_insert`; PK abort rolls back | Plan |
| Invite rows | pending \| declined; accept deletes the row | Roster truth stays `clan_members`; declined kept to reopen | Plan |
| Owner UI | Friends picker on `/clans/{id}` → `POST /api/clans/{id}/invites` | Clan is the resource; copy CreateRunForm `invitee_ids`; never leak friends to guests | Plan |
| Invitee UI | `/profile` inbox only | Matches AGENTS.md friends inbox; public clan page stays guest roster | Plan |
| Already in a clan | Exclude from picker and POST | One-clan PK; no doomed inbox items | Plan |
| Leave / kick | Out of scope (sticky membership) | FR-015 is invite→accept; transfer needs officers UI | Plan |
| Multi-pending | Accept seats and deletes other pendings | Inbox matches one-clan reality; other clans’ declined rows stay | Plan |
| Unfriend while pending | `are_friends` on accept; hide in inbox | Check at write time like new run invitees; no friends→clans unfriend trigger | Plan |
| Reopen | Same send POST on a declined pair | Copies friends reopen; no extra button | Plan |
| Phases | Schema+trigger → owner write → profile inbox | Independently verifiable like S-18 | Plan |
| Admin clan delete | `clan_invites_delete_admin` + clans BEFORE DELETE `set_config` teardown; `pg_trigger_depth` only for nested accept deletes | CASCADE RLS + accept trigger would block admin delete or misfire Accept; must not skip a real admin-invitee Accept | Plan-review F1 |
| UPDATE freeze | Mandatory BEFORE UPDATE: freeze `clan_id`/`invitee_id`/`inviter_id`; pending↔declined only | Friends already closed the permissive-OR hole; invitee must not re-point the unique pair | Plan-review F2 |
| Clan detail errors | `serverError && (!isAdmin \|\| isOwner)`; keep `AdminClanControls` `serverError` | Actual banner is `!isAdmin` today; do not invert it | Plan-review F3 |
| Already-member copy | New send constant “They already belong to a clan.”; keep `CLAN_ALREADY_MEMBER` (“You already belong to a clan.”) for viewer create and Accept PK | Owner must not see first-person copy on send | Plan-review F4 |

## Scope

**In scope:** `clan_invites` + RLS + accept trigger + admin CASCADE teardown + UPDATE freeze; owner picker; send/reopen/cancel/accept/decline APIs; profile inbox; AGENTS.md; accepted members on the existing S-18 roster.

**Out of scope:** clan runs, officers UI, leave/kick, points UPDATE, prefix-protect `/clans`, pagination, tag slugs, player-page invite CTA, `run_invites` semantics, Vitest, a second GitHub issue.

## Architecture / Approach

SSR Astro clan detail + profile; React island only for the owner picker. Invites are `authenticated`-only (no anon SELECT). Every `clan_invites` policy uses `(select auth.uid())` like `friend_requests`. Accept is invitee DELETE of a pending row with `is_not_banned()` on that USING; a BEFORE DELETE DEFINER trigger inserts `clan_members` and clears the user’s other pending invites. Nested accept deletes skip seating via `pg_trigger_depth() > 1`. Admin `DELETE` on `clans` sets a transaction-local teardown GUC so CASCADE does not seat or clear sibling-clan pendings — do not skip Accept because the invitee is an admin. BEFORE UPDATE (INVOKER) freezes pair + inviter and allows only pending↔declined. Live friend checks use `public_friendships` / `are_friends`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Invite schema + accept trigger | Table, RLS, DEFINER seating, admin CASCADE teardown, UPDATE freeze, still no membership INSERT grant | CASCADE misfiring Accept on admin delete; nested trigger seating a second clan; accidental INSERT grant |
| 2. Owner invite path | Picker + send/reopen/cancel API; page-level errors for admin-owners | Loading `listPublicFriends` for non-owners leaks the graph; send-path copy reuse of `CLAN_ALREADY_MEMBER` |
| 3. Invitee inbox + seating UX | `/profile` Accept/Decline/Cancel; roster updates | Pending invites leaking onto `/clans/{id}` |

**Prerequisites:** S-18 on local `db reset`; two verified friends, one of them a clan owner; local Supabase.
**Estimated effort:** ~3 implement sessions (one phase each).

## Open Risks & Assumptions

- Roadmap S-19 status flip to `planning` was skipped this session (parallel release holds `roadmap.md` dirty) — Crew Lead / later implement can stamp it.
- DELETE-as-accept is unlike friends UPDATE-as-accept; the trigger contract must stay explicit so cancel (owner DELETE) never seats, and CASCADE teardown never looks like Accept.
- Confirm local PG trigger order (parent BEFORE DELETE before child CASCADE) in Phase 1 F1 smoke — do not assume from memory at implement time.
- Production schema ships on the next `v*` tag (`cd_trigger: tag`), not on merge to `main`.
- Without leave, friends who already created a clan cannot be invited until a later slice.

## Success Criteria (Summary)

- Owner invites current clanless friends from clan detail; guests never see that picker or friend list.
- Invitee accepts on `/profile` and appears on the public roster; decline/cancel/unfriend behave as specified.
- `clan_members` still cannot be inserted by the client; admin clan delete still works with pending invites; restricted runs still do not leak via clan pages.
