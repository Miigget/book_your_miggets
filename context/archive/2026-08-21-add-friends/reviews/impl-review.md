<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Add verified friends

- **Plan**: context/changes/add-friends/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation
- **Commits**: 44e3f49 (p1), 40ce641 (p2), a894374 (p3) on `feature/add-friends`

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

### F1 — YOLO skipped live UI manuals 2.6–2.11 and 3.7–3.15 (code-side MATCH)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A
- **Detail**: Progress 2.6–2.11 and 3.7–3.15 remain `[ ]`. YOLO skipped human-action browser/HTTP gates (and the two-tab Add race). This is not rubber-stamping of missing code: inbox gating, five `POST /api/friends/*` contracts, public list from `public_friendships` only, Add vs Accept vs Remove, `safeAuthReturnTo` hops, and accept-if-incoming / declined-reopen are in `40ce641` + `a894374`. Phase 1 SQL smokes 1.6–1.14 were re-run in the phase-1 review and stay `[x]`. Residual risk is live two-account / unverify / banned-POST eyeballing only. Do not REJECT for this. Carried from impl-review-phase-2.md and impl-review-phase-3.md; full sweep still MATCH.
- **Fix**: None required for full-plan close. Optional live smoke of 2.7–2.10, 3.9–3.12, and 3.15 before archive if a human pass is wanted.
- **Decision**: PENDING

## Verification

### Automated (re-run this review unless noted)

| Check | Result |
|-------|--------|
| 1.1 Migration + RLS + grants + view columns | Pass. `supabase/migrations/20260821111120_friend_requests.sql`: enum, table, unordered unique index, 7 named policies `TO authenticated`, `revoke` `public`+`anon` on the table, `public_friendships` columns only `user_id` + `friend_id`. |
| 1.2 `npx supabase db reset` | Not re-run (destructive). Applied and smoked in phase-1 review (`44e3f49`). File unchanged since. |
| 1.3 Types include table / view / enum / `are_friends` | Pass. Committed `src/types/database.ts` has `friend_requests`, `public_friendships`, `friend_request_status`, `are_friends`. |
| 2.1 Service + five `POST /api/friends/*` | Pass. `friends.ts` + `request` / `accept` / `decline` / `cancel` / `unfriend` export uppercase `POST`. |
| 2.2 `/profile` inbox queries only for verified | Pass. `listIncomingPending` / `listOutgoingPending` only inside `if (own.isVerified)`. |
| 2.3 `safeRunReturnTo` still runs-only | Pass. `RUN_RETURN_TO_RE` unchanged. Friend bounce is `safeFriendRedirect`; auth hops use `safeAuthReturnTo` (Phase 3). `nickname.ts` still imports `safeRunReturnTo`. |
| 3.1 Friends section; no `friend_requests` SELECT for the public list | Pass. `[id].astro` uses `listPublicFriends`. No `friend_requests` string on the page. |
| 3.2 `FriendActions`; guest/unverified/own-public do not mount Add friend | Pass. Island only when `user && user.id !== profile.id` and both viewer + subject are verified. |
| 3.3 `/players` absent from `PROTECTED_ROUTES` | Pass. List unchanged; no `/players` prefix. |
| 3.4 Auth hops use `safeAuthReturnTo`; nickname stays `safeRunReturnTo` | Pass. See locked checks. |
| 1.4 / 2.4 / 3.5 `npm run lint` | Pass (0 errors, 72 `no-console` warnings repo-wide). New `console.error` sites are the required lesson path. |
| 1.5 / 2.5 / 3.6 `npm run build` | Pass. |

### Manual

Phase 1 SQL (1.6–1.14): `[x]` — re-run in impl-review-phase-1.md against local Postgres; not repeated here.

Phase 2–3 UI (2.6–2.11, 3.7–3.15): left `[ ]` on purpose (YOLO). Code-side evidence:

| Progress | Result |
|----------|--------|
| 2.6 Unverified `/profile`: explanation, no accept/decline/cancel | MATCH. `FriendsInbox` `!verified` sentence; no forms in that branch; queries not loaded. |
| 2.7 Verified inbox accept / decline / cancel | MATCH. Incoming POST accept/decline with `request_id`; outgoing POST cancel. Service checks `.select()` row counts. Live not smoked (F1). |
| 2.8 Unauthenticated POST `/api/friends/request` → sign-in | MATCH. HTML redirect / JSON 401 `{ error, signIn }` via `safeAuthReturnTo`. Not HTTP-probed (F1). |
| 2.9 Banned POST still "Your account is banned" | MATCH. Existing middleware POST `/api/*` except `/api/auth/` when `isBanned`. Friend routes are under `/api/friends/*`. |
| 2.10 Failed mutation friendly `?error=`, never PostgREST | MATCH. `fail()` uses `FriendsError.message` or fixed strings; raw errors only `console.error`. Lessons.md followed. |
| 2.11 localhost `/profile` | Not opened (F1). |
| 3.7 Guest public profile: NicknameLinks; no Add/Accept/Remove; no pending names | MATCH. List from `public_friendships` (accepted + both verified). `friendCta` requires `user`. |
| 3.8 Unverified signed-in viewer: list only | MATCH. `own.isVerified` gate before `getRelationship`. |
| 3.9 Verified A adds B; B accepts; both lists show each other | Branch MATCH. Live two-account flow not smoked (F1). |
| 3.10 Incoming public CTA is **Accept request** and accepts | MATCH. `incoming_pending` → POST `/api/friends/accept` with `request_id`; label **Accept request**. |
| 3.11 Remove friend; either may Add again | MATCH. Unfriend is DELETE; unique index frees a later INSERT. Live not smoked (F1). |
| 3.12 After decline, sender can Add again | MATCH. `getRelationship` maps declined → `none`; `sendFriendRequest` reopens. Live not smoked (F1). |
| 3.13 Unverified subject: no Add friend for a verified viewer | MATCH. `profile.isVerified` required with viewer verification. |
| 3.14 Own `/players/{self}`: friends list + Edit; no pending section | MATCH. `isOwnProfile` edit link; island skipped; no inbox on this page. |
| 3.15 localhost players + profile URLs | Not opened (F1). |

Phase 3 item 4 (two-tab Add race): `sendFriendRequest` still accept-if-incoming / already-friends / already-sent; unique index remains the backstop. Live race not run.

## Locked checks

- `PROTECTED_ROUTES` = `/dashboard`, `/runs/new`, `/admin`, `/runs/history`, `/profile` plus `/runs/{id}/edit`. `/players` not gated. `locals.profile` still `{ role, isBanned, nickname }` — not extended.
- `safeRunReturnTo` still `/^\/runs\/{uuid}$/`. `safeAuthReturnTo` = `/runs/{uuid}` **or** `/players/{uuid}` only — not `/profile`. `safeFriendRedirect` = `/profile` or `/players/{uuid}`.
- `withReturnTo` / `authErrorRedirect` call `safeAuthReturnTo`. Six hops switched: `signin.ts`, `signup.ts`, `dev-quick-login.ts`, `signin.astro`, `signup.astro`, `confirm-email.astro`. `signup.ts` still `withReturnTo("/auth/confirm-email", returnTo)`. `RunParticipantActions` still passes `/runs/{id}` into `withReturnTo`. Friend APIs never call `commentUnauthorized`.
- Public list cannot leak pending names: `public_friendships` is accepted + both currently verified; `[id].astro` does not SELECT `friend_requests` for listing. No page Banner on `[id].astro`.
- `are_friends()` is not called from app code or from `friend_requests` policies. No `runs` policy edits. DTOs live in `src/lib/services/friends.ts` (no `src/types.ts`).
- Lessons `?error=` rule holds at the friend HTTP boundary. Pre-existing `signin.ts` / `signup.ts` Auth `error.message` in `?error=` was not introduced here (Phase 3 only switched `returnTo`).

## Plan vs diff

Commits `44e3f49`, `40ce641`, `a894374` on `feature/add-friends`.

### In plan and in diff — MATCH

- `supabase/migrations/20260821111120_friend_requests.sql` — enum, table, self-check, unordered unique index, sender/receiver/pending-inbox indexes, revoke `public`+`anon`, grant DML to `authenticated`, 7 named policies using `(select auth.uid())` and `public_profiles` for verification, `public_friendships` (`security_invoker = false`, two rows per live edge, both-verified join), `are_friends` (`STABLE` `SECURITY DEFINER` `search_path = ''`, execute to `authenticated` only). Trigger control flow matches the plan snippet plus the phase-1 extra status-machine guards (keep).
- `src/types/database.ts` — generated table, view, enum, `are_friends` args. Not hand-edited.
- `src/lib/services/friends.ts` — `FriendsError` same shape as `ProfileError`. `getRelationship` → `{ status, requestId }` with pending ids only; declined maps to `none`; unverified either party → none. `listPublicFriends` from `public_friendships` + batched nicknames, uuid guard, nickname nulls-last. Inbox lists skip unverified counterparties. `sendFriendRequest`: reject self/invalid uuid, both verified, accept-if-incoming, already-friends / already-sent, reopen declined (swap sender), else INSERT; `23505` re-read maps to those messages or accept/reopen. Accept/decline/cancel/unfriend check `.select()` row counts. `isUuid` from `@/lib/services/runs`. Pages/APIs do not speak PostgREST.
- `src/lib/safe-return-to.ts` — three allowlists; `safeRunReturnTo` not widened.
- Five `src/pages/api/friends/*.ts` — FormData `user_id` / `request_id`. Notices: "Friend request sent.", "Friend request accepted.", "Friend request declined.", "Friend request cancelled.", "Friend removed."
- `src/pages/profile.astro` + `src/components/profile/FriendsInbox.astro` — Astro native forms, no island. Below `OwnProfileForm`. Page widened `max-w-xl` → `max-w-2xl`. Banner `?notice=` / `?error=`. Unverified explanation. Empty state when verified and no pending. Public-profile link via `playerProfileHref`. Does not list accepted friends.
- `AGENTS.md` / `README.md` — `/players/{id}` stays public; mutations `POST /api/friends/*`; inbox on `/profile`.
- `src/pages/players/[id].astro` — Friends section; `getOwnProfile` for viewer verification; `getRelationship` only for verified other-viewer; no pending inbox; 404 still for missing player.
- `src/components/profile/FriendActions.tsx` — props `targetUserId`, `relationship`, `requestId`. Buttons: **Add friend** / disabled **Request sent** / **Accept request** / **Remove friend**. `fetchFormJson` + `ServerError` + `reloadKeepingScroll` + `client:load`. Hidden `redirect` = `/players/{uuid}`.

### In diff, not in plan — EXTRA (accepted in phase reviews; not product surface)

- `src/lib/friend-mutation-http.ts` — `postFriendMutation` DRY helper (same shape as `comment-mutation-http.ts`). Crew keep (impl-p2-F1). Still implements the planned contract.
- BEFORE UPDATE extra `pending`→`accepted|declined` and `declined`→`pending` guards — close a Postgres RLS OR-compose hole. Crew keep (impl-p1-F1). Load-bearing; do not drop.
- `context/changes/add-friends/*` plan/review/crew docs — 10x ritual, not product scope creep.

### In plan, not missing

No planned product file is absent. Phase 3 item 4 (`sendFriendRequest` accept-if-incoming) landed in Phase 2 as specified.

### What we're NOT doing — MATCH

No friends-only / invite-only run visibility; `are_friends()` not wired into `runs` policies; no activity feed / DM / blocking; no admin graph UI; no pending names on `/players/{id}`; `/players/{id}` not added to `PROTECTED_ROUTES`; no Vitest; no `src/types.ts` friend DTOs.

## Previously accepted (phase reviews)

- **impl-review-phase-1.md APPROVED** — extra trigger status-machine guards (OBSERVATION, keep).
- **impl-review-phase-2.md APPROVED** — extra `friend-mutation-http.ts` (OBSERVATION, keep).
- **impl-review-phase-3.md APPROVED** — YOLO manuals 3.7–3.15 (OBSERVATION). Full review consolidates leftover 2.6–2.11 into F1.

Phase 3 did not break Phase 2: inbox still on `/profile`; five `POST /api/friends/*` unchanged; `safeFriendRedirect` still `/profile` or `/players/{uuid}`.

## Safety notes (not extra findings)

- Extra trigger guards remain load-bearing. Do not drop them in a later cleanup.
- Accept UPDATE RLS does not re-check `public_profiles`; service `requireBothVerified` on send/accept is the live-graph gate for new accepts. Direct PostgREST accept while the sender is unverified yields the same accepted-but-hidden state as admin unverify, which the plan wants.
- Open-redirect allowlists stay regex-anchored UUIDs (plus exact `/profile` for friend bounce only).
- `loadPairRow` `.in(sender).in(receiver)` is safe under the unordered unique index (at most one pair row).
- Import of `wantsJson` / `commentJson` from `comment-mutation-http.ts` is the existing cross-feature pattern, not a comments-domain leak.

## Decision

YOLO path: Done (no triage). `change.md` → `impl_reviewed`.
