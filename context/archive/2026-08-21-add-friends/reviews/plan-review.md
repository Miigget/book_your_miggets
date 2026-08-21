<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Add verified friends

- **Plan**: context/changes/add-friends/plan.md
- **Mode**: Deep
- **Date**: 2026-08-21
- **Pass**: Re-review after REVISE
- **Verdict**: SOUND
- **Findings**: 0 critical 0 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 12/12 existing modify-paths ✓, 8/8 new paths absent as expected, 9/9 symbols ✓, brief↔plan ✓

Existing modify-paths listed: `src/types/database.ts`, `src/lib/safe-return-to.ts`, `src/pages/profile.astro`, `AGENTS.md`, `README.md`, `src/pages/players/[id].astro`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/pages/api/auth/dev-quick-login.ts`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`. Also confirmed as cited: `src/middleware.ts`, `src/pages/api/profile/points.ts`, `src/pages/api/profile/nickname.ts`, `src/lib/services/runs.ts`, `src/lib/services/profile.ts`, `src/lib/comment-mutation-http.ts`, `src/lib/fetch-form-json.ts`. New files (`friends.ts`, five `/api/friends/*`, `FriendsInbox.astro`, `FriendActions.tsx`) correctly do not exist yet.

Symbols confirmed: `safeRunReturnTo` (`src/lib/safe-return-to.ts:4`, runs-only regex; `withReturnTo` / `authErrorRedirect` still call it — Phase 3 switch is still required), `isUuid` / `ensureOwnProfile` (`src/lib/services/runs.ts`), `wantsJson` / `commentJson` / `commentUnauthorized` (`src/lib/comment-mutation-http.ts`; unauthorized hardcodes `/runs/{id}`), `fetchFormJson` / `reloadKeepingScroll` (`src/lib/fetch-form-json.ts`), `playerProfileHref`, `getOwnProfile` / `getPublicProfile` / `ProfileError` (`src/lib/services/profile.ts`; `OwnProfile.isVerified`), `NicknameLink` Astro + TSX, `ServerError`, `is_admin()` / `is_not_banned()`, `public_profiles` `WITH (security_invoker = false)` (`supabase/migrations/20260820071325_user_profile_identity.sql:19-26`), `npm run db:types`. `locals.profile` is `{ role, isBanned, nickname }` only (`src/middleware.ts:44`). Auth `returnTo` consumers are exactly the six pages/routes named in Phase 3 plus `RunParticipantActions` (`withReturnTo` with `/runs/{id}` — stays valid under `safeAuthReturnTo`). `getPublicProfile` has a single caller (`players/[id].astro`). `docs/reference/contract-surfaces.md` absent — check skipped.

Brief↔plan: schema (one table, unordered unique, DELETE unfriend/cancel), public list vs private inbox, Add-friend-as-accept, unverify-keeps-rows, `are_friends()` + `public_friendships` now / S-15 out, phases schema → inbox+APIs → public CTAs, and the three allowlists (`safeRunReturnTo` / `safeAuthReturnTo` / `safeFriendRedirect`) all match.

Codebase verification (deep): guest-safe identity is `public_profiles` not `profiles`; nickname-request twin has SELECT+UPDATE policies; DEFINER helper twin is `is_confirmed_participant` (grant execute to `authenticated` only); JSON mutation twin is `nickname.ts` (`{ ok: true }` + `wantsJson`) + `RunParticipantActions` (`401` + `signIn` → `window.location.assign`); `PROTECTED_ROUTES` uses `startsWith` and does not include `/players`; no other `safeRunReturnTo` callers beyond the named set + `nickname.ts`.

Progress↔Phase: one `## Progress`; three `### Phase N` subsections whose names match the body headings (including Phase 2, no backticks); checkbox counts match Success Criteria; phase bodies use plain bullets.

## F1–F4 application (prior REVISE)

| ID | Prior issue | In revised plan? |
|----|-------------|------------------|
| F1 | Second allowlist so `returnTo=/players/{uuid}` survives login | Yes — `safeAuthReturnTo` (runs or players) + `safeFriendRedirect` (profile or players); `safeRunReturnTo` stays runs-only; friend `signIn` uses `safeAuthReturnTo` not `commentUnauthorized`; helpers in Phase 2, auth hops switched in Phase 3; criterion 2.3 preserved; `signup.ts` confirm-email hop called out |
| F2 | Public Accept had no `request_id` | Yes — `getRelationship` → `{ status, requestId }`; inbox list rows include `id`; `[id].astro` passes `requestId` into `FriendActions`; Accept POSTs `/api/friends/accept` with `request_id` |
| F3 | Phase 2 body vs Progress heading mismatch | Yes — both are `Phase 2: Friends service, POST APIs, /profile inbox` |
| F4 | Viewer `isVerified` unnamed; Banner vs island error | Yes — viewer verification via `getOwnProfile`; do not extend `locals.profile`; island `ServerError` + `reloadKeepingScroll`; no page Banner on `[id].astro` |

## Findings

None. Safe to implement.

## Prior findings (2026-08-21 first pass, REVISE — superseded)

Kept for history. Decisions were applied in the plan before this re-review. Do not re-triage.

### F1 — Auth `returnTo=/players/{uuid}` will be stripped unless a second allowlist is named

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 (friend redirect helper) + Phase 3 (auth return-to)
- **Decision**: Fix A applied — `safeAuthReturnTo` (`/runs/{uuid}` or `/players/{uuid}`) + `safeFriendRedirect` (`/profile` or `/players/{uuid}`); `safeRunReturnTo` stays runs-only; friend `signIn` uses `safeAuthReturnTo` not `commentUnauthorized`; named in Phase 2 helpers and Phase 3 auth hops.

### F2 — Public Accept request has no `request_id` on the wire from `getRelationship`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 `getRelationship` + Phase 3 `FriendActions`
- **Decision**: Fix A applied — `getRelationship` returns `{ status, requestId: string | null }`; same `id` on inbox list rows; `[id].astro` passes `requestId` into `FriendActions` for Accept; three public buttons stay on three endpoints.

### F3 — Phase 2 Progress heading does not match the body heading

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `## Phase 2` vs `### Phase 2` in Progress
- **Decision**: Applied (heading) — Phase 2 body heading matches Progress (backticks dropped).

### F4 — Phase 3 does not name how the viewer’s `isVerified` is loaded

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Public page list + relationship
- **Decision**: Applied (`getOwnProfile`) — viewer verification from `getOwnProfile` (already loaded on `/profile`); do not extend `locals.profile`; island `ServerError` + `reloadKeepingScroll`; no page Banner on `[id].astro`.
