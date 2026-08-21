<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Add verified friends

- **Plan**: context/changes/add-friends/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation
- **Commit**: a894374

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

### F1 — YOLO skipped live manuals 3.7–3.15 (code-side present)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A
- **Detail**: Progress 3.7–3.15 remain `[ ]`. YOLO skipped the human-action browser gates (and leftover Phase 2 2.6–2.11, which this phase did not touch). This is not rubber-stamping of missing code: guest/unverified/own-page CTA gates, NicknameLink list from `public_friendships`, Add/Accept/Remove endpoints, accept-if-incoming, and `safeAuthReturnTo` hops are in `a894374` (service reopen/accept-if-incoming landed in Phase 2). Residual risk is live two-account / unverify eyeballing only. Do not REJECT for this.
- **Fix**: None required for Phase 3 close. Optional live smoke of 3.9–3.12 and 3.15 before archive if a human pass is wanted.
- **Decision**: PENDING

## Verification

### Automated

| Check | Result |
|-------|--------|
| 3.1 Friends section; no `friend_requests` SELECT for the public list | Pass. `[id].astro` uses `listPublicFriends` (`public_friendships` + nickname join). `getRelationship` is CTA-only for a verified other-viewer. No `friend_requests` string on the page. |
| 3.2 `FriendActions` exists; guest/unverified/own-public do not mount Add friend | Pass. Island mounted only when `user && user.id !== profile.id` and both `getOwnProfile` + subject are verified. |
| 3.3 `/players` absent from `PROTECTED_ROUTES` | Pass. `src/middleware.ts` list unchanged; no `/players` prefix. |
| 3.4 `withReturnTo` / `authErrorRedirect` / six auth hops use `safeAuthReturnTo`; `nickname.ts` still `safeRunReturnTo` | Pass. See locked checks. |
| 3.5 `npm run lint` | Pass (0 errors, 72 `no-console` warnings repo-wide). Phase 3 added `console.error` on `[id].astro` for list/relationship load failures — same lesson pattern as existing pages. |
| 3.6 `npm run build` | Pass. |

### Manual (Progress 3.7–3.15)

In-browser click-through not re-run (YOLO human-action skip). Code + locked checks stand in.

| Progress | Result |
|----------|--------|
| 3.7 Guest public profile: NicknameLinks; no Add/Accept/Remove; no pending names | MATCH. List from `public_friendships` (accepted + both verified only). `friendCta` requires `user`. |
| 3.8 Unverified signed-in viewer: list only | MATCH. `own.isVerified` gate before `getRelationship`. |
| 3.9 Verified A adds B; B accepts; both lists show each other | Branch MATCH (`POST /api/friends/request` + inbox accept from Phase 2 + `listPublicFriends`). Live two-account flow not smoked (F1). |
| 3.10 Incoming public CTA is **Accept request** and accepts | MATCH. `incoming_pending` → `POST /api/friends/accept` with `request_id`; label **Accept request**. |
| 3.11 Remove friend; either may Add again | MATCH. `accepted` → `POST /api/friends/unfriend`; unfriend is DELETE so a later INSERT is free. Live not smoked (F1). |
| 3.12 After decline, sender can Add again | MATCH in Phase 2 `sendFriendRequest` (declined → reopen). Public CTA is `none` after decline (`getRelationship` maps declined to none). Live not smoked (F1). |
| 3.13 Unverified subject: no Add friend for a verified viewer | MATCH. `profile.isVerified` required with viewer verification. |
| 3.14 Own `/players/{self}`: friends list + Edit your profile; no pending section | MATCH. `isOwnProfile` edit link; `user.id !== profile.id` skips `FriendActions`; no inbox on this page. |
| 3.15 localhost players + profile URLs | Not opened (F1 / YOLO). |

Phase 3 Changes Required item 4 (two-tab Add race): `sendFriendRequest` still accept-if-incoming / already-friends / already-sent; unique index remains the backstop. No extra UI. Live race not run.

Leftover Phase 2 manuals 2.6–2.11 stay `[ ]`. Phase 3 did not edit `/profile` or `/api/friends/*`. Out of this phase’s Progress; residual for the full-plan review.

## Locked checks

- `PROTECTED_ROUTES` = `/dashboard`, `/runs/new`, `/admin`, `/runs/history`, `/profile` plus `/runs/{id}/edit`. `/players` not gated.
- `safeRunReturnTo` still runs-only (`/^\/runs\/{uuid}$/`). `src/pages/api/profile/nickname.ts` still imports it. `safeAuthReturnTo` allows `/runs/{uuid}` **or** `/players/{uuid}` only — not `/profile`.
- `withReturnTo` and `authErrorRedirect` call `safeAuthReturnTo`. Six hops switched: `signin.ts`, `signup.ts`, `dev-quick-login.ts`, `signin.astro`, `signup.astro`, `confirm-email.astro`. `signup.ts` still `withReturnTo("/auth/confirm-email", returnTo)`. `RunParticipantActions` still passes `/runs/{id}` into `withReturnTo`.
- Friend mutation `signIn` (Phase 2 `friend-mutation-http.ts`) uses `safeAuthReturnTo` on form `redirect`; island hidden `redirect` is `/players/{uuid}`. JSON 401 follows `data.signIn`. No `commentUnauthorized`.
- No page `Banner` / `?notice=` / `?error=` on `[id].astro`. Island uses `ServerError` + `reloadKeepingScroll`.
- `locals.profile` not extended; viewer verification is `getOwnProfile(supabase, user.id)`.

## Plan vs diff

Commit `a894374` (`feat(add-friends): Public friends list and Add / Accept / Remove (p3)`).

- In plan and in diff: `src/pages/players/[id].astro` — MATCH.
- In plan and in diff: `src/components/profile/FriendActions.tsx` — MATCH. Props `targetUserId`, `relationship`, `requestId`. Buttons: **Add friend** / disabled **Request sent** / **Accept request** / **Remove friend**. `fetchFormJson` + `ServerError` + `client:load`.
- In plan and in diff: `src/lib/safe-return-to.ts` + six auth pages/routes — MATCH (helper switch only).
- In plan, not in this diff: `src/lib/services/friends.ts` item 4 — MATCH already in Phase 2 (`sendFriendRequest` accept-if-incoming + declined reopen). No extra UI this phase.
- In diff, not in plan: `plan.md` Progress 3.1–3.6 `[x]` + SHA — implement ritual, not product scope creep.

No planned Phase 3 file missing from the diff.

`change.md` stays `implementing` (phase-scoped review; full-plan `impl_reviewed` is after all phases). Do not archive from this review.

Phase 2 assumptions were not broken: inbox still on `/profile`; five `POST /api/friends/*` unchanged; `safeRunReturnTo` still runs-only; `safeFriendRedirect` still `/profile` or `/players/{uuid}`.

## Safety notes (not extra findings)

- Open-redirect allowlists stay regex-anchored UUIDs. Auth hops do not allow `/profile`.
- Public list cannot leak pending names: `public_friendships` is accepted + both currently verified; page does not SELECT `friend_requests` for listing.
- `signin.ts` / `signup.ts` still put Auth `error.message` in `?error=` (pre-existing; this phase only switched `returnTo`). Lesson still applies; not introduced here.
- `incoming_pending && requestId` hides Accept if `requestId` were null; `getRelationship` always sets `requestId` for pending incoming.

## Proceed

Report saved. Phase-scoped Done (no triage). Full-plan `/10x-impl-review add-friends` is a separate invocation.
