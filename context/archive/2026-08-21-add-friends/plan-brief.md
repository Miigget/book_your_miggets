# Add verified friends — Plan Brief

> Full plan: `context/changes/add-friends/plan.md`

## What & Why

Verified members need a mutual friends graph so they can send, accept, or decline requests and see accepted friends on the profile (US-04 / FR-019). Unverified accounts stay out of the live graph so S-15 private runs cannot leak through fake friends. Pending and declined are not friendships.

## Starting Point

S-10 shipped `/profile` and `/players/{uuid}` with `public_profiles` (including `is_verified`). There is no friends table, API, or UI. Profile POST + `?error=` and comment/run form JSON are the mutation patterns to copy.

## Desired End State

On someone else's public profile, a verified member sees Add friend, Accept request, or Remove friend. Everyone (including guests) sees the accepted friends list as nickname links. Incoming/outgoing pending live only on `/profile`. Unverify hides a person from the live graph without deleting the accepted row.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Schema | One `friend_requests` table (`pending` \| `accepted` \| `declined`) | Copies `nickname_change_requests`; S-15 can query accepted rows | Plan |
| Pair uniqueness | One row per unordered pair (all statuses) | Re-request UPDATEs declined in place; cancel/unfriend DELETE | Plan |
| Unfriend | DELETE accepted row | Keeps the unique index simple; either party may send again | Plan |
| Public list | `/players/{id}` including guests | FR-018 nickname links; KoG trust-graph is public | Plan |
| Requests | Private to the two participants | Pending names must not appear on a guest-readable page | Plan |
| Cross-pending | Add friend accepts incoming | Unique pair stays one row; button copy is Accept request | Plan |
| Unverify | Keep rows; live graph requires both verified | No destructive trigger; re-verify restores the edge | Plan |
| Surfaces | Add/Remove/Accept on `/players/{id}`; inbox on `/profile` | Matches S-10 public vs signed-in split | Plan |
| Cancel | Sender DELETEs pending | Mirrors apply/withdraw; declined stays a receiver action | Plan |
| S-15 hook | `are_friends()` + `public_friendships` view now | Canonical definition without shipping run visibility | Plan |
| Phases | Schema → inbox+APIs → public CTAs | Same sequencing as archived S-10 | Plan |
| Auth vs friend redirects | `safeAuthReturnTo` (runs or players) for sign-in hops; `safeFriendRedirect` (profile or players) for mutation `redirect`; `safeRunReturnTo` stays runs-only | Expired-session Add friend returns to `/players/{uuid}` without breaking 2.3 or `nickname.ts` | Plan-review F1 |
| Public Accept id | `getRelationship` → `{ status, requestId }`; same `id` on inbox rows | Three public buttons stay on three endpoints; `[id].astro` passes `requestId` into `FriendActions` | Plan-review F2 |
| Viewer verified | `getOwnProfile` on `[id].astro`; island `ServerError` + `reloadKeepingScroll`; no Banner / no `locals.profile` change | `is_verified` is not on middleware profile; the public page has no Banner today | Plan-review F4 |

## Scope

**In scope:** Verified send/accept/decline/cancel/unfriend; public accepted list; private inbox; RLS + guest-safe view; `are_friends()`.

**Out of scope:** Friends-only / invite-only runs (S-15); activity feeds; admin graph UI; protecting `/players/{id}`.

## Architecture / Approach

Cookie SSR + form POST. Writes go to `friend_requests` under participant RLS (`public_profiles` for verification). Guests read `public_friendships` (`security_invoker = false`) joined to nicknames. `/profile` inbox is Astro forms. Public CTAs are a small React island (`ServerError` + reload). Domain errors use `FriendsError` and fixed `?error=` copy. Three allowlists in `safe-return-to.ts`: `safeRunReturnTo` (runs), `safeAuthReturnTo` (runs or players; auth hops in Phase 3), `safeFriendRedirect` (profile or players; mutation `redirect`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema / RLS / view / helper | Table, unique pair, guest view, `are_friends()` | Anon SELECT on the table would leak pending requests |
| 2. Service + APIs + `/profile` inbox | Mutations + private pending lists + `safeFriendRedirect` / `safeAuthReturnTo` helpers | Raw PostgREST in `?error=`; unverified seeing inbox; widening `safeRunReturnTo` |
| 3. `/players/{id}` list + CTAs | Public friends + Add/Accept/Remove; auth hops → `safeAuthReturnTo` | Pending names on the public page; Add vs Accept missing `requestId`; player `returnTo` stripped if hops stay on `safeRunReturnTo` |

**Prerequisites:** S-10 archived (public profile + `is_verified`). Local Supabase for `db reset` + `npm run db:types`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- `are_friends()` is unused by run RLS until S-15; shipping it now is a contract, not a behavior change on `/runs`.
- Admin SELECT on `friend_requests` is for debugging only — no admin friends UI.
- Implementer must not fold player paths into `safeRunReturnTo` (criterion 2.3); Phase 3 switches auth hops to `safeAuthReturnTo`. `signup.ts` must keep player returnTo through `withReturnTo("/auth/confirm-email", returnTo)`.
- YOLO: phase-end manual SQL/UI checks are listed in Progress; the implementer still runs them.

## Success Criteria (Summary)

- Two verified members can request, accept, decline, cancel, and unfriend.
- Guests see accepted friends on `/players/{id}` and never see pending requests.
- Unverified members cannot join the live graph; unverify hides existing edges until re-verify.
