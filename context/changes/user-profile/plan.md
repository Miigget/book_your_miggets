# Own profile, public profile, and clickable nicknames Implementation Plan

## Overview

Ship S-10 / US-03 / FR-017 / FR-018 / FR-023: a member manages their own profile (nickname if unverified, email, password, self-reported KoG points); the top bar shows nickname (never email); every member-facing nickname links to a public profile at `/players/{uuid}`. Verified members cannot change nickname themselves — they submit a request stored for S-16. Admin fulfillment, friends, and labels stay out of this slice.

## Current State Analysis

Nickname already exists as an optional unique column (`profiles.nickname`, case-insensitive unique index) set at create-run or apply via `POST /api/profile/nickname`. The public projection is `public_profiles` (`id`, `nickname` only) with `security_invoker = false` so guests can read identity without `profiles` SELECT. Topbar still renders `user.email`. There is no `/profile` or `/players/{id}` page. Rosters and organizer names are plain text. Admin `/admin/users/{id}` is archive history (S-09), not a public identity page.

`profiles` has `is_verified` / `role` / `is_banned` locked by `enforce_profile_privileged_columns`. There is no `kog_points`, no points-verified flag, and no nickname-change request storage. Verified members can still UPDATE nickname today. Email/password change via `supabase.auth.updateUser` does not exist for members. Auth forms POST to API routes and redirect with `?error=` / `?notice=`. No test runner — verification is lint, build, and UI/RLS smoke.

## Desired End State

A signed-in member opens `/profile` and can: set nickname if unverified; submit or replace a pending nickname-change request if verified; change email (pending confirmation copy until Auth updates `user.email`); change password (current password required); set `kog_points`. The top bar shows that nickname (or “Set nickname”) linking to `/profile`, never email.

A guest or member clicks a nickname on run lists, dashboard, detail, history, landing, or applicant lists and lands on `/players/{uuid}` showing nickname, verification, KoG points, and whether those points were admin-checked — never email, role, or ban. `/admin` user-list nicknames still open `/admin/users/{id}`. Invalid player ids 404. Banned players still have a public profile.

### Key Discoveries:

- `public_profiles` is a security-definer-style view (`security_invoker = false`) because anon cannot SELECT `profiles` (`supabase/migrations/20260729163802_maps_catalog_and_run_title.sql:53-60`). Recreate it with extra columns; do **not** switch to invoker or guests see nothing
- Privileged-column trigger is the lock pattern to extend (`supabase/migrations/20260729134008_run_domain_schema.sql:115-137`)
- `POST /api/profile/nickname` and create-run both UPDATE nickname with no `is_verified` check and can leak PostgREST (`src/pages/api/profile/nickname.ts:40-45`, `src/pages/api/runs/index.ts:50-55`)
- `RunListItem` already has `organizerId` (`src/lib/services/runs.ts:19-29`) but list UIs only render the string
- Pending/denied DTOs already have `userId` in the service; `[id].astro` strips it (`src/pages/runs/[id].astro:253-254`)
- Run cards are a wrapping `<a href="/runs/{id}">` — organizer nicknames cannot become nested anchors without splitting the card
- `locals.profile` is only `{ role, isBanned }` (`src/env.d.ts`); Topbar can take nickname from the existing middleware `profiles` SELECT
- Local Auth: `enable_confirmations = false`, `double_confirm_changes = true`, `secure_password_change = false` (`supabase/config.toml`); hosted email change may still send confirm links
- Types: `npm run db:types` (requires `npx supabase start`)

## What We're NOT Doing

- Friends list / add-friend (S-11)
- Admin accept/deny of nickname requests, admin nickname/points editors, points-verified **toggle UI** (S-16) — this slice only stores requests and ships the flag + admin RLS so S-16 can UPDATE
- Label dictionary or a public “Labels” section (S-17)
- Changing `/admin` user-list nickname links away from `/admin/users/{id}`
- Email, `role`, or `is_banned` on `public_profiles` or `/players/{id}`
- SMTP / project Auth setting changes (`secure_password_change`, confirmations)
- Public archive history (stays admin-only on `/admin/users/{id}`)
- Vitest/Jest
- `src/types.ts` unless a DTO does not fit `src/lib/services/profile.ts`

## Implementation Approach

Schema first, then signed-in own-profile + chrome, then public page + nickname links (so phase 2 never points at a missing `/players/{id}`).

1. Migration: `kog_points`, `kog_points_verified`, widen `public_profiles`, extend the privileged-column trigger, add `nickname_change_requests` + RLS (member insert/update pending; admin select/update as the S-16 hook). Regenerate types.
2. Own-profile page, APIs, topbar nickname from middleware. Gate existing nickname writes when verified.
3. Public profile loader from `public_profiles`, `/players/[id]`, shared NicknameLink, split nested-anchor cards, pass `userId` through applicant lists.

## Critical Implementation Details

**Keep `public_profiles` as `security_invoker = false`.** An invoker view would apply `profiles` RLS: guests would get zero rows and signed-in members would see only themselves. The view is the guest-safe projection — add only `is_verified`, `kog_points`, `kog_points_verified`. Never email, role, or ban.

**Member point edits must clear the verified flag.** Non-admins cannot set `kog_points_verified` to true, but if they change `kog_points` while the flag is true the number would still look admin-checked. The trigger must set `kog_points_verified := false` when a non-admin changes `kog_points`; otherwise restore the old flag. Admins (S-16) may set both columns.

**Nested anchors.** `/runs`, `/runs/history`, `/dashboard`, landing `Welcome.astro`, and admin archive cards wrap the whole card in `<a href="/runs/{id}">`. Do not nest NicknameLink inside that. Split each card: outer is not a single run link; title (or a dedicated run link) goes to the run; organizer NicknameLink is a sibling. Do not parse organizer names out of `displayTitle` (`resolveRunTitle`).

**Email copy vs local autocconfirm.** `updateUser({ email })` may apply immediately locally and stay pending in hosted Auth. Own-profile always displays current `user.email` from the session. Success notice: if Auth still has the old email, “Check your inbox to confirm”; if it already matches, a short “Email updated.” Never show the submitted address as live until Auth says so.

**Errors.** Only intentional strings in `?error=` (`lessons.md`). Log Auth/PostgREST with `console.error`. Fix the existing nickname/create-run leak of `error.message` on non-23505 paths in the same slice. The `ensureOwnProfile` catch on those same routes must redirect with fixed “Could not prepare your profile” (log the raw error; never interpolate `err.message`).

---

## Phase 1: Identity schema, trigger lock, public projection

### Overview

Land columns, request table, nickname lock, and a wider `public_profiles` so later phases only read/write an existing contract.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260820120000_user_profile_identity.sql` (timestamp may shift to apply-time; keep the suffix)

**Intent**: Add member-editable points, a privileged points-verified flag, verified nickname lock, and request storage S-16 can fulfill without a second identity migration.

**Contract**:

- `profiles.kog_points integer null` with `check (kog_points is null or kog_points >= 0)`
- `profiles.kog_points_verified boolean not null default false`
- Recreate `public_profiles` selecting `id, nickname, is_verified, kog_points, kog_points_verified` only; `WITH (security_invoker = false)`; `GRANT SELECT` to `anon, authenticated`; revoke from `public`
- Enum `nickname_change_request_status`: `pending`, `accepted`, `denied`
- Table `nickname_change_requests`: `id uuid pk`, `user_id` → `profiles(id)` on delete cascade, `requested_nickname text not null` (same 32-char app limit; DB `check (char_length(btrim(requested_nickname)) > 0)`), `status` not null default `pending`, `created_at` / `updated_at`
- Partial unique index one pending row per `user_id`
- RLS enabled; per-operation policies:
  - authenticated INSERT own with `status = 'pending'`
  - authenticated SELECT own
  - authenticated UPDATE own pending rows with check still `status = 'pending'` (cannot self-accept)
  - admin SELECT all / UPDATE all (`is_admin()`) — no admin UI in this slice
- Grants: `select, insert, update` on the table to `authenticated`; no anon writes
- Replace `enforce_profile_privileged_columns` so non-admins: cannot change `role` / `is_verified` / `is_banned`; cannot change `nickname` when `old.is_verified`; cannot set `kog_points_verified` true; if `kog_points` is distinct from old, force `kog_points_verified = false`; else keep old flag. Admins unchanged. Still stamp `updated_at`

Trigger body (non-obvious; implementer may format but must preserve this control flow):

```sql
if not public.is_admin() then
  new.role := old.role;
  new.is_verified := old.is_verified;
  new.is_banned := old.is_banned;
  if old.is_verified then
    new.nickname := old.nickname;
  end if;
  if new.kog_points is distinct from old.kog_points then
    new.kog_points_verified := false;
  else
    new.kog_points_verified := old.kog_points_verified;
  end if;
end if;
new.updated_at := now();
```

#### 2. Generated types

**File**: `src/types/database.ts`

**Intent**: Typed `profiles` columns, `public_profiles` view fields, and `nickname_change_requests` so Phase 2/3 typecheck.

**Contract**: Run `npm run db:types` against local Supabase (`npx supabase start`). Do not hand-edit `database.ts`.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` with RLS on the new table and the view column list excluding email/role/ban
- `npx supabase db reset` (or project-equivalent apply) succeeds locally
- `npm run db:types` regenerates `src/types/database.ts` including `kog_points`, `kog_points_verified`, and `nickname_change_requests`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- SQL: unverified user can UPDATE own nickname; after `is_verified = true`, the same UPDATE leaves nickname unchanged
- SQL: member UPDATE of `kog_points` sets `kog_points_verified` to false; member cannot set the flag true
- SQL: second pending request for the same user fails the unique index unless the first is updated in place
- `anon` SELECT on `public_profiles` returns the new columns; SELECT of `profiles` as anon still fails

**Implementation Note**: After this phase and automated verification, pause for the SQL/RLS smoke above before Phase 2. Phase blocks use plain bullets; checkboxes live in `## Progress`.

---

## Phase 2: Own profile, mutations, top bar

### Overview

Give the member a signed-in `/profile` surface and stop verified self-renames in the app, with request INSERT/replace as the S-16 hook. Chrome shows nickname.

### Changes Required:

#### 1. Profile service

**File**: `src/lib/services/profile.ts` (new)

**Intent**: One choke point for own/public reads, nickname validation, request replace, and domain errors — pages/APIs must not speak PostgREST.

**Contract**: `ProfileError` (user-facing message, like `AdminError`). Shared nickname rules: trim, required, max 32, uniqueness via `lower()` matching `profiles_nickname_lower_uidx`, unique `23505` → “That nickname is already taken.” `getOwnProfile` SELECT from `profiles` (own RLS) including `nickname`, `is_verified`, `kog_points`, `kog_points_verified`. `getPublicProfile` SELECT from `public_profiles` only; invalid UUID or missing row → `null` (use `isUuid`). `getPendingNicknameRequest` for own pending row. Request replace: UPDATE existing pending `requested_nickname` + timestamp, else INSERT; unique-violation retry as update. Requested nick equal to current (case-insensitive) is a domain error. Log raw errors; throw `ProfileError` with fixed copy.

#### 2. Own-profile APIs

**Files**: `src/pages/api/profile/nickname.ts` (extend); `src/pages/api/profile/nickname-request.ts` (new); `src/pages/api/profile/points.ts` (new); `src/pages/api/profile/email.ts` (new); `src/pages/api/profile/password.ts` (new)

**Intent**: Form-POST mutations that match existing auth/run APIs, with verified nick lock and no raw Auth/DB text in redirects.

**Contract**: Uppercase `POST`. Unauthenticated → sign-in. Banned still blocked by middleware. Redirect back to `/profile` (except existing nickname `redirect` field via `safeRunReturnTo` for apply/create). `ensureOwnProfile` before profile writes; if it throws, redirect with fixed “Could not prepare your profile” and `console.error` the raw error (do not interpolate `err.message`).

- Nickname: if `is_verified`, do not UPDATE; fail “Verified nicknames are locked. Request a change instead.” Else existing unique/length rules; non-23505 → fixed “Could not save nickname” (stop interpolating `error.message`)
- Nickname-request: only when verified; compare with `lower(trim(requested))`; reject if that equals the current nick; uniqueness check against `profiles` using the same `lower()` comparison as `profiles_nickname_lower_uidx`; replace pending row
- Points: integer ≥ 0 or empty → null; trigger clears verified flag
- Email: `updateUser({ email })`; optional `emailRedirectTo` to `/profile`; pending vs applied notice as in Critical Details; map failures to fixed copy
- Password: require current + new + confirm (min 6, match signup); `signInWithPassword({ email: session user.email, password: current })` then `updateUser({ password: new })`; never read the email-change field for this step; wrong current → “Current password is incorrect”; never enable OTP/`secure_password_change`

Create-run (`src/pages/api/runs/index.ts`): same verified gate and non-leak error mapping when setting a first nickname, including the `ensureOwnProfile` catch → “Could not prepare your profile”. If verified and nickname is still null, fail with a profile-request message (cannot inline-set).

#### 3. Own-profile page and chrome

**Files**: `src/pages/profile.astro` (new); `src/components/profile/OwnProfileForm.tsx` (new React island); `src/middleware.ts`; `src/env.d.ts`; `src/components/Topbar.astro`

**Intent**: FR-017 surface plus chrome identity; guests cannot open `/profile`.

**Contract**: Add `/profile` to `PROTECTED_ROUTES` (prefix `startsWith` is enough). Page uses Layout + PageChrome. Load own profile + pending request + `user.email`. Unverified: nickname field. Verified: read-only nickname, request field, show pending requested nick if any. Email field shows session email. Password: current / new / confirm. Points: integer input. `?error=` / `?notice=` via existing `Banner` / `ServerError`. Reuse `FormField`, `PasswordToggle`, `SubmitButton`. Middleware `profiles` SELECT adds `nickname`; `locals.profile` becomes `{ role, isBanned, nickname: string | null }`. Topbar: if nickname, truncate and link to `/profile`; else link copy “Set nickname”; never `user.email`.

#### 4. Inline first-nickname UX

**Files**: `src/components/runs/RunParticipantActions.tsx`; `src/components/runs/CreateRunForm.tsx`

**Intent**: First-time unverified nick on apply/create still works; verified users are not offered a self-serve nick field.

**Contract**: If the viewer has no nickname and is verified, replace the amber nickname box with a link to `/profile` to request a nick. Unverified empty nick keeps the existing POST to `/api/profile/nickname`.

#### 5. Docs

**Files**: `AGENTS.md`; `README.md`

**Intent**: Later agents must not invent a second settings URL or put `/profile` outside the auth gate.

**Contract**: AGENTS.md Hard Rules: `PROTECTED_ROUTES` includes `/profile`; `/players/{id}` is public. README: signed-in Profile in the top bar; email stays off public pages.

### Success Criteria:

#### Automated Verification:

- `src/pages/profile.astro` exists; `/profile` is in `PROTECTED_ROUTES`
- Profile API routes exist (`nickname-request`, `points`, `email`, `password`)
- Topbar does not render `user.email` (grep)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest `/profile` → sign-in; signed-in member sees `/profile` with email from session
- Unverified: set nickname; top bar updates; unique collision shows “already taken”
- Verified: nickname field is not a self-save; request submit then a second submit replaces the pending string; direct nickname POST is rejected
- Email: notice is pending or applied per Auth; page still shows current session email until Auth changes it
- Password: wrong current password → friendly error; correct current + new works; can sign in with the new password
- Points save; public flag cannot be flipped from the form
- Banned POST to `/api/profile/*` still hits the existing banned gate
- http://localhost:4321/profile (after `npm run dev` + local Supabase)

---

## Phase 3: Public profile and clickable nicknames

### Overview

Expose `/players/{uuid}` from `public_profiles` and link member-facing nicknames there. Admin user-list nicks stay on the S-09 admin page.

### Changes Required:

#### 1. Public page

**File**: `src/pages/players/[id].astro` (new)

**Intent**: Guest-readable identity (FR-018) distinct from `/profile` and from `/admin/users/{id}`.

**Contract**: Not in `PROTECTED_ROUTES`. Invalid UUID or `getPublicProfile` null → same 404 pattern as run/admin missing pages (do not distinguish banned vs missing). Show nickname (`"—"` if null), verified vs not, KoG points (`"—"` if null), and points-checked vs self-reported. Never email, role, ban, archive list, friends, or labels. Optional: if viewer `user.id` matches, a text link “Edit your profile” → `/profile`.

#### 2. Nickname links

**Files**: `src/lib/profile-href.ts` (new); `src/components/NicknameLink.astro` (new); `src/components/NicknameLink.tsx` (new); call sites below

**Intent**: One href helper; Astro for SSR lists, React for the participant island. Every member-facing nick is a link.

**Contract**: `playerProfileHref(userId)` → `/players/{userId}`. If `userId` is present, wrap the label (nickname or “Unknown player”) in a link. Call sites:

- `src/pages/runs/[id].astro` — organizer + confirmed roster
- `src/components/runs/RunParticipantActions.tsx` — pending/denied (pass `userId` through; stop stripping it in `[id].astro`)
- `src/pages/runs/index.astro`, `src/pages/runs/history.astro`, `src/pages/dashboard.astro`, `src/components/Welcome.astro` — organizer (after card split)
- `src/pages/admin/users/[id].astro` — organizer on archive cards only (after card split)
- Do **not** change `/admin` index nickname cells (remain `/admin/users/{id}`)
- Do **not** parse organizer names out of `displayTitle` (`resolveRunTitle`)

#### 3. Card split for nested anchors

**Files**: `src/pages/runs/index.astro`; `src/pages/runs/history.astro`; `src/pages/dashboard.astro`; `src/components/Welcome.astro`; `src/pages/admin/users/[id].astro`

**Intent**: Valid HTML so organizer nicknames can be links without capturing the whole card.

**Contract**: Card root is not a single `<a>` wrapping the organizer line. Run title (or equivalent) remains the run navigation. Organizer NicknameLink is a separate control. Hover/click affordance on the run title should still feel like the existing card.

### Success Criteria:

#### Automated Verification:

- `src/pages/players/[id].astro` exists
- `playerProfileHref` / NicknameLink exist; `[id].astro` pending/denied mapping includes `userId`
- `/admin` index still links nicknames to `/admin/users/{id}` (grep)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Guest opens `/players/{uuid}` for a known player: nick, verification, points, checked/self-reported; no email
- Unknown / non-UUID id: HTTP 404
- Click organizer and roster nicks on `/runs` and `/runs/{id}` (logged out and in); history; dashboard; landing recent runs; pending/denied names for an organizer
- Nested-link cards: clicking the nick goes to `/players/{id}`; clicking the title still goes to the run
- `/admin` table nick still opens admin archive; archive-card organizer nick opens public profile
- Own topbar nick still goes to `/profile`, not `/players/{self}` (unless they click a roster nick, which may be themselves on the public page)
- http://localhost:4321/runs and a known `/players/{uuid}`

---

## Testing Strategy

### Unit Tests:

- None — no test runner in `package.json`

### Integration Tests:

- None. Rely on `supabase db reset`, `npm run lint`, `npm run build`, and the SQL/UI checks per phase

### Manual Testing Steps:

1. Start local Supabase + `npm run dev`; open [http://localhost:4321](http://localhost:4321)
2. Unverified member: `/profile` set nick, points, password; top bar shows nick; create/apply still work
3. Promote/verify that user (existing `/admin` toggle): nickname locks; request a nick, then request a different one (pending string replaced)
4. Email change: confirm notice; session email only updates after Auth confirms (or immediately if local autocconfirm)
5. Guest: click organizer nick on `/runs` → public profile; no email; `/profile` redirects to sign-in
6. Admin: `/admin` nick → `/admin/users/{id}` still; organizer nick on that archive list → `/players/{id}`

## Performance Considerations

Public profile is a single `public_profiles` row by primary key. Nickname links add no extra list queries if `organizerId` / `userId` already on the DTO. Do not N+1 profile fetches on run lists.

## Migration Notes

Additive: new nullable `kog_points`, flag default false, new table. Existing nicknames unchanged. Existing verified users become locked on next nick UPDATE (trigger). No backfill. Rollback is `db reset` locally; production revert would be a follow-up migration (do not drop `public_profiles` without recreating the old shape — run/participant embeds depend on it).

## References

- PRD: `context/foundation/prd.md` (US-03, FR-017, FR-018, FR-023)
- Roadmap: `context/foundation/roadmap.md` (S-10)
- Lessons: `context/foundation/lessons.md` (`?error=` copy)
- Admin player page (do not replace): `src/pages/admin/users/[id].astro`
- Nickname API today: `src/pages/api/profile/nickname.ts`
- View + unique nick: `supabase/migrations/20260729163802_maps_catalog_and_run_title.sql`
- Privileged trigger: `supabase/migrations/20260729134008_run_domain_schema.sql`
- Auth `updateUser` email confirmation: Context7 `/supabase/supabase` (updateUser + confirm link / OTP)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Identity schema, trigger lock, public projection

#### Automated

- [x] 1.1 Migration file exists under supabase/migrations/ with RLS on the new table and the view column list excluding email/role/ban — 8ba2189
- [x] 1.2 npx supabase db reset (or project-equivalent apply) succeeds locally — 8ba2189
- [x] 1.3 npm run db:types regenerates src/types/database.ts including kog_points, kog_points_verified, and nickname_change_requests — 8ba2189
- [x] 1.4 npm run lint passes — 8ba2189
- [x] 1.5 npm run build passes — 8ba2189

#### Manual

- [x] 1.6 SQL: unverified user can UPDATE own nickname; after is_verified = true, the same UPDATE leaves nickname unchanged — 8ba2189
- [x] 1.7 SQL: member UPDATE of kog_points sets kog_points_verified to false; member cannot set the flag true — 8ba2189
- [x] 1.8 SQL: second pending request for the same user fails the unique index unless the first is updated in place — 8ba2189
- [x] 1.9 anon SELECT on public_profiles returns the new columns; SELECT of profiles as anon still fails — 8ba2189

### Phase 2: Own profile, mutations, top bar

#### Automated

- [x] 2.1 src/pages/profile.astro exists; /profile is in PROTECTED_ROUTES
- [x] 2.2 Profile API routes exist (nickname-request, points, email, password)
- [x] 2.3 Topbar does not render user.email (grep)
- [x] 2.4 npm run lint passes
- [x] 2.5 npm run build passes

#### Manual

- [ ] 2.6 Guest /profile → sign-in; signed-in member sees /profile with email from session
- [ ] 2.7 Unverified: set nickname; top bar updates; unique collision shows already taken
- [ ] 2.8 Verified: nickname field is not a self-save; request submit then a second submit replaces the pending string; direct nickname POST is rejected
- [ ] 2.9 Email: notice is pending or applied per Auth; page still shows current session email until Auth changes it
- [ ] 2.10 Password: wrong current password → friendly error; correct current + new works; can sign in with the new password
- [ ] 2.11 Points save; public flag cannot be flipped from the form
- [ ] 2.12 Banned POST to /api/profile/* still hits the existing banned gate
- [ ] 2.13 http://localhost:4321/profile (after npm run dev + local Supabase)

### Phase 3: Public profile and clickable nicknames

#### Automated

- [ ] 3.1 src/pages/players/[id].astro exists
- [ ] 3.2 playerProfileHref / NicknameLink exist; [id].astro pending/denied mapping includes userId
- [ ] 3.3 /admin index still links nicknames to /admin/users/{id} (grep)
- [ ] 3.4 npm run lint passes
- [ ] 3.5 npm run build passes

#### Manual

- [ ] 3.6 Guest opens /players/{uuid} for a known player: nick, verification, points, checked/self-reported; no email
- [ ] 3.7 Unknown / non-UUID id: HTTP 404
- [ ] 3.8 Click organizer and roster nicks on /runs and /runs/{id} (logged out and in); history; dashboard; landing recent runs; pending/denied names for an organizer
- [ ] 3.9 Nested-link cards: clicking the nick goes to /players/{id}; clicking the title still goes to the run
- [ ] 3.10 /admin table nick still opens admin archive; archive-card organizer nick opens public profile
- [ ] 3.11 Own topbar nick still goes to /profile, not /players/{self} (unless they click a roster nick)
- [ ] 3.12 http://localhost:4321/runs and a known /players/{uuid}
