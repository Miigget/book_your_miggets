<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Add verified friends

- **Plan**: context/changes/add-friends/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Extra `friend-mutation-http.ts` shared helper

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/friend-mutation-http.ts:18
- **Detail**: Plan listed five `POST /api/friends/*` files with the mutation contract inlined (profile/run API skeleton) and said not to copy `commentUnauthorized`. Implementation adds an unplanned `postFriendMutation` helper, analogous to `comment-mutation-http.ts`, and the five routes are 12-line wrappers. The helper still implements the planned contract: `safeFriendRedirect` (default `/profile`), `safeAuthReturnTo` for `signIn` (no `/profile` returnTo), JSON `{ error, signIn }` / `{ ok: true }` via `wantsJson`/`commentJson`, `ensureOwnProfile` → "Could not prepare your profile", `FriendsError.message` or generic "Could not update friend request", `console.error` for raw failures, never `commentUnauthorized`. Not a new product surface.
- **Fix**: Keep the helper. Optionally add a plan addendum that friend APIs share `postFriendMutation` the same way run/comment APIs share `comment-mutation-http`.
- **Decision**: PENDING

## Verification

### Automated

| Check | Result |
|-------|--------|
| 2.1 `friends.ts` + five `POST /api/friends/*` | Pass. Service + `request` / `accept` / `decline` / `cancel` / `unfriend` exist; all export uppercase `POST`. |
| 2.2 `/profile` inbox queries only for verified | Pass. `profile.astro` calls `listIncomingPending` / `listOutgoingPending` only inside `if (own.isVerified)`. Unverified still renders `FriendsInbox` with the explanation branch and no forms. |
| 2.3 `safeRunReturnTo` still runs-only | Pass. `RUN_RETURN_TO_RE` unchanged. `withReturnTo` / `authErrorRedirect` / auth pages still use `safeRunReturnTo` (Phase 3). `safeAuthReturnTo` and `safeFriendRedirect` exist. Friend `signIn` uses `safeAuthReturnTo` only. |
| 2.4 `npm run lint` | Pass (0 errors). New `no-console` warnings are the required `console.error` paths (lesson: do not echo raw infra errors). |
| 2.5 `npm run build` | Pass. |

### Manual (YOLO skipped UI click-throughs — residual risk, not missing code)

| Progress | Code-side evidence | Live UI |
|----------|--------------------|---------|
| 2.6 Unverified `/profile`: explanation, no accept/decline/cancel | Present. `FriendsInbox` `!verified` sentence; no Accept/Decline/Cancel markup in that branch; queries not loaded. | Not click-tested this review. |
| 2.7 Verified inbox accept / decline / cancel | Present. Incoming: POST accept/decline with hidden `request_id` + `redirect=/profile`. Outgoing: POST cancel. Service: receiver pending → accepted/declined; sender DELETE pending; empty `.select()` → domain error. | Not SQL-seeded + clicked this review. |
| 2.8 Unauthenticated POST `/api/friends/request` → sign-in | Present. `postFriendMutation` redirects HTML to `/auth/signin` (plus `returnTo` only when `safeAuthReturnTo` accepts the form `redirect`); JSON 401 `{ error, signIn }`. | Not HTTP-probed this review. |
| 2.9 Banned POST still "Your account is banned" | Present. Existing middleware gate: POST `/api/*` except `/api/auth/` when `isBanned`. Friend routes are under `/api/friends/*`. | Not HTTP-probed this review. |
| 2.10 Failed mutation friendly `?error=`, never PostgREST | Present. `fail()` uses `FriendsError.message` or fixed strings; raw errors only `console.error`. Matches `context/foundation/lessons.md`. | Not UI-probed this review. |
| 2.11 http://localhost:4321/profile | Not opened this review (YOLO human-action skip). | Residual. |

Progress 2.6–2.11 left `[ ]` on purpose (YOLO). Implementation of the automated/code side is not missing.

## Plan vs diff

Commit `40ce641` on `feature/add-friends`.

- In plan and in diff: `src/lib/services/friends.ts` — MATCH. `FriendsError` same shape as `ProfileError`. `getRelationship` returns `{ status, requestId }` with pending ids only; declined maps to `none` (exported union omits `declined`, which matches Phase 3 `FriendActions` props). Unverified either party → `{ status: "none", requestId: null }`. `listPublicFriends` from `public_friendships` + batched `public_profiles` nicknames, uuid guard, nickname nulls-last. Inbox lists skip unverified counterparties. `sendFriendRequest`: reject self/invalid uuid, both verified, accept-if-incoming, already-friends / already-sent, reopen declined (swap sender), else INSERT; `23505` re-read maps to those messages or accept/reopen. Accept/decline/cancel/unfriend check `.select()` row counts. `isUuid` from `@/lib/services/runs`. Pages/APIs do not speak PostgREST.
- In plan and in diff: `src/lib/safe-return-to.ts` — MATCH. Three allowlists. `safeRunReturnTo` not widened. `safeAuthReturnTo` = `/runs/{uuid}` or `/players/{uuid}`, not `/profile`. `safeFriendRedirect` = `/profile` or `/players/{uuid}`.
- In plan and in diff: five `src/pages/api/friends/*.ts` — MATCH (via helper). FormData `user_id` / `request_id`. Notices: "Friend request sent.", "Friend request accepted.", "Friend request declined.", "Friend request cancelled.", "Friend removed."
- In plan and in diff: `src/pages/profile.astro` + `src/components/profile/FriendsInbox.astro` — MATCH. Astro native forms, no island. Below `OwnProfileForm`. Page widened `max-w-xl` → `max-w-2xl`. Banner `?notice=` / `?error=`. Unverified explanation. Empty state when verified and no pending. Optional public-profile link via `playerProfileHref`. Does not list accepted friends. `/players/{id}` still absent from `PROTECTED_ROUTES`.
- In plan and in diff: `AGENTS.md` / `README.md` — MATCH. `/players/{id}` stays public; mutations `POST /api/friends/*`; inbox on `/profile`.
- In plan, not in this phase: public list CTAs, `FriendActions`, switching auth hops to `safeAuthReturnTo` — expected Phase 3. `listPublicFriends` / `getRelationship` are in the service for Phase 3 to call.
- In diff, not in plan: `src/lib/friend-mutation-http.ts` — EXTRA, see F1. `context/changes/add-friends/plan.md` Progress stamps — ritual, not product scope.

## Safety notes (not findings)

- Lessons `?error=` rule is followed at the HTTP boundary. `FriendsError` copy is fixed strings only.
- Open redirects: friend bounce and auth `signIn` go through the two new allowlists. Inbox forms use `redirect=/profile`; unauthenticated HTML from that path signs in with no `returnTo` (plan: `safeAuthReturnTo` null → `/auth/signin`).
- `are_friends()` is not called from app code or from `friend_requests` policies (Phase 1 constraint still holds).
- Phase 2 does not weaken Phase 1 RLS. Service-level `requireBothVerified` on send/accept is load-bearing for the live-graph rule because the accept UPDATE policy does not re-check `public_profiles`.
- `loadPairRow` `.in(sender).in(receiver)` is safe under the unordered unique index (at most one pair row).
- Import of `wantsJson`/`commentJson` from `comment-mutation-http.ts` is the existing cross-feature pattern (`apply.ts`, `withdraw.ts`, …), not a comments-domain leak into friends.

## Decision

YOLO path: Done (no triage). `change.md` stays `implementing` — this is a phase review, not a full-plan impl-review.
