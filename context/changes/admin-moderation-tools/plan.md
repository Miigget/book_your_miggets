# Admin Moderation Tools (S-06) Implementation Plan

## Overview

Give admins the three moderation actions the PRD requires before community launch: delete runs (FR-010), ban users (FR-011), and mark users verified (FR-012). The database contract for all three already shipped in F-01 (`run-domain-schema`) — this change builds the missing application layer: per-request role/ban context, three admin API endpoints, an `/admin` users page, an admin delete control on the run detail page, and friendly ban enforcement UX.

## Current State Analysis

- **DB is done** (see `research.md`): `profiles.role` (`member|admin`), `is_verified`, `is_banned`; SECURITY DEFINER helpers `is_admin()` / `is_not_banned()`; admin RLS policies on all product tables — including `runs_delete_admin`, the *only* DELETE policy on `runs` (`supabase/migrations/20260729134008_run_domain_schema.sql:245-249`); `run_participants.run_id → runs ON DELETE CASCADE`; the `enforce_profile_privileged_columns` trigger lets only admins change `role`/`is_verified`/`is_banned`. **No new migration is required.**
- **App layer has nothing**: no admin endpoints, no admin UI, `role` never read outside generated types. `src/middleware.ts` sets only `locals.user` and gates `PROTECTED_ROUTES = ["/dashboard", "/runs/new"]` by auth alone.
- **Ban enforcement today** is RLS-only: banned users are blocked from domain writes with opaque PostgREST errors (violating the lessons.md "no raw infrastructure errors in `?error=`" rule), and can still update their nickname (`profiles_update_own` has no ban check).
- **First admin** was already solved in F-01: manual `update public.profiles set role = 'admin' where id = …` runbook (`context/archive/2026-07-29-run-domain-schema/change.md:14-18`), verified in F-01 Phase 3. No seeded credentials.
- **Patterns to follow**: uppercase `POST` routes, native form POSTs, `?error=` redirects with intentional strings only, service modules in `src/lib/services/` with a domain error class (`ParticipantError` precedent), organizer-only conditional rendering on run detail (`src/pages/runs/[id].astro:42-68`), `window.confirm` for destructive confirms (`RunParticipantActions.tsx:62-69`).

## Desired End State

An account promoted via the F-01 SQL runbook sees an "Admin" link in the Topbar, opens `/admin`, and can ban/unban and verify/unverify any user from a profiles table. On any active run's detail page the admin sees a "Delete run" control that, after confirmation, hard-deletes the run (participants cascade) and returns to `/runs` with a success notice. A banned user who signs in can still browse, but every mutation attempt (including nickname changes) is rejected with the friendly message "Your account is banned." — never a raw RLS error. Non-admins get a 404 from `/admin` and receive friendly rejections from admin endpoints.

### Key Discoveries:

- `runs_delete_admin` + FK cascade mean admin run deletion needs zero DB work (`20260729134008_run_domain_schema.sql:245-249`).
- `profiles_update_admin` + the privileged-columns trigger mean ban/verify are plain RLS UPDATEs through the cookie client — no service-role key, no RPC (`20260729134008:115-137,178-184`).
- Middleware runs for API routes too, so one profile load there covers page gating, API gating, and UI props (`src/middleware.ts:1-25`).
- Nothing DB-side stops an admin banning themselves (trigger allows it because the caller is admin) — the self-ban guard must live in the API route.
- `auto_join_run` already returns `'banned'`; its generic mapping stays valid once middleware blocks banned users earlier (`src/lib/services/participants.ts:185-214`).

## What We're NOT Doing

- No new database migration (schema, policies, and helpers are complete).
- No audit log, no ban reasons/appeals, no ban expiry.
- No role management UI (promote/demote admin stays a manual SQL runbook).
- No verified-badge display to other users (would require widening the `public_profiles` view — `is_verified` remains write-only in this slice; surfacing it is a future change).
- No admin runs listing or admin archive view (S-09 owns admin archive access).
- No blocking of sign-in for banned users (they authenticate but cannot mutate; read access is intentional).
- No user search/pagination on `/admin` (community is small; plain ordered table).
- No email display on `/admin` (`profiles` has no email column and `auth.users` is not client-readable; users are identified by nickname + id).
- No test-runner introduction (repo has none; CI = `astro sync` + lint + build).

## Implementation Approach

RLS-first, mirroring the house convention: the DB policies are the authority; the app adds UX. Middleware loads the caller's profile once per authenticated request into `locals.profile`, which drives (a) `/admin` route gating, (b) a banned-user mutation gate for API routes, and (c) conditional rendering props. Three thin admin POST endpoints follow the existing form-POST → service → `?error=`/success redirect contract using the cookie-session client. Admin mutations are single-row and not race-sensitive, so no SECURITY DEFINER RPC is used (that pattern is reserved for races like `auto_join_run`). Ban and verify are **toggles** (`is_banned`/`is_verified` set to an explicit boolean from the form) so admin mistakes are reversible through the same endpoints.

## Critical Implementation Details

- **CSRF/Origin**: Astro's default `security.checkOrigin` rejects POSTs without a matching `Origin` header. All admin controls must be native HTML form POSTs (like every existing mutation); curl/fetch verification during implementation must send `Origin`.
- **Middleware gate ordering**: the banned-API gate must run *after* `locals.user`/`locals.profile` are resolved and must exempt `/api/auth/*` (a banned user must still be able to sign out). Redirect target for blocked POSTs: the `Referer` pathname when the Referer parses and matches the request origin, else `/`, always with `?error=Your account is banned` (exact contract in Phase 1, change 2).
- **Zero-row UPDATE/DELETE results**: if a non-admin somehow reaches an admin endpoint, RLS yields an empty result rather than an exception. Endpoints must check the caller's role from `locals.profile` up front (friendly 404/redirect) and treat unexpected zero-row mutation results as a logged generic failure — never surface raw PostgREST text (lessons.md).
- **Local verification without seeded admins**: promote a dev quick-login user via SQL (`update public.profiles set role = 'admin' where id = …`) against local Supabase; RLS behavior can also be checked with `set role authenticated` + `set request.jwt.claims` impersonation in psql.

## Phase 1: Request Context & Ban Enforcement

### Overview

Load the caller's moderation-relevant profile fields into `locals` once per request, gate `/admin`, and turn the existing DB-level ban enforcement into friendly UX at the app boundary.

### Changes Required:

#### 1. Locals typing

**File**: `src/env.d.ts`

**Intent**: Extend `App.Locals` so pages and API routes can read the caller's role and ban state without per-page queries.

**Contract**: `locals.profile: { role: "member" | "admin"; isBanned: boolean } | null` alongside the existing `user`. `null` when unauthenticated or when the profile row is missing.

#### 2. Middleware profile load + gates

**File**: `src/middleware.ts`

**Intent**: After `getUser()`, fetch `role, is_banned` from `profiles` for the signed-in user and set `locals.profile`; add `/admin` to `PROTECTED_ROUTES`; return 404 for authenticated non-admins on `/admin` paths; block banned users' mutating API requests with a friendly redirect.

**Contract**: Gate = `request.method === "POST" && pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/") && locals.profile?.isBanned` → redirect with `?error=` "Your account is banned". Redirect target: parse the `Referer` header with `new URL(referer)`; if it parses and its `origin` equals `context.url.origin`, redirect to its `pathname`; otherwise `/`. (Do not reuse `src/lib/safe-return-to.ts` — it whitelists only `/runs/{uuid}` and is too narrow here; the same-origin check above is the open-redirect guard.) `/admin` gating: unauthenticated → `/auth/signin` (existing PROTECTED_ROUTES flow); authenticated non-admin → return `new Response("Not found", { status: 404 })` directly from middleware — there is no `src/pages/404.astro`, so `context.rewrite("/404")` is not available, and a plain 404 response avoids advertising the surface. A failed profile query is logged and treated as `profile = null` (fail closed for `/admin`, open for the ban gate — RLS remains the backstop).

#### 3. Banned-state UI on participation surfaces

**Files**: `src/pages/runs/[id].astro`, `src/components/runs/RunParticipantActions.tsx`, `src/pages/runs/new.astro`

**Intent**: Stop banned users from reaching forms that will always fail: run detail shows "Your account is banned — you cannot join runs." instead of nickname/apply forms; `/runs/new` shows the equivalent notice instead of the create form.

**Contract**: New `isBanned: boolean` prop on `RunParticipantActions` (guest branch unaffected); early notice branch in `runs/new.astro` frontmatter using `locals.profile`. Organizer moderation lists remain visible to a banned organizer (read-only actions still fail server-side; acceptable edge).

### Success Criteria:

#### Automated Verification:

- Types stay in sync: `npx astro sync` succeeds
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Banned user (flag set via SQL) posting to `/api/profile/nickname` or `/api/runs` gets redirected with "Your account is banned", not a raw error
- Banned user sees the banned notice on run detail and `/runs/new`; sign-out still works
- Non-admin authenticated user gets 404 on `/admin`; unauthenticated user is redirected to sign-in
- Unbanned regular flows (apply/withdraw/decide/create) behave exactly as before

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Admin Moderation APIs

### Overview

Three admin endpoints following the existing route/service/error conventions, backed entirely by the F-01 RLS policies through the cookie-session client.

### Changes Required:

#### 1. Admin service module

**File**: `src/lib/services/admin.ts`

**Intent**: Encapsulate the three moderation mutations plus the admin user-listing query, with an `AdminError` domain error class mirroring `ParticipantError` so routes only surface intentional messages.

**Contract**: `listProfilesForAdmin(supabase)` → rows of `{ id, nickname, role, is_verified, is_banned, created_at }` ordered by `created_at`; `deleteRunAsAdmin(supabase, runId)`; `setUserBanned(supabase, userId, banned: boolean)`; `setUserVerified(supabase, userId, verified: boolean)`. Mutations `.select()` the affected row and throw `AdminError` with a friendly message on zero rows or DB error (raw error logged via `console.error` only).

#### 2. Delete-run endpoint

**File**: `src/pages/api/admin/runs/[id]/delete.ts`

**Intent**: FR-010 — hard-delete a run; participants cascade at the DB level.

**Contract**: `POST`; guards: signed in (else `/auth/signin`), `locals.profile?.role === "admin"` (else 404-style friendly redirect to `/`), UUID-validated `id`. Success → `/runs?notice=Run deleted`; failure → `/runs/{id}?error=…` with an intentional message.

#### 3. Ban / verify endpoints

**Files**: `src/pages/api/admin/users/[id]/ban.ts`, `src/pages/api/admin/users/[id]/verify.ts`

**Intent**: FR-011/FR-012 — set `is_banned` / `is_verified` to an explicit boolean (toggle semantics, reversible).

**Contract**: `POST` with form field `value` = `"true" | "false"` (reject anything else); same auth/admin guards; **self-target guard on ban**: an admin cannot ban their own account ("You cannot ban your own account"). Redirect back to `/admin` with `?error=` or `?notice=`.

#### 4. Run-list success notice

**File**: `src/pages/runs/index.astro`

**Intent**: Render the `?notice=` message after a successful admin deletion (and `?error=` if not already handled), matching the run-detail `?error=` pattern.

**Contract**: Read `Astro.url.searchParams`; display via the existing `Banner.astro` component.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Admin (promoted via SQL) can delete a run; it disappears from `/runs` and its participant rows are gone (checked in SQL)
- Admin can ban → banned user is friendly-blocked (Phase 1 behavior); unban restores normal flows
- Admin can verify/unverify; `profiles.is_verified` flips in SQL
- Non-admin POSTing to any admin endpoint gets a friendly rejection, and direct SQL confirms nothing changed
- Admin cannot ban their own account

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Admin UI & First-Admin Docs

### Overview

The `/admin` moderation page, the admin delete control on run detail, Topbar navigation, and documentation of the first-admin bootstrap.

### Changes Required:

#### 1. Admin users page

**File**: `src/pages/admin/index.astro`

**Intent**: FR-011/FR-012 surface — table of all profiles with per-row Ban/Unban and Verify/Unverify actions.

**Contract**: Server-rendered table from `listProfilesForAdmin` (columns: nickname or "—", id, role, verified, banned, created); each action is a native form POST to the Phase 2 endpoints with hidden `value` field; current admin's own row shows no Ban control; `?notice=` / `?error=` rendered via `Banner.astro`. Route protection is Phase 1 middleware (page can assume admin). No JS island needed — ban/verify are reversible toggles, so no confirm dialog.

#### 2. Admin delete control on run detail

**Files**: `src/components/runs/AdminRunControls.tsx` (new), `src/pages/runs/[id].astro`

**Intent**: FR-010 surface — a clearly destructive "Delete run" button visible only to admins on a run's detail page, with a `window.confirm` guard (irreversible action, matching the existing confirm pattern).

**Contract**: Small React island receiving `runId`; renders a form POST to `/api/admin/runs/[id]/delete` with `onSubmit` `window.confirm("Delete this run permanently? Confirmed participants will be removed.")`. Use the existing shadcn `Button` `variant="destructive"` (`src/components/ui/button.tsx` — defined but unused so far). Rendered from `runs/[id].astro` when `locals.profile?.role === "admin"`, visually separated from participant actions.

#### 3. Topbar admin link

**File**: `src/components/Topbar.astro`

**Intent**: Discoverability — admins see an "Admin" nav link to `/admin`.

**Contract**: Conditional on `Astro.locals.profile?.role === "admin"`; hidden for everyone else.

#### 4. First-admin documentation

**File**: `README.md`

**Intent**: Close the roadmap unknown "how is the first admin designated" in a place operators will find: document the manual promote runbook (decided default; no seeded credentials in the repo).

**Contract**: New short "Admin access" section: sign up normally, find the user id (`select id, email from auth.users;` or Supabase dashboard), run `update public.profiles set role = 'admin' where id = '<user-id>';`, then `/admin` becomes available. Mirrors `context/archive/2026-07-29-run-domain-schema/change.md`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Admin sees Topbar link and the `/admin` table; ban/verify toggles work end-to-end from the UI with notices
- Admin sees "Delete run" on a run detail page, confirm dialog fires, deletion lands on `/runs` with the notice
- Non-admin sees neither the Topbar link nor any admin control on run detail
- README instructions promote a fresh local account successfully

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Testing Strategy

### Unit Tests:

- None — repo has no test runner (per AGENTS.md, do not assume one).

### Integration Tests:

- None automated; CI gate is `astro sync` + `npm run lint` + `npm run build`.

### Manual Testing Steps:

1. `npx supabase start` + `npm run dev`; create two users via dev quick-login; promote one: `update public.profiles set role = 'admin' where id = '<id>';`.
2. As admin: open `/admin`, ban the member, verify the member, unverify, unban — check notices and SQL state after each action.
3. As banned member (re-ban first): attempt nickname change, run creation, apply — each rejected with "Your account is banned"; sign-out works; browsing works.
4. As admin: create a run with the member confirmed on it, delete the run from its detail page — confirm dialog, redirect to `/runs` with notice, `run_participants` rows gone in SQL.
5. As member: confirm `/admin` returns 404, no admin Topbar link, direct POST to admin endpoints (native form or curl with Origin) is friendly-rejected.
6. RLS backstop check via psql impersonation (`set role authenticated; set request.jwt.claims …`): member `update profiles set is_banned = true where id <> auth.uid()` affects 0 rows.

## Performance Considerations

Middleware adds one indexed primary-key SELECT on `profiles` per authenticated request — negligible at target scale and it replaces would-be per-page role queries. No other hot-path changes.

## Migration Notes

No database migration. No data backfill. Rollback = revert the app code; DB contract is unchanged. Deploy is the standard tag-driven CD; no new secrets or env vars.

## References

- Related research: `context/changes/admin-moderation-tools/research.md`
- F-01 role/RLS baseline + first-admin runbook: `context/archive/2026-07-29-run-domain-schema/` (`change.md:14-18`, `plan.md:198-223`)
- RPC-vs-RLS precedent: `context/archive/2026-08-07-auto-join-mode/plan-brief.md` (Key Decisions)
- Mutation route pattern: `src/pages/api/runs/[id]/apply.ts:6-38`
- Conditional-rendering pattern: `src/pages/runs/[id].astro:42-68`
- Error-redirect rule: `context/foundation/lessons.md` ("Do not echo raw infrastructure errors into user-facing redirects")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Request Context & Ban Enforcement

#### Automated

- [x] 1.1 Types stay in sync: `npx astro sync` succeeds
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Production build passes: `npm run build`

#### Manual

- [x] 1.4 Banned user posting to `/api/profile/nickname` or `/api/runs` gets redirected with "Your account is banned", not a raw error
- [x] 1.5 Banned user sees the banned notice on run detail and `/runs/new`; sign-out still works
- [x] 1.6 Non-admin authenticated user gets 404 on `/admin`; unauthenticated user is redirected to sign-in
- [x] 1.7 Unbanned regular flows (apply/withdraw/decide/create) behave exactly as before

### Phase 2: Admin Moderation APIs

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Production build passes: `npm run build`

#### Manual

- [ ] 2.3 Admin can delete a run; it disappears from `/runs` and its participant rows are gone (checked in SQL)
- [ ] 2.4 Admin can ban → banned user is friendly-blocked; unban restores normal flows
- [ ] 2.5 Admin can verify/unverify; `profiles.is_verified` flips in SQL
- [ ] 2.6 Non-admin POSTing to any admin endpoint gets a friendly rejection, and direct SQL confirms nothing changed
- [ ] 2.7 Admin cannot ban their own account

### Phase 3: Admin UI & First-Admin Docs

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Production build passes: `npm run build`

#### Manual

- [ ] 3.3 Admin sees Topbar link and the `/admin` table; ban/verify toggles work end-to-end from the UI with notices
- [ ] 3.4 Admin sees "Delete run" on a run detail page, confirm dialog fires, deletion lands on `/runs` with the notice
- [ ] 3.5 Non-admin sees neither the Topbar link nor any admin control on run detail
- [ ] 3.6 README instructions promote a fresh local account successfully
