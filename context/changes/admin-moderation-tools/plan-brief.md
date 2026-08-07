# Admin Moderation Tools (S-06) — Plan Brief

> Full plan: `context/changes/admin-moderation-tools/plan.md`
> Research: `context/changes/admin-moderation-tools/research.md`

## What & Why

Implement FR-010/011/012: admins can delete runs, ban users, and mark users verified. This is the moderation safety valve the roadmap requires before announcing to the KoG community — launching a community tool without it is the real risk, while the slice itself is small.

## Starting Point

F-01 already shipped the entire DB contract: `profiles.role`/`is_verified`/`is_banned`, `is_admin()`/`is_not_banned()` helpers, admin RLS policies (including the only DELETE policy on `runs`), participant cascade on run deletion, and a trigger locking privileged profile columns to admins. The app layer has none of it: no admin endpoints or UI, middleware knows only `locals.user`, and banned users are blocked solely by opaque RLS errors (and can still change their nickname).

## Desired End State

An account promoted via the F-01 SQL runbook gets an Admin Topbar link, an `/admin` users table with ban/unban and verify/unverify toggles, and a confirmed "Delete run" control on run detail that hard-deletes the run with participants cascading. Banned users can still browse and sign out, but every mutation is rejected with a friendly "Your account is banned." Non-admins get a 404 from `/admin`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Admin auth check mechanism | Plain RLS (`is_admin()` policies) via cookie client + `locals.profile` role check for UX; no SECURITY DEFINER RPC, no service-role key | Policies already exist and admin writes aren't race-sensitive — the RPC pattern is reserved for races like `auto_join_run` | Research |
| DB migration | None | Schema, policies, helpers, and cascade are complete from F-01/S-05 | Research |
| Ban enforcement | Middleware loads `role`/`is_banned` into `locals.profile`; banned POSTs to non-auth `/api/*` get a friendly redirect; banned notices on run detail + `/runs/new`; RLS stays the backstop | Closes the lessons.md raw-error violation and the un-gated nickname write in one place without touching policies | Research |
| Banned users' access | Can still sign in, browse, and sign out — only mutations are blocked | Read access is harmless, matches current RLS posture, and avoids auth-hook scope | Plan |
| Delete-run semantics | Hard DELETE via `runs_delete_admin`; participants removed by FK cascade; `window.confirm` guard; success notice on `/runs` | FR-010 is a content-removal override, distinct from FR-013 archival; cascade is already in the schema | Research |
| Ban/verify semantics | Toggles (explicit boolean per request), with a self-ban guard in the API route | Reversibility is an operational necessity; nothing DB-side stops an admin self-ban, so the route must | Plan |
| First-admin bootstrap | Manual `update public.profiles set role = 'admin' where id = …` documented in README, reusing the F-01 runbook; no seeded credentials | Decided and verified in F-01 ("Manual SQL promote / no seeded credentials in git"); README makes it operator-visible | Research |
| Admin UI surface | New `/admin` page for user moderation + inline admin delete button on run detail; Topbar link for admins | No user-list surface exists (must be built), while run surfaces already exist — duplicating a runs table on `/admin` would be scope creep | Plan |
| `/admin` route protection | `/admin` added to middleware `PROTECTED_ROUTES`; authenticated non-admins get 404 | Follows the existing middleware gate; 404 avoids advertising the surface | Plan |
| Verified flag exposure | Write-only in this slice (visible on `/admin` only, not to other users) | Public display requires widening the `public_profiles` view — deliberate future change, FR-012 only requires setting the flag | Research |

## Scope

**In scope:**

- `locals.profile` (role + ban) loaded in middleware; `/admin` gating; banned-mutation gate + banned notices
- `src/lib/services/admin.ts` + three admin POST endpoints (delete run, ban, verify)
- `/admin` users page, `AdminRunControls` island on run detail, Topbar admin link
- README "Admin access" first-admin runbook

**Out of scope:**

- Any DB migration; audit log; ban reasons/expiry/appeals; role-management UI; verified badge for non-admins; admin runs list / archive view (S-09); blocking sign-in for banned users; user search/pagination; test-runner introduction

## Architecture / Approach

RLS-first: F-01 policies stay the authority; the app adds UX. Middleware resolves `locals.user` → one PK lookup on `profiles` → `locals.profile`, which drives route gating (`/admin`, banned POSTs) and conditional rendering. Admin mutations are plain `.from()` UPDATE/DELETE calls through the cookie-session client inside `src/lib/services/admin.ts` (an `AdminError` mirrors `ParticipantError`), invoked by native form POSTs to `POST /api/admin/...` routes that redirect with intentional `?error=`/`?notice=` strings only.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Request context & ban enforcement | `locals.profile`, `/admin` gating, friendly ban UX | Middleware gate regressing normal flows (wrong path/method matching) |
| 2. Admin moderation APIs | Delete/ban/verify endpoints + admin service | Leaking raw PostgREST errors instead of friendly messages; missing self-ban guard |
| 3. Admin UI & docs | `/admin` page, delete control, Topbar link, README runbook | Rendering admin controls to non-admins (must key off `locals.profile`) |

**Prerequisites:** S-01/F-01 shipped (done); local Supabase via Docker + dev quick-login for verification; one account promoted via SQL.
**Estimated effort:** ~2-3 sessions across 3 phases — small slice, mostly app plumbing.

## Open Risks & Assumptions

- A banned organizer can still see (not act on) their organizer moderation lists; their actions fail server-side — accepted edge, not worth extra branching.
- Deleting a run is irreversible (no soft-delete); `window.confirm` plus admin-only exposure is the accepted guard for MVP.
- Admin identification on `/admin` is by nickname + id (no email available client-side under RLS) — acceptable for a small community.
- Assumes middleware profile lookup (one PK SELECT per authenticated request) is negligible at target scale.

## Success Criteria (Summary)

- Admin can delete any run from its detail page, ban/unban and verify/unverify any user from `/admin`, with SQL-verifiable effects and friendly notices.
- Banned users are blocked from all mutations with "Your account is banned" (never a raw RLS error) but can still browse and sign out.
- Non-admins can neither see nor use any admin surface or endpoint; regular member flows are unchanged.
