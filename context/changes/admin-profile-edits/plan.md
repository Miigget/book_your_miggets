# Admin profile edits Implementation Plan

## Overview

Ship S-16 / FR-023 / FR-024 / US-10: an admin edits a player's nickname and KoG points on the existing `/admin/users/{id}` page, marks points verified after an in-game check, and accepts or denies that player's pending nickname-change request. Discovery is a pending marker on `/admin`. No second profile surface and no player labels (S-17).

## Current State Analysis

S-09 left `/admin/users/{id}` as archive-only: `getProfileForAdmin` selects `id, nickname`; the page has no forms and no `?notice=` / `?error=` banners. Ban/verify stay on `/admin` via form POST to `/api/admin/users/{id}/verify` and `/ban` (`AdminError`, redirect `?notice=` / `?error=`, role check in the API because `/api/admin` is not the middleware `/admin` 404).

S-10 already landed the identity contract S-16 fulfills: `kog_points`, `kog_points_verified`, `nickname_change_requests` (`pending` / `accepted` / `denied`, one pending per user), admin SELECT/UPDATE RLS on that table, and `profiles_update_admin`. The privileged-column trigger lets admins change a verified nickname and set the points flag, but **only non-admins** clear `kog_points_verified` when `kog_points` changes — and that same non-admin branch is the only restore that blocks `SET kog_points_verified = true` via PostgREST (`profiles_update_own` allows any own-row columns). An admin points save can leave a stale “Checked in-game”. Member `/profile` inserts or replaces a pending request; `/players/{id}` already shows “Checked in-game” vs “Self-reported”. There is no admin API or UI to fulfill requests or toggle the flag.

`findProfileIdByNickname` is private in `profile.ts` and reads `public_profiles` (S-10 F1). `getPendingNicknameRequest(supabase, userId)` is not ownership-gated — an admin cookie can load another user's pending row. That helper throws `ProfileError` on PostgREST failure.

## Desired End State

An admin opens `/admin`, sees which users have a pending nick request, clicks through to `/admin/users/{id}`, and can: save nickname; save KoG points (empty → null); mark points verified or unverify without retyping (Mark verified only when a number is stored); accept or deny the current pending request. The public profile reflects nickname, points, and points source. A verified member still cannot self-rename. Unverify on `/admin` denies any pending request so a later Accept cannot overwrite a self-serve nick.

### Key Discoveries:

- `/admin/users/{id}` is the FR-024 surface; `getProfileForAdmin` still returns only `id` + `nickname` (`src/lib/services/admin.ts`)
- Admin request RLS already exists (`nickname_change_requests_select_admin` / `update_admin` in `supabase/migrations/20260820071325_user_profile_identity.sql`)
- Trigger `enforce_profile_privileged_columns` both skips the points-flag clear for admins **and** restores `old.kog_points_verified` for non-admins when points are unchanged — the replace must keep that restore while moving the clear to all roles
- Ban/verify pattern to copy: `src/pages/api/admin/users/[id]/verify.ts` (POST, `value` true/false, `AdminError`, no `window.confirm`)
- `/api/admin/*` is not covered by the `/admin` page 404 — every new route must check `locals.profile?.role === "admin"`
- Uniqueness must use `public_profiles`, not `profiles` (own RLS would hide other nicks)
- `getPendingNicknameRequest` throws on query failure; archive list on this page already degrades inline — pending load must not take down nick/points editors

## What We're NOT Doing

- A second admin profile URL or `/admin/nickname-requests` queue page
- Player labels (S-17)
- `reviewed_by` / `reviewed_at` / `admin_note` columns (no identity-table migration beyond the trigger replace)
- Listing accepted/denied request history on the player page
- Moving ban/verify onto `/admin/users/{id}`
- Email, role, or ban chips on the player page (those stay on `/admin`)
- Notifying the member (email/in-app) on accept/deny
- React islands on admin pages
- Vitest/Jest
- Changing member `/profile` or public `/players/{id}` layout beyond reflecting data the public page already shows

## Implementation Approach

App-layer fulfillment on the S-10 schema, plus one trigger replace so **any** `kog_points` change (including admin) sets `kog_points_verified = false`, while non-admins still cannot SET the flag true when points are unchanged. Mark verified is a separate UPDATE of the flag only, and it must refuse null points.

Copy S-06: uppercase POST, cookie client, `AdminError`, intentional `?error=` / `?notice=` strings (`lessons.md`). Player-page mutations redirect back to `/admin/users/{id}`. Unverify stays on `/admin` and closes the queue inside `setUserVerified` via deny-if-any (missing pending is success).

Reuse `parseNickname`, `parseKogPoints`, and an exported uniqueness helper from `profile.ts`. New writes live in `admin.ts`. Plain Astro forms on the player page (same as ban/verify), not a React island.

## Critical Implementation Details

**Points change always clears verified; members still cannot SET the flag.** Today the distinct-from clear and the else-restore both live inside `if not is_admin()`. Replace the trigger so: (1) non-admin privileged restores (`role` / `is_verified` / `is_banned` / verified nick lock) plus restore `old.kog_points_verified` when points are **not** distinct from old; (2) then the all-role `kog_points is distinct from` clear; (3) then `updated_at`. Admins skip the restore so Mark verified can set the flag. Admin points save must UPDATE `kog_points` only (never send the flag in the same row). Mark verified / Unverify UPDATE `kog_points_verified` only. If both columns are sent together while points changed, Postgres will still force the flag false — that is intended.

**Mark verified is not allowed on null points.** `setKogPointsVerified(true)` must error with fixed copy when stored `kog_points` is null. Unverify (`false`) remains allowed. The player-page Mark verified control is hidden or disabled when points are empty.

**Close pending only after a successful nick write.** Direct save: uniqueness failure → no nick change, pending unchanged. After a successful nick UPDATE, if a pending row exists: case-insensitive match to `requested_nickname` → `accepted`, else `denied`. Accept: uniqueness failure → keep `pending`, “That nickname is already taken.” Apply `profiles.nickname` first, then set status `accepted`. Deny: status only.

**Unverify is deny-if-any, then flip.** `setUserVerified(id, false)` must mark any pending request `denied` **before** flipping `is_verified`. No pending row is success, not abort. If the deny **write** fails, abort unverify. Verify (`true`) does not touch requests. Do **not** reuse `denyNicknameChangeRequest` as-is — that helper still errors “No pending nickname request” for the Deny button. Use a separate helper or an explicit no-op branch.

**Accept reads the stored request string**, not a form nickname field (the member already chose it).

**Player-page pending load is isolated.** Load pending in its own try after a successful profile load. On failure: log, keep nick/points/flag editors, show an inline friendly error, omit Accept/Deny. Do not fail `getProfileForAdmin`.

## Phase 1: Trigger, admin services, and APIs

### Overview

Bake the points-verified invariant, widen admin loaders, add nickname/points/request mutations (including unverify closes pending), and expose them as POST routes. The player page stays archive-only until Phase 2.

### Changes Required:

#### 1. Trigger replace

**File**: `supabase/migrations/YYYYMMDDHHmmss_admin_kog_points_clear_verified.sql` (timestamp at apply time; suffix stable)

**Intent**: A stale “Checked in-game” must not survive any stored `kog_points` change, including admin edits — and members must still be unable to SET `kog_points_verified` true via PostgREST.

**Contract**: `create or replace` `enforce_profile_privileged_columns`. Keep the non-admin locks (`role`, `is_verified`, `is_banned`, verified nickname). Inside `if not is_admin()`, when `kog_points` is **not** distinct from old, restore `new.kog_points_verified := old.kog_points_verified`. Move the `kog_points` distinct-from clear **outside** `if not is_admin()` so it always runs. Admins skip the restore so Mark verified works. Still stamp `updated_at`. Do not add columns. Types unchanged — no `db:types` required.

Trigger control flow (non-obvious; preserve this order):

```sql
if not public.is_admin() then
  new.role := old.role;
  new.is_verified := old.is_verified;
  new.is_banned := old.is_banned;
  if old.is_verified then
    new.nickname := old.nickname;
  end if;
  if new.kog_points is not distinct from old.kog_points then
    new.kog_points_verified := old.kog_points_verified;
  end if;
end if;
if new.kog_points is distinct from old.kog_points then
  new.kog_points_verified := false;
end if;
new.updated_at := now();
```

#### 2. Uniqueness helper

**File**: `src/lib/services/profile.ts`

**Intent**: Admin apply/save must use the same `public_profiles` lookup that fixed S-10 F1.

**Contract**: Export `findProfileIdByNickname` (same ILIKE + `nicknameKey` behavior). Member paths keep calling it. Do not query `profiles` for uniqueness.

#### 3. Admin loaders and mutations

**File**: `src/lib/services/admin.ts`

**Intent**: One choke point for S-16 writes so APIs never speak PostgREST. Map `ProfileError` from parse helpers to `AdminError` with the same user-facing strings.

**Contract**:

- Widen `AdminPlayerProfile` / `getProfileForAdmin` to `id`, `nickname`, `kog_points`, `kog_points_verified`. Still omit `role` / `is_verified` / `is_banned`. Invalid UUID or missing row → `null`.
- `listProfilesForAdmin`: add `hasPendingNicknameRequest: boolean`. Load pending `user_id`s from `nickname_change_requests` (`status = pending`). If that query fails, log, return the user list with all flags false — do not fail the whole `/admin` table.
- `setAdminNickname(supabase, userId, raw)`: `parseNickname`; uniqueness (taken by other id → “That nickname is already taken.”); UPDATE `profiles.nickname`; on unique `23505` same message; zero rows → generic fail. **After a successful nick write**, if a pending row exists: match `nicknameKey` to `requested_nickname` → `accepted`, else `denied`. Uniqueness/write failure must not change request status.
- `setAdminKogPoints(supabase, userId, raw)`: `parseKogPoints` (empty → null). UPDATE `kog_points` only.
- `setKogPointsVerified(supabase, userId, verified)`: UPDATE `kog_points_verified` only. When `verified === true`, if stored `kog_points` is null → `AdminError` with fixed copy “Set KoG points before marking them checked in-game.” Do not set the flag. Unverify (`false`) is allowed even when points are null. Zero rows or flag mismatch → `AdminError` (same shape as `setUserVerified`).
- `acceptNicknameChangeRequest(supabase, userId)`: load pending for that user; none → “No pending nickname request”. Uniqueness on stored `requested_nickname`; on collision leave pending and throw taken message. UPDATE nickname to that string, then status `accepted`.
- `denyNicknameChangeRequest(supabase, userId)`: pending none → “No pending nickname request”; else status `denied` only. Deny **button** uses this helper.
- `denyPendingNicknameRequestIfAny(supabase, userId)` (or an explicit no-op branch inside unverify — do not reuse the Deny-button helper as-is): no pending row → return success; else status `denied`. Write failure still throws.
- `setUserVerified`: when `verified === false`, call deny-if-any **then** flip `is_verified`. Missing pending is success, not abort. Deny **write** failure aborts. `verified === true` unchanged.

Reuse `getPendingNicknameRequest` from `profile.ts` for pending loads (admin RLS). Log raw errors; throw `AdminError` with fixed copy.

#### 4. Admin APIs

**Files**: `src/pages/api/admin/users/[id]/nickname.ts`; `points.ts`; `points-verified.ts`; `nickname-request.ts` (new)

**Intent**: Same authz and error mapping as ban/verify, but return the admin to the player page.

**Contract**: Uppercase `POST`. `fail` / `succeed` redirect `/admin/users/{id}?error=` / `?notice=` (encodeURIComponent). No supabase → configured message. `!locals.user` → `/auth/signin`. Non-admin → `/`. Invalid UUID → “Invalid user”. Catch `AdminError` → message; other errors `console.error` + fixed copy. Never interpolate PostgREST/`err.message`.

- Nickname: form field `nickname`
- Points: form field `kog_points` (empty allowed)
- Points-verified: hidden `value` `"true"` | `"false"` (reject other values). `true` is rejected in the service when points are null (same fixed copy).
- Nickname-request: `decision` `"accept"` | `"deny"` only; accept uses the stored request string; deny uses `denyNicknameChangeRequest` (missing pending → error)

No `window.confirm`. Do not change ban/verify redirect targets (`/admin`).

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` replacing `enforce_profile_privileged_columns` so any `kog_points` change clears the flag and non-admins restore the flag when points are unchanged
- `npx supabase db reset` (or project-equivalent apply) succeeds locally
- `getProfileForAdmin` selects `kog_points` / `kog_points_verified`; `listProfilesForAdmin` exposes `hasPendingNicknameRequest`
- Admin mutation helpers and the four new API routes exist; `setUserVerified(false)` deny-if-any then unverify; `denyNicknameChangeRequest` still errors when none pending; `setKogPointsVerified(true)` rejects null `kog_points`
- `findProfileIdByNickname` is exported and used by admin nick/accept paths
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- SQL: admin UPDATE of `kog_points` sets `kog_points_verified` false; a following UPDATE of the flag only to true sticks when points are unchanged
- SQL: member still cannot set the flag true; member points change still clears it; verified nickname lock still applies to non-admins
- SQL or service: unverify with a pending row leaves status `denied` and `is_verified` false; unverify with **no** pending row still sets `is_verified` false; deny write failure must not leave the user unverified with a live pending row
- Service: `setKogPointsVerified(true)` when `kog_points` is null errors with “Set KoG points before marking them checked in-game.”; Unverify (`false`) still succeeds when points are null

**Implementation Note**: After this phase and automated verification, pause for the SQL/service smoke above before Phase 2. Phase blocks use plain bullets; checkboxes live in `## Progress`.

---

## Phase 2: Admin player page editors and list discovery

### Overview

Put the Phase 1 mutations on `/admin/users/{id}` and a pending hint on `/admin`. Archive list stays below. Ban/verify stay on the users table.

### Changes Required:

#### 1. Player page editors

**File**: `src/pages/admin/users/[id].astro`

**Intent**: FR-024 on the existing S-09 page — every player this page already opens (unverified, verified, banned).

**Contract**: After a successful profile load, show (above the archive list): nickname text field (current value; required via `parseNickname` on POST); KoG points field (empty allowed); Mark verified / Unverify toggle on the stored number (copy the `/admin` verify button pattern) — **hide or disable Mark verified when `kog_points` is null**; Unverify remains available when the flag is true. If a pending request exists, the requested string plus Accept and Deny forms — no past accepted/denied rows. Load pending via `getPendingNicknameRequest` in its **own try** (do not fold into `getProfileForAdmin`). On pending-load failure: `console.error`, keep nick/points/flag editors, inline friendly error (fixed copy, e.g. “Could not load the pending nickname request.”), omit Accept/Deny. Add `Banner` for `?notice=` / `?error=` like `/admin`. Keep header nickname + id, back link `← Users`, archive cards unchanged. Invalid/missing id still 404. Plain HTML POST forms, no `client:*` island. No ban/verify/role chips.

#### 2. Pending marker on the users table

**File**: `src/pages/admin/index.astro`

**Intent**: Admins can find work without a queue URL.

**Contract**: Nickname cells still link to `/admin/users/{id}`. When `hasPendingNicknameRequest`, show a small marker next to that nickname (or a compact extra column). Do not add accept/deny on this table. Subtitle may mention that nicknames open edit + archive, and that a marker means a pending nick request.

#### 3. Docs

**Files**: `README.md` (Admin access step 4); `AGENTS.md` (Hard Rules `/admin` sentence)

**Intent**: Later agents must not invent a second admin profile or move fulfill to `/admin` actions.

**Contract**: README: `/admin/users/{id}` is where admins edit nickname/points, mark points checked in-game, and accept/deny nick requests; `/admin` shows a pending marker. AGENTS.md: keep `/admin` prefix 404; add that S-16 mutations live on `/admin/users/{id}` via `/api/admin/users/{id}/*`. Do not rewrite unrelated sections.

### Success Criteria:

#### Automated Verification:

- `/admin/users/[id].astro` posts to the four new admin APIs (grep)
- `/admin` index still links nicknames to `/admin/users/{id}` and reads `hasPendingNicknameRequest`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Admin on a verified player: save nick (public `/players/{id}` updates); pending request Accept applies nick and clears `/profile` pending; Deny leaves nick, pending gone, member can request again
- Direct nick save while pending: matching requested string → accepted; different string → denied; taken nick → error, pending remains
- Points save then public “Self-reported”; Mark verified → “Checked in-game” without retyping; changing points again → flag clears
- Unverified and banned players: same editors; unverify on `/admin` with a pending request denies it
- Guest `/admin/users/{id}` → sign-in; member → 404; archive list still loads
- http://localhost:4321/admin and a known http://localhost:4321/admin/users/{uuid} (after `npm run dev` + local Supabase)
- Empty points: Mark verified is hidden or disabled; Unverify still works; posting `value=true` still errors with the Phase 1 copy
- Pending-load failure (or forced error): nick/points/flag editors still render; inline friendly error; no Accept/Deny; profile load still succeeds

**Implementation Note**: After this phase and automated verification, pause for the UI smoke above.

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`

### Integration Tests:

- `npx supabase db reset`, `npm run lint`, `npm run build` per phase
- SQL smoke for the trigger (Phase 1 manuals)

### Manual Testing Steps:

1. Start local Supabase + `npm run dev`; open [http://localhost:4321/admin](http://localhost:4321/admin)
2. As a verified member, submit a nickname-change request on `/profile`. As admin, confirm the `/admin` marker, open the player page, Deny, then request again and Accept. Check `/players/{id}` and `/profile`
3. Direct-save a different nick while pending (denied); retry with a taken nick (error, still pending)
4. Set points, confirm public self-reported; Mark verified; change points; confirm flag cleared. Clear points to empty: Mark verified hidden/disabled; Unverify still available
5. Unverify a user who has a pending request; confirm request is denied and they can self-serve nick. Unverify a user with **no** pending request; confirm they still become unverified
6. Repeat nick/points on an unverified user and a banned user; guest/member still cannot open `/admin/users/{id}`

## Performance Considerations

`/admin` adds one pending-`user_id` query (or equivalent) for the whole list — no per-row N+1. Player page adds one pending `maybeSingle` plus the existing profile + archive queries. No new index required (`nickname_change_requests_one_pending_per_user_uidx` and `user_id` index already exist).

## Migration Notes

- One additive trigger replace; no new tables or columns; no backfill
- Rollback locally: `db reset` to the previous migration; production revert would restore the old function body (do not drop the S-10 trigger)
- Deploy is the usual `v*` tag CD (`db push` then Worker); no new secrets

## References

- PRD US-10, FR-023, FR-024: `context/foundation/prd.md`
- Roadmap S-16: `context/foundation/roadmap.md`
- S-09 admin player page: `context/archive/2026-08-17-admin-player-archive-view/`
- S-10 identity schema + request queue: `context/archive/2026-08-20-user-profile/`
- Lessons (`?error=` copy): `context/foundation/lessons.md`
- Ban/verify API: `src/pages/api/admin/users/[id]/verify.ts`, `ban.ts`
- Admin service: `src/lib/services/admin.ts`
- Member uniqueness + pending: `src/lib/services/profile.ts`
- Plan-review (F1–F4 locked): `context/changes/admin-profile-edits/reviews/plan-review.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Trigger, admin services, and APIs

#### Automated

- [x] 1.1 Migration file exists under supabase/migrations/ replacing enforce_profile_privileged_columns so any kog_points change clears the flag and non-admins restore the flag when points are unchanged — 2e53395
- [x] 1.2 npx supabase db reset (or project-equivalent apply) succeeds locally — 2e53395
- [x] 1.3 getProfileForAdmin selects kog_points / kog_points_verified; listProfilesForAdmin exposes hasPendingNicknameRequest — 2e53395
- [x] 1.4 Admin mutation helpers and the four new API routes exist; setUserVerified(false) deny-if-any then unverify; denyNicknameChangeRequest still errors when none pending; setKogPointsVerified(true) rejects null kog_points — 2e53395
- [x] 1.5 findProfileIdByNickname is exported and used by admin nick/accept paths — 2e53395
- [x] 1.6 npm run lint passes — 2e53395
- [x] 1.7 npm run build passes — 2e53395

#### Manual

- [x] 1.8 SQL: admin UPDATE of kog_points sets kog_points_verified false; a following UPDATE of the flag only to true sticks when points are unchanged — 2e53395
- [x] 1.9 SQL: member still cannot set the flag true; member points change still clears it; verified nickname lock still applies to non-admins — 2e53395
- [x] 1.10 SQL or service: unverify with a pending row leaves status denied and is_verified false; unverify with no pending row still sets is_verified false; deny write failure must not leave the user unverified with a live pending row — 2e53395
- [x] 1.11 Service: setKogPointsVerified(true) when kog_points is null errors with fixed copy; Unverify (false) still succeeds when points are null — 2e53395

### Phase 2: Admin player page editors and list discovery

#### Automated

- [x] 2.1 /admin/users/[id].astro posts to the four new admin APIs (grep)
- [x] 2.2 /admin index still links nicknames to /admin/users/{id} and reads hasPendingNicknameRequest
- [x] 2.3 npm run lint passes
- [x] 2.4 npm run build passes

#### Manual

- [ ] 2.5 Admin on a verified player: save nick; Accept/Deny pending; public and /profile reflect
- [ ] 2.6 Direct nick save while pending: match → accepted; different → denied; taken nick → error, pending remains
- [ ] 2.7 Points save then public Self-reported; Mark verified → Checked in-game; changing points clears the flag
- [ ] 2.8 Unverified and banned players: same editors; unverify on /admin with a pending request denies it
- [x] 2.9 Guest /admin/users/{id} → sign-in; member → 404; archive list still loads
- [ ] 2.10 http://localhost:4321/admin and a known http://localhost:4321/admin/users/{uuid}
- [x] 2.11 Empty points: Mark verified hidden or disabled; Unverify still works; posting value=true still errors with the Phase 1 copy
- [x] 2.12 Pending-load failure: nick/points/flag editors still render; inline friendly error; no Accept/Deny; profile load still succeeds
