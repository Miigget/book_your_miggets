# Clan friend invites — Implementation Plan

## Overview

Ship S-19 / PRD v2 FR-015: a clan owner invites current friends from `/clans/{id}`; the invitee Accepts or Declines on `/profile` (owner Cancels outgoing there too). Accept seats a `clan_members` row via a DEFINER trigger so the S-18 public roster updates, without granting client INSERT on `clan_members`. Friends graph (`public_friendships` / `are_friends`) is the invite gate — not `run_invites` snapshots.

## Current State Analysis

S-18 shipped public `/clans`, `/clans/{id}` (members from `public_profiles` nicknames), and verified `/clans/new`. `getClanById` already returns `ownerId` and a roster (`src/lib/services/clans.ts`). The detail page never compares the viewer to `ownerId`; the only mutation UI is admin `AdminClanControls`.

F-02 still forbids client membership writes: `clan_members` has SELECT + DELETE grants, admin-only DELETE RLS, and **no INSERT grant or policy**. The owner is seated only by `seat_owner_on_clan_insert()`. One clan per player is `clan_members.user_id` PK. Admin column UPDATE on `clans` (name/tag/picture) exists; points and `owner_id` stay frozen. Admin clan delete is `deleteClanAsAdmin` → `clans.delete()` relying on `clan_members` CASCADE + `clan_members_delete_admin`. There are no other `clans` FK children today.

Friends (S-11) is the invite→respond analog: `friend_requests` pending/accepted/declined, inbox on `/profile`, `POST /api/friends/*` form + fixed `?error=` strings, live graph via `public_friendships`. Dual UPDATE policies are paired with `friend_requests_before_update` because Postgres ORs USING/WITH CHECK independently. Run `run_invites` is a visibility snapshot with **no** accept/decline — do not copy it.

There is no `clan_invites` table, no owner picker, and no clan-invite APIs. Clan detail page-level `?error=` is `serverError && !isAdmin` (`src/pages/clans/[id].astro`) — non-admins already see it; admins get errors via `AdminClanControls`.

## Desired End State

- Owner (signed-in, `user.id === clan.ownerId`) sees a friends checkbox picker on `/clans/{id}` listing only friends who are **not** already in any clan and **not** already pending for this clan. Declined friends appear so the same POST can reopen. Guests and non-owners never see the picker or the owner’s friend graph.
- `POST /api/clans/{id}/invites` inserts pending rows (or reopens declined → pending). `POST /api/clans/invites/cancel` deletes a pending row as the owner (no seat).
- Invitee sees incoming pending clan invites on `/profile` (clan name + owner nickname, Accept / Decline). Owner sees outgoing pending there (Cancel). Inbox omits rows where `are_friends` is currently false. Stale Accept maps to a fixed “You must be friends with the clan owner.”
- Accept = invitee DELETE of that pending row. A DEFINER trigger seats `clan_members`, deletes the current invite (the DELETE in flight), and deletes the invitee’s **other** pending clan invites. Declined rows for other clans stay. The public roster on `/clans/{id}` shows the new nickname with no extra query shape.
- Admin delete of a clan still succeeds when pending or declined invites exist. CASCADE does not seat anyone and does not clear those invitees’ pendings on **other** clans. An admin who is also an invitee can still Accept (teardown flag is not “viewer is admin”).
- Still **no** `GRANT INSERT` on `clan_members`. No leave/kick. No officers UI. Clan pages still do not join `runs`. Email never appears.

### Key Discoveries:

- Membership writes today are trigger-only (`seat_owner_on_clan_insert` in `supabase/migrations/20260827114633_clan_domain_schema.sql`). Accept must use the same family — not a client INSERT grant.
- `listPublicFriends` / `public_friendships` is the live friend-id set (`src/lib/services/friends.ts`). `are_friends(a,b)` is the SQL predicate (granted to `authenticated` only). Call it from **clan_invites** RLS; friend_requests policies intentionally do not call it.
- Create-run invitee checkboxes (`CreateRunForm` `name="invitee_ids"`) are the picker pattern; friends inbox (`FriendsInbox.astro` on `/profile`) is the respond pattern. FriendActions on `/players/{id}` is **not** copied (no clan CTA on player pages this slice).
- `ClanDetail.ownerId` is already loaded and unused for UI (`src/pages/clans/[id].astro`). Owner detection is a compare to `Astro.locals.user?.id`, not a new column.
- `safeFriendRedirect` allows `/profile` and `/players/{uuid}` only. Clan-invite bounces need `/profile` and `/clans/{uuid}` — extend or add a sibling helper; do not allow `/profile` in `safeAuthReturnTo`.
- Lessons.md: never put PostgREST/`Error.message` in `?error=`. Map domain failures to `ClanError` fixed strings. Send-path already-member (owner inviting someone who already belongs) uses a **new** constant **“They already belong to a clan.”** Keep `CLAN_ALREADY_MEMBER` (“You already belong to a clan.”) for viewer create and Accept `clan_members_pkey`. Never reuse `CLAN_ALREADY_MEMBER` on send — the owner already belongs, so first-person copy is wrong.
- F-02 CASCADE: RLS applies to FK `ON DELETE CASCADE` for non-owner roles, which is why `clan_members_delete_admin` exists. `clan_invites` needs the same admin DELETE policy plus a teardown flag so the accept trigger does not misfire on CASCADE.
- `friend_requests_before_update` freezes pair identity because WITH CHECK cannot see `OLD`. Dual UPDATE on `clan_invites` needs the same freeze (`clan_id` / `invitee_id` / `inviter_id`) and status machine (pending↔declined only).
- Recent policies wrap `(select auth.uid())` for PostgREST initplan (`friend_requests`, `clans_insert_verified_owner`). Write every `clan_invites` policy the same way.

## What We're NOT Doing

- Clan runs, officers appointment UI, or owner/officer as global roles (S-21)
- Leave, owner-kick, owner-leave, or ownership transfer (sticky membership this slice)
- Verified-finish / mutating `clans.points` / widening `GRANT UPDATE` on points
- Prefix-protecting `/clans` or `/clans/{id}`
- Pagination, tag-slug URLs, pending-invite list on the public clan page
- Player-page “Invite to my clan” CTA
- Copying `run_invites` (no accept; snapshot survives unfriend)
- `GRANT INSERT` on `clan_members`
- Vitest (no test runner in `package.json`)
- Opening a second GitHub issue (use #83)

## Implementation Approach

One additive migration (`clan_invites` + RLS + DEFINER accept trigger + clans CASCADE teardown flag + BEFORE UPDATE freeze) → regenerate types → extend `clans.ts` + form POST APIs → owner-only picker on clan detail → profile inbox. Roster rendering stays `getClanById`; seating is a database side effect of accept.

Invite persistence is **pending | declined** only. Accept does not store `accepted` — it deletes the row after seating. Reopen is the same send POST against a declined pair (UPDATE to pending), copying friends reopen.

## Critical Implementation Details

**Accept is invitee DELETE, not an `accepted` status.** Friends accept is UPDATE. Here the roster truth is `clan_members`, so the invitee deletes the pending row. Owner cancel is also DELETE. Distinguish in a BEFORE DELETE DEFINER trigger: if `auth.uid() = invitee_id` and `old.status = 'pending'`, seat + clear other pendings; if `auth.uid() = inviter_id`, cancel only (no seat). RLS must not let a non-participant delete.

**Sibling pending deletes must not re-enter seating.** Clearing other pending invites for the same user fires the same trigger. Guard nested deletes with `pg_trigger_depth() > 1` so they skip `INSERT clan_members`. Otherwise the second clan’s pending would try to seat and hit `clan_members_pkey`.

**Admin clan CASCADE must not look like Accept.** `pg_trigger_depth() > 1` does **not** distinguish CASCADE (typically depth 1) from invitee Accept. A `BEFORE DELETE` on `clans` sets a transaction-local `set_config` teardown flag (parent BEFORE DELETE runs before child CASCADE). The accept trigger returns OLD with no seat and no sibling-pending clears when that flag is set. Do **not** key the skip on `is_admin()` — an admin invitee Accept must still seat. Confirm this trigger order once in Phase 1 SQL smoke; do not assume it from memory at implement time.

**Do not load `listPublicFriends` unless the viewer is the owner.** Fetching the owner’s friend graph on a public page for guests/non-owners leaks FR-028-adjacent social data even if the picker markup is hidden.

## Phase 1: Invite schema + accept trigger

### Overview

Add `clan_invites` with owner-send / invitee-decline / dual-delete + admin-delete RLS, a trigger-only membership write that preserves the F-02 INSERT freeze, a clans teardown flag so admin CASCADE cannot misfire Accept, and a BEFORE UPDATE identity/status freeze.

### Changes Required:

#### 1. Migration — `clan_invites` + RLS + DEFINER trigger

**File**: `supabase/migrations/<timestamp>_clan_friend_invites.sql` (via `npx supabase migration new clan_friend_invites`)

**Intent**: Persist pending/declined clan invites and seat accepted friends without a client INSERT on `clan_members`. Admin clan delete must keep working once invite rows exist.

**Contract**:
- Enum `clan_invite_status`: `'pending' | 'declined'` only.
- Table `public.clan_invites`: `id` uuid PK, `clan_id` → `clans` CASCADE, `invitee_id` → `profiles` CASCADE, `inviter_id` → `profiles` CASCADE, `status` default pending, `created_at` / `updated_at`. CHECK `invitee_id <> inviter_id`. Unique `(clan_id, invitee_id)` (one row per pair across statuses). Partial index pending-by-invitee (inbox); index pending-by-clan (picker exclusion).
- Grants: `REVOKE ALL` from `public`, `anon`. `GRANT select, insert, update, delete` to `authenticated`. **No anon SELECT** (pending invites are not guest-readable). **Do not** `GRANT INSERT` on `clan_members`.
- RLS `TO authenticated`, per-op. Write every uid predicate as `(select auth.uid())` like `friend_requests` (not bare `auth.uid()`):
  - SELECT: `(select auth.uid())` ∈ {inviter_id, invitee_id} **or** `is_admin()`.
  - INSERT: `(select auth.uid())` = inviter_id; inviter is `clans.owner_id` for `clan_id`; status pending; `is_not_banned()`; `are_friends(inviter_id, invitee_id)`; no `clan_members` row for invitee.
  - UPDATE decline: `(select auth.uid())` = invitee; USING pending; WITH CHECK declined; not banned.
  - UPDATE reopen: `(select auth.uid())` = inviter = owner; USING declined; WITH CHECK pending + `are_friends` + still no `clan_members` for invitee + not banned.
  - DELETE accept: `(select auth.uid())` = invitee; USING pending; `are_friends(inviter_id, invitee_id)`; **`public.is_not_banned()`**.
  - DELETE cancel: `(select auth.uid())` = inviter; USING pending; not banned.
  - DELETE admin: `clan_invites_delete_admin` `USING (public.is_admin())` — same family as `clan_members_delete_admin`. Existing `GRANT DELETE` to `authenticated` covers this.
- `BEFORE DELETE` on `clans` (INVOKER, `search_path = ''`, revoke public): set a transaction-local teardown flag, then return OLD. Parent BEFORE DELETE runs before child CASCADE.
- BEFORE DELETE DEFINER trigger on `clan_invites` (`search_path = ''`, `REVOKE ALL FROM public`, trigger-only — no EXECUTE grant). Guard order is load-bearing:

```sql
-- clans BEFORE DELETE (INVOKER):
PERFORM set_config('app.clan_delete_teardown', '1', true); -- local to this transaction
RETURN OLD;

-- clan_invites BEFORE DELETE (DEFINER), first guards:
IF current_setting('app.clan_delete_teardown', true) = '1' THEN
  RETURN OLD; -- CASCADE: no seat, no sibling-pending DELETE
END IF;
IF pg_trigger_depth() > 1 THEN
  RETURN OLD; -- nested deletes from Accept clearing other pendings
END IF;
-- then: invitee + pending → INSERT clan_members (no ON CONFLICT) + DELETE other pending for invitee_id
--        inviter delete → RETURN OLD only (cancel)
-- Do NOT skip seating because is_admin() is true.
```

- Mandatory BEFORE UPDATE on `clan_invites` (INVOKER, `search_path = ''`, revoke public — copy `friend_requests_before_update` family, not optional timestamp-only): freeze `clan_id`, `invitee_id`, `inviter_id`; pending may only become declined; declined may only become pending; bump `updated_at`.
- Do not join `runs` / `run_invites` / `run_participants`. Do not add officers/role columns.

#### 2. Regenerated types

**File**: `src/types/database.ts` (only via `npm run db:types`)

**Intent**: Typed client includes `clan_invites` and `clan_invite_status` without hand-edits.

**Contract**: New table Row/Insert/Update + enum. `clan_members` Insert stays in types but app still must not insert. Trigger function is not a Data-API `Functions` entry.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` exits 0 (migration applies after S-18 picture + admin clan update)
- `npm run db:types` — `clan_invites` present; file is not hand-edited
- SQL smoke (local JWT `anon` / `authenticated`, same style as S-18 Phase 1): anon SELECT of `clan_invites` returns no rows (and has no grant); owner INSERT pending for a current friend who is not in a clan succeeds; owner INSERT for a non-friend fails; owner INSERT for someone in `clan_members` fails; invitee DELETE pending inserts `clan_members`, removes that invite, removes the invitee’s other pending invites, leaves other clans’ declined rows; invitee DELETE when not friends fails and does **not** seat; owner DELETE pending does **not** seat; invitee UPDATE pending → declined succeeds; owner UPDATE declined → pending succeeds when still friends and still clanless; `clan_members` still has no INSERT privilege for `authenticated`; `UPDATE clans SET points = 1` still fails
- SQL smoke (F1 admin CASCADE): as admin, `DELETE` a clan that has both pending and declined `clan_invites` succeeds; no new `clan_members` rows from that delete; those invitees’ pending invites on **other** clans remain. Separate case: an admin who is also the invitee Accepts a pending invite (not during clan delete) **does** seat — teardown flag must not skip real Accept. Confirm parent BEFORE DELETE runs before child CASCADE (no misfire).
- SQL smoke (F2 identity freeze): invitee UPDATE pending → declined while setting a different `clan_id` or `inviter_id` fails; pair identity unchanged.
- SQL smoke (F6 banned accept): banned authenticated invitee DELETE of a pending row fails and does not seat.
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification:

- Local Studio: `clan_invites` columns/enum/unique; `clan_members` grants unchanged (no INSERT)
- Local Studio: `clan_invites_delete_admin` present; clans teardown `BEFORE DELETE` trigger present; `clan_invites` policies use `(select auth.uid())`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Owner invite path

### Overview

The owner sends and reopens invites from the clan page, and can cancel via API. Guests still see only the public roster.

### Changes Required:

#### 1. Clan invite service

**File**: `src/lib/services/clans.ts` (extend; keep one clan service)

**Intent**: All clan invite writes/reads share `ClanError` fixed strings and the S-18 membership helpers.

**Contract**:
- New send-path constant **“They already belong to a clan.”** (invitee already in a clan — shown to the **owner**). Keep `CLAN_ALREADY_MEMBER` = “You already belong to a clan.” for viewer create (`/clans/new`) and Phase 3 Accept `clan_members_pkey`. Never map send-path already-member onto `CLAN_ALREADY_MEMBER`. Other new constants (fixed English only): “Invitees must be friends with you.”; “You must be friends with the clan owner.”; “You can only invite friends into a clan you own.”; “That clan invite is not pending.”; “Pick at least one friend.”; generic “Could not send clan invite” / “Could not update clan invite” / “Could not load clan invites”.
- `listEligibleClanInvitees(supabase, ownerId, clanId)`: `listPublicFriends` minus anyone in `clan_members` (any clan) minus pending invitees for this clan. **Include** declined pairs (reopen candidates). Nicknames from `public_profiles` only.
- `inviteFriendsToClan(supabase, { ownerId, clanId, inviteeIds })`: require viewer is `clans.owner_id`; reject empty set; validate each id is a current friend (`public_friendships` set, same idea as `assertNewInviteesAreFriends`); reject any already in a clan with the **send-path** constant; pending → “already invited” (or skip duplicates); declined → UPDATE status pending; else INSERT pending with `inviter_id = ownerId`. Validate the whole set before writing. Map `23505` via `message`/`details`/`hint` `includes` (no `error.constraint` field). Log PostgREST; never return `error.message`.
- `cancelClanInvite(supabase, ownerId, inviteId)`: DELETE pending as inviter; empty select → not pending.
- Load helpers used in Phase 3 may land here: `listIncomingClanInvites` / `listOutgoingClanInvites` returning `{ id, clanId, clanName, clanTag, userId, nickname }` with `public_profiles` nicknames — filter incoming to `are_friends` / current friend-id set.

#### 2. HTTP — send + cancel

**Files**: `src/pages/api/clans/[id]/invites.ts` (new); `src/pages/api/clans/invites/cancel.ts` (new); `src/lib/clan-invite-mutation-http.ts` (new, copy `friend-mutation-http.ts` but catch `ClanError`); `src/lib/safe-return-to.ts`

**Intent**: Form POST + redirect with the same safety bars as friends, without putting clan-invite redirects through `FriendsError`.

**Contract**:
- `export const POST` only.
- Send: `FormData` `invitee_ids` (repeatable, same as `CreateRunForm`); unauthenticated → sign-in; success → `/clans/{id}?notice=` (e.g. “Clan invites sent.”); fail → `/clans/{id}?error=` fixed strings.
- Cancel: form `invite_id` + `redirect`; `safeClanInviteRedirect` allows `/profile` or `/clans/{uuid}` only (default `/profile`). Notice e.g. “Clan invite cancelled.”
- Optional JSON if `Accept` includes `application/json` (friends helper does this) — fine to support, not required for the picker.
- Banned POSTs already gated in middleware for `/api/*`.

#### 3. Owner picker on clan detail

**Files**: `src/pages/clans/[id].astro`; `src/components/clans/InviteFriendsForm.tsx` (new)

**Intent**: First non-admin owner write UI on the public clan page, without leaking the friend graph.

**Contract**:
- `isOwner = Astro.locals.user?.id === clan.ownerId`. Only then call `listEligibleClanInvitees`. Never call it for guests or non-owners.
- Render `InviteFriendsForm` `client:load` only when `isOwner`: checkboxes `name="invitee_ids"`, POST `/api/clans/{id}/invites`, empty-eligible copy when the owner has no invitable friends.
- Page-level `?error=` today is `serverError && !isAdmin` (`src/pages/clans/[id].astro`) — **non-admins already see** the banner; **admins** do not (errors go to `AdminClanControls` `serverError`). Change the page-level condition to `serverError && (!isAdmin || isOwner)` so admin-owners see invite failures on the page. Keep passing `serverError` into `AdminClanControls`. Do **not** invert `!isAdmin` to `isAdmin`.
- Do not list pending invitees on this page. Do not add Accept/Decline here.
- `cn()` for classes. No `"use client"`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0
- `npm run build` exits 0
- `PROTECTED_ROUTES` still contains `/clans/new` and does not contain `/clans`; `listEligibleClanInvitees` / `listPublicFriends` on `[id].astro` is behind `isOwner`
- Page-level `?error=` condition is `serverError && (!isAdmin || isOwner)`; `AdminClanControls` still receives `serverError`; the condition is not inverted to admin-only

#### Manual Verification:

- Guest `/clans/{id}`: roster only; HTML has no friend nicknames from the owner’s graph and no invite checkboxes
- Signed-in non-owner: no picker
- Owner: picker lists friends who are clanless and not pending; members and pending friends omitted; declined friends present
- Owner POST one eligible friend: pending row; notice; picker no longer lists them
- Owner POST someone already in a clan (forced): “They already belong to a clan.”
- Owner POST a non-friend (forced): friends-must-be-friends copy
- Owner POST declined pair: row returns to pending (reopen)
- Owner Cancel API (curl or later UI): pending gone; no `clan_members` insert
- Admin-owner invite failure shows the page-level error banner; non-admin non-owner still sees page-level `?error=` (not admin-only)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Invitee inbox + seating UX

### Overview

The invitee completes the loop on `/profile`. Accept seats them; guests see the nickname on the existing roster. Owner Cancel is visible on outgoing.

### Changes Required:

#### 1. Accept / decline APIs

**Files**: `src/pages/api/clans/invites/accept.ts` (new); `src/pages/api/clans/invites/decline.ts` (new); service functions on `clans.ts`

**Intent**: Invitee-only respond path using the Phase 1 DELETE/UPDATE contract.

**Contract**:
- `acceptClanInvite(viewerId, inviteId)`: DELETE pending as invitee (trigger seats). Empty result → not pending. Map not-friends / RLS fail to “You must be friends with the clan owner.” Map `clan_members_pkey` blob to `CLAN_ALREADY_MEMBER` (“You already belong to a clan.”).
- `declineClanInvite`: UPDATE pending → declined as invitee.
- POST form `invite_id` + `redirect` via `clan-invite-mutation-http`. Notices: “Clan invite accepted.” / “Clan invite declined.” Default redirect `/profile`.

#### 2. Profile inbox

**Files**: `src/pages/profile.astro`; `src/components/profile/ClanInvitesInbox.astro` (new)

**Intent**: Pending clan invites live next to friend requests, not on the public clan or player page.

**Contract**:
- Load incoming/outgoing clan invites only when verified (same gate as friends lists). Incoming filtered to current friends. Nicknames + clan name/tag; `NicknameLink` for the other person; optional link to `/clans/{id}` (public).
- Incoming: Accept + Decline forms. Outgoing: Cancel form (`redirect=/profile`).
- Unverified: omit the section or one line that clan invites require friends (do not invent a new verify gate beyond the friends graph).
- Empty verified: “No pending clan invites.”
- Native Astro forms (copy `FriendsInbox.astro`), not a React island.

#### 3. AGENTS.md

**File**: `AGENTS.md` (Hard Rules paragraph that already documents friends + clans)

**Intent**: Next agents put clan-invite inbox on `/profile` and never leak pending invites or friend graphs on guest clan pages.

**Contract**: Add: clan-invite mutations are `POST /api/clans/{id}/invites` (send/reopen) and `POST /api/clans/invites/{accept,decline,cancel}`; pending clan invites inbox is on `/profile`, not `/clans/{id}` or `/players/{id}`; owner friends picker on `/clans/{id}` is owner-only and must not load `public_friendships` for anyone else. Keep existing “do not prefix-protect `/clans`” and nickname-only roster rules.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0
- `npm run build` exits 0
- `AGENTS.md` states clan-invite inbox on `/profile` and owner-only picker; `PROTECTED_ROUTES` still does not prefix-protect `/clans`

#### Manual Verification:

- Invitee `/profile`: incoming shows clan + owner; Accept → member on public `/clans/{id}` roster (guest can see the nickname); invite row gone
- Decline → declined; not on roster; owner picker can reopen
- Owner `/profile` outgoing Cancel → pending gone; not seated
- Unfriend while pending: invite disappears from inbox; forced Accept → “You must be friends with the clan owner.”; no seat
- Two owners invite the same clanless friend; Accept one → that roster updates; the other pending row is gone; declined rows for unrelated clans remain
- Guest `/clans/{id}` still 404 for missing ids (not 403); no email in HTML; clan pages do not list runs; restricted runs still 404 for outsiders

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- No test runner in `package.json` — do not add Vitest for this slice.

### Integration Tests:

- Phase 1 SQL smoke (JWT impersonation) is the schema/RLS stand-in, matching F-02 / S-18. Include admin CASCADE, identity-freeze mutation, and banned-accept cases.
- `npm run lint` + `npm run build` on every phase.

### Manual Testing Steps:

1. `npx supabase start` if needed, then `db reset`, `npm run dev` — open [http://localhost:4321/clans](http://localhost:4321/clans).
2. As guest: directory + detail roster; no invite UI; no email.
3. As owner: invite eligible friends; reopen declined; confirm non-owner/guest cannot see checkboxes.
4. As invitee: `/profile` accept → appears on roster; decline; unfriend-then-stale-accept.
5. Two pending invites across clans; accept one; confirm the other pending disappeared.
6. Confirm Studio: still no INSERT grant on `clan_members`; points frozen; admin can delete a clan that has invites.

## Performance Considerations

Eligible-friend list is the owner’s friends minus a small `clan_members` / pending set — no pagination (out of scope). Inbox is pending rows for one user. Do not add a `points` index. Do not scan `friend_requests` for the live graph; use `public_friendships`.

## Migration Notes

Additive only: new enum, table, policies, triggers (accept DELETE, clans teardown flag, invite UPDATE freeze). No backfill. Existing clans keep a single owner member until invites are accepted. Rollback locally is `db reset` to the previous migration. Production ships on the next `v*` tag (`cd_trigger: tag`). Do not `db push` to the linked remote from this change.

## References

- GitHub: #83 (do not open another)
- PRD v2 FR-015: `context/foundation/prd-v2.md` (not archived `prd.md` FR-015)
- Roadmap S-19: `context/foundation/roadmap.md`
- Predecessor: `context/archive/2026-08-27-create-clan-directory/`
- F-02 grants/trigger: `supabase/migrations/20260827114633_clan_domain_schema.sql`
- Friends analog: `src/lib/services/friends.ts`; `src/pages/api/friends/*`; `src/components/profile/FriendsInbox.astro`; `src/lib/friend-mutation-http.ts`
- Friends UPDATE freeze: `supabase/migrations/20260821130000_friend_requests.sql` (`friend_requests_before_update`)
- Picker analog: `src/components/runs/CreateRunForm.tsx` (`invitee_ids`)
- Roster: `getClanById` in `src/lib/services/clans.ts`; `src/pages/clans/[id].astro`
- Lessons: never echo PostgREST into `?error=`
- Plan review (this revise): `context/changes/clan-friend-invites/reviews/plan-review.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Invite schema + accept trigger

#### Automated

- [x] 1.1 npx supabase db reset exits 0 (migration applies after S-18 picture + admin clan update) — 3869abd
- [x] 1.2 npm run db:types — clan_invites present; file is not hand-edited — 3869abd
- [x] 1.3 SQL smoke: anon cannot read clan_invites; owner INSERT friend-not-in-clan; non-friend and already-member INSERT fail; invitee DELETE seats and clears other pendings; not-friends DELETE does not seat; owner DELETE does not seat; decline + reopen; no clan_members INSERT grant; points UPDATE still denied — 3869abd
- [x] 1.4 npm run lint exits 0 — 3869abd
- [x] 1.5 npm run build exits 0 — 3869abd
- [x] 1.7 SQL smoke F1: admin DELETE clan with pending+declined succeeds; nobody seated; other clans’ pendings remain; admin invitee Accept still seats — 3869abd
- [x] 1.8 SQL smoke F2: invitee cannot change clan_id/inviter_id on decline — 3869abd
- [x] 1.9 SQL smoke F6: banned invitee DELETE pending fails and does not seat — 3869abd

#### Manual

- [ ] 1.6 Local Studio: clan_invites columns/enum/unique; clan_members grants unchanged (no INSERT)
- [ ] 1.10 Local Studio: clan_invites_delete_admin present; clans teardown trigger present; policies use (select auth.uid())

### Phase 2: Owner invite path

#### Automated

- [x] 2.1 npm run lint exits 0 — 7e2ced6
- [x] 2.2 npm run build exits 0 — 7e2ced6
- [x] 2.3 PROTECTED_ROUTES has /clans/new and not /clans; friend-graph load on clan detail is owner-only — 7e2ced6
- [x] 2.12 Page-level ?error= is serverError && (!isAdmin || isOwner); AdminClanControls still gets serverError; not inverted to admin-only — 7e2ced6

#### Manual

- [ ] 2.4 Guest clan detail: roster only; no owner friend graph in HTML
- [ ] 2.5 Signed-in non-owner: no picker
- [ ] 2.6 Owner picker lists eligible friends only (not members, not pending; declined included)
- [ ] 2.7 Owner POST eligible friend: pending row and notice
- [ ] 2.8 Forced already-member POST: They already belong to a clan
- [ ] 2.9 Forced non-friend POST: must-be-friends copy
- [ ] 2.10 Reopen declined via same POST
- [ ] 2.11 Owner Cancel API: pending gone; not seated
- [ ] 2.13 Admin-owner invite failure shows page-level banner; non-admin non-owner still sees page-level ?error=

### Phase 3: Invitee inbox + seating UX

#### Automated

- [x] 3.1 npm run lint exits 0
- [x] 3.2 npm run build exits 0
- [x] 3.3 AGENTS.md documents clan-invite inbox on /profile and owner-only picker; PROTECTED_ROUTES still does not prefix-protect /clans

#### Manual

- [ ] 3.4 Invitee Accept on /profile seats them on the public roster
- [ ] 3.5 Decline: not on roster; owner can reopen
- [ ] 3.6 Owner Cancel from /profile outgoing
- [ ] 3.7 Unfriend hides inbox; stale Accept uses friends copy and does not seat
- [ ] 3.8 Two pending invites; accept one; other pending cleared
- [ ] 3.9 Guest missing clan 404; no email; clan pages do not list runs; restricted runs still 404 for outsiders
