# Add verified friends Implementation Plan

## Overview

Ship S-11 / US-04 / FR-019: verified members send, accept, or decline friend requests to other verified members, remove a friendship, and see the accepted friends list on the public profile. Unverified accounts stay out of the live graph. Requests stay private to the two participants. Friends-only / invite-only run visibility stays in S-15.

## Current State Analysis

S-10 shipped `/profile` (protected Astro + `OwnProfileForm` island) and `/players/{id}` (public Astro). `is_verified` is on `getOwnProfile` / `public_profiles`, not `locals.profile`. There are no friend tables, APIs, or UI in `src/`. Closest RLS twin is `nickname_change_requests` (statused queue, `TO authenticated`, `(select auth.uid())`). Closest mutation UI for a single CTA is an Astro form POST (admin verify/ban); inbox accept/decline mirrors `RunParticipantActions` two-form accept/deny. Guests cannot SELECT `profiles` or other users' private rows; cross-user `is_verified` must go through `public_profiles` (`security_invoker = false`) or a SECURITY DEFINER helper. Middleware already blocks banned POSTs to `/api/*`. No test runner — verification is SQL smoke, lint, build, and UI.

## Desired End State

A verified member opens someone else's `/players/{uuid}` and can Add friend, Accept request (if that person already requested them), or Remove friend. Guests and unverified members still see the accepted friends list (NicknameLinks) but no controls. Pending names never appear on `/players/{id}`, including when viewing yourself.

A verified member opens `/profile` and sees incoming pending (accept / decline) and outgoing pending (cancel). Cancel deletes the pending row. Decline keeps a declined row that the same pair can reopen. Unfriend deletes the accepted row. Admin unverify does not destroy rows; lists, mutations, and `are_friends()` require both people to be currently verified.

### Key Discoveries:

- `public_profiles` is the guest-safe identity projection (`supabase/migrations/20260820071325_user_profile_identity.sql:19-26`) — use it for `is_verified` checks, never `profiles` SELECT of another user
- Profile POST APIs (`src/pages/api/profile/points.ts`) are the mutation skeleton: `getUser`, `ensureOwnProfile`, domain error class, fixed `?error=` copy, `console.error` for raw failures (`context/foundation/lessons.md`)
- `/players/{id}` is public SSR with no island (`src/pages/players/[id].astro`); `/profile` is already in `PROTECTED_ROUTES` (`src/middleware.ts:4`)
- `NicknameLink.astro` / `.tsx` + `playerProfileHref` already exist for friends-list nicknames
- `safeRunReturnTo` only allows `/runs/{uuid}` (`src/lib/safe-return-to.ts`) — keep it runs-only (`nickname.ts`, Phase 2 criterion 2.3). Auth hops need a separate `safeAuthReturnTo` (`/runs/{uuid}` or `/players/{uuid}`). Friend mutation `redirect` needs a separate `safeFriendRedirect` (`/profile` or `/players/{uuid}`)
- UPDATE requires a matching SELECT policy (Supabase RLS trap)

## What We're NOT Doing

- Friends-only or invite-only run visibility, run RLS, or highlighted friends sections (S-15)
- Wiring `are_friends()` into `runs` policies in this slice (helper is shipped for S-15 to consume)
- Friend activity feeds, DM, or blocking
- Admin UI to edit the graph (admin SELECT on the table is enough to debug)
- Showing pending requests on `/players/{id}` (including own public page)
- Adding `/players/{id}` to `PROTECTED_ROUTES`
- Vitest/Jest
- `src/types.ts` — DTOs live in `src/lib/services/friends.ts`

## Implementation Approach

Schema and guest-safe read path first (so S-15 gets a stable `are_friends()` and public list). Then signed-in inbox + POST APIs (testable with SQL-seeded pending rows). Then public-page list and Add/Accept/Remove.

Live graph rule everywhere: **accepted + both currently verified**. Unverify hides a person from lists and blocks new/accept without deleting history.

## Critical Implementation Details

**One row per unordered pair.** Unique on `(least(sender_id, receiver_id), greatest(sender_id, receiver_id))` for all statuses. Re-request after decline UPDATEs that row to `pending` (and may swap sender/receiver so the new initiator is `sender_id`). Cancel and unfriend DELETE, which frees the pair for a later INSERT. Do not INSERT a second pending beside a declined row.

**Guests must not SELECT `friend_requests`.** Revoke `anon` on the table. Accepted, currently-verified edges are exposed only through `public_friendships` (`WITH (security_invoker = false)`), same rationale as `public_profiles`. Pending/declined stay on the table behind participant RLS.

**Do not call `are_friends()` from a policy on `friend_requests`.** The helper SELECTs that table as DEFINER; using it in that table's own policies risks recursion. S-11 policies use `(select auth.uid())` and `public_profiles` only. S-15 may call `are_friends()` from `runs` policies later.

**Public Add friend is overloaded as accept** when an incoming pending row exists. Button label must be "Accept request" in that state — do not show "Add friend" and silently accept.

**`?error=` copy.** Only `FriendsError.message` or fixed strings. Log PostgREST/Auth with `console.error`. Banned POSTs already redirect via middleware (`src/middleware.ts:62-69`).

---

## Phase 1: Friend schema, RLS, public list view, are_friends

### Overview

Land the graph contract S-15 can trust: one pair row, live verification in the helper and the guest view, no anon reads of pending requests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_friend_requests.sql` (create with `npx supabase migration new friend_requests`; keep the suffix)

**Intent**: Store directed requests that become mutual on accept, with a guest-readable accepted list that already applies the both-verified rule.

**Contract**:

- Enum `friend_request_status`: `pending`, `accepted`, `declined` (no `ended` — unfriend is DELETE)
- Table `friend_requests`: `id uuid pk default gen_random_uuid()`, `sender_id` / `receiver_id` → `profiles(id)` ON DELETE CASCADE, `status` not null default `pending`, `created_at` / `updated_at`
- `check (sender_id <> receiver_id)`
- Unique index on `(least(sender_id, receiver_id), greatest(sender_id, receiver_id))` (all statuses — one row per pair)
- Indexes on `sender_id`, `receiver_id`, and `(receiver_id) where status = 'pending'` for inbox
- `revoke all` from `public` and `anon`; `grant select, insert, update, delete` to `authenticated`
- RLS enabled; policies `TO authenticated` with `(select auth.uid())`:
  - `friend_requests_select_participant` — `uid in (sender_id, receiver_id)`
  - `friend_requests_select_admin` — `is_admin()`
  - `friend_requests_insert_sender_pending` — `uid = sender_id`, `status = pending`, `is_not_banned()`, both ids verified via `public_profiles`, `sender_id <> receiver_id`
  - `friend_requests_update_receiver_pending` — USING: `uid = receiver_id` and `status = pending` and `is_not_banned()`; WITH CHECK: same receiver, status `accepted` or `declined`, **sender_id/receiver_id unchanged**
  - `friend_requests_update_reopen_declined` — USING: `uid in (sender_id, receiver_id)` and `status = declined` and `is_not_banned()`; WITH CHECK: `uid = sender_id`, `status = pending`, the two ids are the same unordered pair (possibly swapped), both still verified
  - `friend_requests_delete_sender_pending` — sender, `status = pending`, `is_not_banned()`
  - `friend_requests_delete_participant_accepted` — `uid in (sender_id, receiver_id)`, `status = accepted`, `is_not_banned()`
- BEFORE UPDATE trigger: stamp `updated_at`; reject id changes except the declined-reopen swap; reject any UPDATE of an `accepted` row (unfriend is DELETE)
- View `public_friendships` `WITH (security_invoker = false)`: two rows per live edge so `user_id = :id` lists friends — `user_id`, `friend_id` from accepted `friend_requests` joined to `public_profiles` on both ends with `is_verified = true`. Columns: those two uuids only (no email, no pending)
- `revoke all` on the view from `public`; `grant select` to `anon, authenticated`
- Function `are_friends(a uuid, b uuid) returns boolean` — `STABLE`, `SECURITY DEFINER`, `set search_path = ''`: exists accepted row for the unordered pair **and** both `public_profiles.is_verified`. `revoke all from public`; `grant execute` to `authenticated` (S-15). Do not grant to `anon`

Trigger control flow (non-obvious; preserve this):

```sql
if old.status = 'accepted'::public.friend_request_status then
  raise exception 'accepted friendships cannot be updated';
end if;
if old.status = 'pending'::public.friend_request_status then
  new.sender_id := old.sender_id;
  new.receiver_id := old.receiver_id;
end if;
if old.status = 'declined'::public.friend_request_status then
  -- allow sender/receiver swap; unordered pair must stay the same
  if least(new.sender_id, new.receiver_id) is distinct from least(old.sender_id, old.receiver_id)
     or greatest(new.sender_id, new.receiver_id) is distinct from greatest(old.sender_id, old.receiver_id) then
    raise exception 'cannot change friend pair';
  end if;
end if;
new.updated_at := now();
```

#### 2. Generated types

**File**: `src/types/database.ts`

**Intent**: Typed table, view, enum, and `are_friends` args so Phase 2/3 typecheck.

**Contract**: Run `npm run db:types` against local Supabase. Do not hand-edit `database.ts`.

### Success Criteria:

#### Automated Verification:

- Migration exists under `supabase/migrations/` with RLS per operation, no `anon` grant on `friend_requests`, view column list only `user_id` + `friend_id`
- `npx supabase db reset` (or project-equivalent apply) succeeds locally
- `npm run db:types` includes `friend_requests`, `public_friendships`, `friend_request_status`, `are_friends`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- SQL: verified sender INSERT pending succeeds; unverified sender or unverified receiver INSERT fails RLS
- SQL: self-request fails the check constraint
- SQL: second live row for the same unordered pair fails the unique index
- SQL: receiver can UPDATE pending → accepted or declined; sender cannot accept their own row
- SQL: sender DELETE pending succeeds; receiver cannot DELETE pending
- SQL: either party DELETE accepted succeeds; UPDATE accepted fails the trigger
- SQL: declined row UPDATE to pending with swapped sender succeeds; INSERT of a second pair row fails unique
- SQL: anon SELECT `friend_requests` fails; anon SELECT `public_friendships` returns only accepted pairs where both are verified
- SQL: after unverify of one party, `public_friendships` and `are_friends()` hide that edge; the `friend_requests` accepted row still exists

**Implementation Note**: After this phase and automated verification, pause for the SQL/RLS smoke above before Phase 2. Phase blocks use plain bullets; checkboxes live in `## Progress`.

---

## Phase 2: Friends service, POST APIs, /profile inbox

### Overview

Give verified members a private inbox and a single service choke point. Public CTAs in Phase 3 call the same APIs.

### Changes Required:

#### 1. Friends service

**File**: `src/lib/services/friends.ts` (new)

**Intent**: Pages and APIs must not speak PostgREST. Encode send / accept-if-incoming / reopen-declined / decline / cancel / unfriend and inbox + relationship reads.

**Contract**: `FriendsError` (user-facing message, same shape as `ProfileError`). Check mutation `.select()` row counts — RLS failures are empty, not thrown. Log raw errors. `isUuid` from `@/lib/services/runs`.

- `getRelationship(supabase, viewerId, otherId)` → `{ status, requestId: string | null }` where `status` is `none | outgoing_pending | incoming_pending | accepted | declined`. `requestId` is the `friend_requests.id` for pending rows (`outgoing_pending` / `incoming_pending`); `null` otherwise. Declined is treated as `none` for CTA purposes except the service uses it internally to reopen. Ignore relationships unless **both** are currently verified (`public_profiles`); if either is unverified, return `{ status: "none", requestId: null }` and do not return pending to the UI
- `listPublicFriends(supabase, userId)` → `{ id, nickname }[]` from `public_friendships` joined to `public_profiles` for nicknames (order by nickname nulls last). Empty if `userId` is not a uuid
- `listIncomingPending` / `listOutgoingPending` for the viewer from `friend_requests` where status pending, join `public_profiles` for the other party's nickname; each row includes `id` (`friend_requests.id`) plus that nickname; skip rows whose other party is no longer verified
- `sendFriendRequest(supabase, viewerId, targetId)`:
  - reject self, invalid uuid
  - both must be verified (fixed copy)
  - if incoming pending exists → accept it (same as `acceptFriendRequest`)
  - if accepted exists → domain error "You are already friends."
  - if outgoing pending exists → domain error "Friend request already sent."
  - if declined exists → UPDATE to pending with `sender_id = viewerId`, `receiver_id = targetId`
  - else INSERT pending
- `acceptFriendRequest` — viewer must be receiver, status pending
- `declineFriendRequest` — viewer must be receiver, status pending → declined
- `cancelFriendRequest` — viewer must be sender, DELETE pending
- `unfriend` — DELETE accepted row where viewer is either party
- Unique `23505` → "Could not update friend request" (or the already-friends / already-sent messages if a relationship re-read shows why)

#### 2. Safe return helpers (friend redirect + auth allowlist)

**File**: `src/lib/safe-return-to.ts`

**Intent**: Name three allowlists so Phase 2 friend APIs and Phase 3 auth hops do not contradict. Do not widen `safeRunReturnTo`.

**Contract**:

- Keep `safeRunReturnTo` runs-only (`/^\/runs\/{uuid}$/` as today). `nickname.ts` stays on it. Phase 2 criterion 2.3 stays valid.
- Add `safeAuthReturnTo`: allow only `/runs/{uuid}` **or** `/players/{uuid}` (same uuid regex style as `RUN_RETURN_TO_RE`). Used for post-login `?returnTo=`. Do **not** allow `/profile` here (`PROTECTED_ROUTES` already covers that page).
- Add `safeFriendRedirect`: allow only `/profile` or `/players/{uuid}`. Used for friend mutation `redirect` (success/error bounce). Default `/profile`.
- Do **not** switch `withReturnTo`, `authErrorRedirect`, or the six auth pages/routes in this phase — that is Phase 3. Adding `safeAuthReturnTo` here is enough for friend `signIn` URLs.
- Do **not** copy `commentUnauthorized` (`src/lib/comment-mutation-http.ts` hardcodes `/runs/{id}`).

#### 3. Friend APIs

**Files**: `src/pages/api/friends/request.ts`, `accept.ts`, `decline.ts`, `cancel.ts`, `unfriend.ts` (all new, uppercase `POST`)

**Intent**: Form-POST mutations with JSON or redirect, matching profile/run APIs. No new protected **pages**.

**Contract**: `user_id` (request/unfriend) or `request_id` (accept/decline/cancel) in FormData. Unauthenticated → `/auth/signin` with JSON `{ error, signIn }` via `wantsJson` / `commentJson`. Build `signIn` with `safeAuthReturnTo` on the intended player path (typically `/players/{uuid}` from the form `redirect` when that path is a player URL); if `safeAuthReturnTo` returns null, `signIn` is `/auth/signin` with no `returnTo`. Never call `commentUnauthorized`. `ensureOwnProfile` catch → fixed "Could not prepare your profile". `FriendsError` → that message. Other errors → log + generic "Could not update friend request". Success notices: "Friend request sent.", "Friend request accepted.", "Friend request declined.", "Friend request cancelled.", "Friend removed." Mutation `redirect` via `safeFriendRedirect` only (`/profile` or `/players/{uuid}`); default `/profile`. Support `Accept: application/json` so Phase 3 can POST without a full navigation. Banned: existing middleware gate.

#### 4. `/profile` inbox

**Files**: `src/pages/profile.astro`; `src/components/profile/FriendsInbox.astro` (new, Astro — native forms, no island)

**Intent**: Private request inbox on the signed-in editor. Unverified members see a short explanation, not lists or buttons.

**Contract**: After existing own-profile load, if `own.isVerified`, load incoming + outgoing pending. Render below `OwnProfileForm` (page can widen from `max-w-xl` if the inbox needs it). Incoming row: `NicknameLink.astro` + Accept form + Decline form (hidden `request_id` from the list row `id`). Outgoing row: NicknameLink + Cancel form (hidden `request_id` from the list row `id`). Empty state copy when verified and no pending. Unverified: one sentence that friends require verification — no Add-friend affordance. Reuse `Banner` for `?notice=` / `?error=`. Do not list accepted friends here (that list is public on `/players/{id}`). Optional text link to the viewer's public profile via `playerProfileHref(user.id)`.

#### 5. Docs

**Files**: `AGENTS.md`; `README.md`

**Intent**: Later agents must not invent a second friends URL or protect `/players/{id}`.

**Contract**: AGENTS Hard Rules: `/players/{id}` stays public; friend mutations are `POST /api/friends/*`; inbox is on `/profile`. README: verified members add friends from public profiles; requests live on Profile.

### Success Criteria:

#### Automated Verification:

- `src/lib/services/friends.ts` and the five `POST /api/friends/*` routes exist
- `/profile` loads inbox queries only for verified viewers (grep / read)
- `safeRunReturnTo` still only allows `/runs/{uuid}` (friend mutation redirect is `safeFriendRedirect`; `safeAuthReturnTo` exists but auth hops are switched in Phase 3)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Unverified `/profile`: explanation, no accept/decline/cancel
- Verified: SQL-insert a pending row toward the user → inbox shows Accept/Decline; Accept → both are friends (`are_friends` true); Decline → not friends; sender Cancel removes the pending row
- Unauthenticated POST `/api/friends/request` → sign-in
- Banned POST still hits "Your account is banned"
- Failed mutation shows a friendly `?error=` string, never a PostgREST body
- http://localhost:4321/profile (after `npm run dev` + local Supabase)

**Implementation Note**: After this phase and automated verification, pause for the inbox smoke before Phase 3.

---

## Phase 3: Public friends list and Add / Accept / Remove

### Overview

Put the accepted list and the verified CTAs on `/players/{id}` without leaking pending names.

### Changes Required:

#### 1. Public page list + relationship

**File**: `src/pages/players/[id].astro`

**Intent**: FR-018 nicknames on the friends list; FR-019 Add friend on someone else's public profile.

**Contract**: After `getPublicProfile`, `listPublicFriends`. New "Friends" section with `NicknameLink.astro` (or "No friends yet"). Do not query `friend_requests` on this page for listing — only `public_friendships`. For the signed-in viewer who is **not** this profile: load viewer verification with `getOwnProfile(supabase, user.id)` (already used on `/profile`); do **not** extend `locals.profile`. If that viewer is verified **and** the subject is verified, call `getRelationship` and pass `{ relationship: status, requestId }` into `FriendActions`. Own public page: keep "Edit your profile"; **no** pending inbox, **no** Add friend. Guest / unverified viewer / unverified subject: list only, no forms. Invalid uuid / missing player still 404 as today. Do not add a page `Banner` for `?notice=` / `?error=` on this file.

#### 2. Public CTAs

**File**: `src/components/profile/FriendActions.tsx` (new React island, `client:load`)

**Intent**: One interactive control on an otherwise static page. Astro forms would work, but relationship-specific labels (Add vs Accept) plus JSON errors match `RunParticipantActions`.

**Contract**: Props: `targetUserId`, `relationship: "none" | "outgoing_pending" | "incoming_pending" | "accepted"`, `requestId: string | null` (from `getRelationship`; required for Accept). Render:

- `none` → POST `/api/friends/request` with `user_id`, button **Add friend**
- `outgoing_pending` → disabled "Request sent" (cancel stays on `/profile`)
- `incoming_pending` → POST `/api/friends/accept` with `request_id` (the `requestId` prop), button **Accept request** (not "Add friend")
- `accepted` → POST `/api/friends/unfriend` with `user_id`, button **Remove friend**

Keep these three public buttons on these three endpoints. `fetchFormJson` + `ServerError`; on success `reloadKeepingScroll` (no page Banner on `[id].astro`). Hidden `redirect` = `/players/{uuid}` (validated by `safeFriendRedirect` on the API). Sign-in JSON `signIn` must use `safeAuthReturnTo` / `withReturnTo` so `returnTo=/players/{uuid}` survives login — not `commentUnauthorized`.

#### 3. Auth return-to (switch hops to `safeAuthReturnTo`)

**Files**: `src/lib/safe-return-to.ts`; `src/pages/api/auth/signin.ts`; `src/pages/api/auth/signup.ts`; `src/pages/api/auth/dev-quick-login.ts`; `src/pages/auth/signin.astro`; `src/pages/auth/signup.astro`; `src/pages/auth/confirm-email.astro`

**Intent**: Friend `?returnTo=/players/{uuid}` must survive sign-in/sign-up/confirm without turning `safeRunReturnTo` into an open-ended allowlist.

**Contract**: Switch `withReturnTo`, `authErrorRedirect`, and the six auth pages/routes listed above from `safeRunReturnTo` to `safeAuthReturnTo` (read query/form `returnTo` with `safeAuthReturnTo`; helpers internally call `safeAuthReturnTo`). Keep `safeRunReturnTo` runs-only — `src/pages/api/profile/nickname.ts` must still import it. `signup.ts` confirm-email hop must keep the player returnTo through `withReturnTo("/auth/confirm-email", returnTo)` (after the switch, `withReturnTo` preserves `/players/{uuid}`). `RunParticipantActions` already passes `/runs/{id}` into `withReturnTo` — that bounce stays valid. Do not allow `/profile` in `safeAuthReturnTo`.

#### 4. Cross-pending send

**File**: `src/lib/services/friends.ts` (`sendFriendRequest` already specified in Phase 2)

**Intent**: If the island only has `none` vs `incoming_pending`, Add friend never double-sends. Keep the service accept-if-incoming anyway so a stale "Add friend" form cannot create a unique-index fight.

**Contract**: No extra UI. Confirm with a manual race: two tabs, both Add, second call accepts or returns already-friends / already-sent — never two pending rows.

### Success Criteria:

#### Automated Verification:

- `/players/[id].astro` renders a Friends section and does not SELECT `friend_requests` for the public list
- `FriendActions` exists; guest/unverified/own-public paths do not mount Add friend
- `/players` is still absent from `PROTECTED_ROUTES`
- `withReturnTo`, `authErrorRedirect`, and the six auth pages/routes use `safeAuthReturnTo`; `nickname.ts` still uses `safeRunReturnTo`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest `/players/{verified}`: friends as NicknameLinks; no Add/Accept/Remove; no pending names; click a friend nick → that public profile
- Unverified signed-in viewer: same, no controls
- Verified A on verified B: Add friend → B's `/profile` inbox → Accept → both public lists show each other
- Verified A on verified B after B requested A: button is **Accept request**; click accepts
- Remove friend: lists update; either may Add again (new INSERT)
- After decline: A can Add again (row reopens to pending)
- Unverified public profile: no Add friend even for a verified viewer
- Own `/players/{self}`: friends list + Edit your profile; no pending section
- http://localhost:4321/players/{uuid} and http://localhost:4321/profile

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`

### Integration Tests:

- None. Rely on `npx supabase db reset`, `npm run db:types`, `npm run lint`, `npm run build`, and the SQL/UI checks per phase

### Manual Testing Steps:

1. Start local Supabase + `npm run dev`; open [http://localhost:4321](http://localhost:4321)
2. Two verified members: A adds B from `/players/{B}`; B accepts on `/profile`; both public lists show the other
3. Incoming on B's public page shows Accept request, not Add friend
4. A cancels outgoing from `/profile` before B acts; B's inbox empties
5. B declines; A adds again; B accepts
6. Remove friend from the public page; lists clear
7. Unverify B (admin): A's public list no longer shows B; `are_friends` false; accepted row still in SQL; re-verify restores the list without a new request
8. Guest sees friends lists only; `/profile` still requires sign-in

## Performance Considerations

KoG scale is small. `listPublicFriends` is a view lookup by `user_id` plus nickname join — index `friend_requests` sender/receiver. Do not N+1 `getPublicProfile` per friend. `are_friends` is `exists` + two verified lookups; S-15 will call it in RLS later, so keep it `STABLE` / initplan-friendly (`(select auth.uid())` is not needed inside the helper because ids are arguments).

## Migration Notes

Additive: new enum, table, view, function. No backfill. Existing users have zero friends. Rollback locally is `db reset`; production revert would drop the view/function/table/enum in a follow-up migration. Do not drop `public_profiles`. Unfriend is DELETE — no `ended` status to migrate later. S-15 should call `are_friends(organizer, viewer)` (and still add its own run-visibility policies); this slice does not change `runs`.

## References

- PRD: `context/foundation/prd.md` (US-04, FR-019)
- Roadmap: `context/foundation/roadmap.md` (S-11)
- Lessons: `context/foundation/lessons.md` (`?error=` copy)
- Archived S-10: `context/archive/2026-08-20-user-profile/plan.md`
- Public profile: `src/pages/players/[id].astro`
- Own profile: `src/pages/profile.astro`
- Profile APIs: `src/pages/api/profile/points.ts`
- Return-to helpers: `src/lib/safe-return-to.ts` (`safeRunReturnTo` stays runs-only; this slice adds `safeAuthReturnTo` + `safeFriendRedirect`)
- RLS twins: `supabase/migrations/20260820071325_user_profile_identity.sql`, `supabase/migrations/20260820092809_run_comments.sql`
- DEFINER helper shape: `supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Friend schema, RLS, public list view, are_friends

#### Automated

- [x] 1.1 Migration exists under supabase/migrations/ with RLS per operation, no anon grant on friend_requests, view column list only user_id + friend_id — 44e3f49
- [x] 1.2 npx supabase db reset (or project-equivalent apply) succeeds locally — 44e3f49
- [x] 1.3 npm run db:types includes friend_requests, public_friendships, friend_request_status, are_friends — 44e3f49
- [x] 1.4 npm run lint passes — 44e3f49
- [x] 1.5 npm run build passes — 44e3f49

#### Manual

- [x] 1.6 SQL: verified sender INSERT pending succeeds; unverified sender or unverified receiver INSERT fails RLS — 44e3f49
- [x] 1.7 SQL: self-request fails the check constraint — 44e3f49
- [x] 1.8 SQL: second live row for the same unordered pair fails the unique index — 44e3f49
- [x] 1.9 SQL: receiver can UPDATE pending to accepted or declined; sender cannot accept their own row — 44e3f49
- [x] 1.10 SQL: sender DELETE pending succeeds; receiver cannot DELETE pending — 44e3f49
- [x] 1.11 SQL: either party DELETE accepted succeeds; UPDATE accepted fails the trigger — 44e3f49
- [x] 1.12 SQL: declined row UPDATE to pending with swapped sender succeeds; INSERT of a second pair row fails unique — 44e3f49
- [x] 1.13 SQL: anon SELECT friend_requests fails; anon SELECT public_friendships returns only accepted pairs where both are verified — 44e3f49
- [x] 1.14 SQL: after unverify of one party, public_friendships and are_friends hide that edge; the friend_requests accepted row still exists — 44e3f49

### Phase 2: Friends service, POST APIs, /profile inbox

#### Automated

- [x] 2.1 src/lib/services/friends.ts and the five POST /api/friends/* routes exist — 40ce641
- [x] 2.2 /profile loads inbox queries only for verified viewers — 40ce641
- [x] 2.3 safeRunReturnTo still only allows /runs/{uuid} (friend mutation redirect is safeFriendRedirect; safeAuthReturnTo exists but auth hops are switched in Phase 3) — 40ce641
- [x] 2.4 npm run lint passes — 40ce641
- [x] 2.5 npm run build passes — 40ce641

#### Manual

- [ ] 2.6 Unverified /profile: explanation, no accept/decline/cancel
- [ ] 2.7 Verified inbox accept, decline, and cancel behave as specified
- [ ] 2.8 Unauthenticated POST /api/friends/request redirects to sign-in
- [ ] 2.9 Banned POST still hits Your account is banned
- [ ] 2.10 Failed mutation shows a friendly ?error= string, never a PostgREST body
- [ ] 2.11 http://localhost:4321/profile (after npm run dev + local Supabase)

### Phase 3: Public friends list and Add / Accept / Remove

#### Automated

- [x] 3.1 /players/[id].astro renders a Friends section and does not SELECT friend_requests for the public list — a894374
- [x] 3.2 FriendActions exists; guest/unverified/own-public paths do not mount Add friend — a894374
- [x] 3.3 /players is still absent from PROTECTED_ROUTES — a894374
- [x] 3.4 withReturnTo, authErrorRedirect, and the six auth pages/routes use safeAuthReturnTo; nickname.ts still uses safeRunReturnTo — a894374
- [x] 3.5 npm run lint passes — a894374
- [x] 3.6 npm run build passes — a894374

#### Manual

- [ ] 3.7 Guest public profile: friends as NicknameLinks; no Add/Accept/Remove; no pending names
- [ ] 3.8 Unverified signed-in viewer: list only, no controls
- [ ] 3.9 Verified A adds B; B accepts; both public lists show each other
- [ ] 3.10 Incoming on the public page is labeled Accept request and accepts
- [ ] 3.11 Remove friend updates lists; either may Add again
- [ ] 3.12 After decline, sender can Add again
- [ ] 3.13 Unverified subject: no Add friend for a verified viewer
- [ ] 3.14 Own /players/{self}: friends list + Edit your profile; no pending section
- [ ] 3.15 http://localhost:4321/players/{uuid} and http://localhost:4321/profile
