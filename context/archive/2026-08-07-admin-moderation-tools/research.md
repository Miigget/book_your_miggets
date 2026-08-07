---
date: 2026-08-07T15:04:07+02:00
researcher: Cursor Agent (Fable 5)
git_commit: 8d96c824cacb7c98f7164e2e7febbbbe888a1b3b
branch: feature/admin-moderation-tools
repository: Miigget/book_your_miggets
topic: "Current role/RLS model, run mutation paths, admin UI surfaces, and the cleanest way to add admin delete-run / ban-user / verify-user (S-06, FR-010/011/012)"
tags: [research, codebase, admin, moderation, rls, profiles, runs, middleware, supabase]
status: complete
last_updated: 2026-08-07
last_updated_by: Cursor Agent (Fable 5)
---

# Research: Admin moderation tools (S-06) — role/RLS model, run mutation paths, admin UI surfaces

**Date**: 2026-08-07T15:04:07+02:00
**Researcher**: Cursor Agent (Fable 5)
**Git Commit**: `8d96c824cacb7c98f7164e2e7febbbbe888a1b3b`
**Branch**: `feature/admin-moderation-tools`
**Repository**: `Miigget/book_your_miggets`

## Research Question

What does the current role/RLS model look like (admin role support in profiles, existing policies), how are runs deleted/mutated today, what UI surfaces exist for admin actions, and what is the cleanest way to add admin delete-run / ban-user / verify-user honoring RLS and the ban flag's effect on existing flows?

## Summary

**The database layer for S-06 is essentially already built.** F-01 (`run-domain-schema`) shipped the full admin/ban contract: `profiles.role` (`member | admin`), `profiles.is_verified`, `profiles.is_banned`, SECURITY DEFINER helpers `is_admin()` / `is_not_banned()`, admin RLS policies on all three product tables (including the **only** DELETE policy on `runs`, which is admin-only), and a trigger that prevents non-admins from touching the privileged columns. The `auto_join_run` RPC (S-05) already returns a `'banned'` outcome. The first-admin bootstrap was **already decided and documented in F-01**: manual `UPDATE public.profiles SET role = 'admin' WHERE id = …` runbook, no seeded credentials.

**The entire application layer is missing.** There are zero admin API endpoints, zero admin UI surfaces, no user listing/profile pages, and the middleware reads only `auth.getUser()` — it never loads the profile, so `role` and `is_banned` are invisible to the app. A banned user can still sign in, browse, reach `/runs/new` and `/dashboard`, and update their nickname; their domain writes fail only at RLS with opaque PostgREST errors (which violates the lessons.md rule about not echoing raw infrastructure errors).

**Cleanest path**: plain RLS via the cookie-session client (no SECURITY DEFINER RPCs, no service-role key) — admin mutations are not race-sensitive and the policies already exist. Add: middleware profile load (`locals.profile` with `role`/`is_banned`) + a friendly ban gate, three thin admin POST endpoints following the existing form-POST/redirect pattern, an `/admin` users page, and an admin-only delete button on the run detail page.

## Detailed Findings

### 1. Profiles schema and role model (F-01, already shipped)

`supabase/migrations/20260729134008_run_domain_schema.sql`:

- `public.user_role` enum: `('member', 'admin')` (line 8).
- `public.profiles`: `id uuid PK → auth.users ON DELETE CASCADE`, `role user_role not null default 'member'`, `is_verified boolean not null default false`, `is_banned boolean not null default false`, timestamps (lines 16–23). `nickname text null` added later with a unique lower() index (`20260729163802_maps_catalog_and_run_title.sql:45-50`).
- Grants on `profiles`: SELECT + UPDATE to `authenticated` only — no client INSERT/DELETE (lines 145–146).
- Generated types confirm names: `src/types/database.ts:77-85` (`is_banned`, `is_verified`, `role`), enum at line 263. **Ban column is `is_banned`**, not `banned`.

Helper functions (both SECURITY DEFINER, `search_path = ''`, STABLE):

- `public.is_admin()` — `exists(select 1 from profiles where id = auth.uid() and role = 'admin')` (lines 57–70).
- `public.is_not_banned()` — `exists(select 1 from profiles where id = auth.uid() and is_banned = false)` (lines 72–85). Note: returns **false when no profile row exists**, not only when banned.

Privileged-column trigger `enforce_profile_privileged_columns` (lines 115–137): BEFORE UPDATE on profiles — if caller is not admin, `role`, `is_verified`, `is_banned` are force-reset to OLD values; `updated_at` always refreshed. **This means an admin flipping `is_banned`/`is_verified` via a plain RLS UPDATE already works end-to-end; members cannot self-promote/self-verify/self-unban.**

`handle_new_user()` trigger on `auth.users` inserts `(member, false, false)` — never from auth metadata. `ensure_own_profile()` RPC (`20260730005505_ensure_own_profile.sql`) backfills own profile; it does **not** check ban.

### 2. Complete RLS policy inventory (admin/ban references)

Policies that reference **admin** (all via `is_admin()`, never the literal `role = 'admin'` inline):

- `profiles_select_admin` (SELECT all profiles), `profiles_update_admin` (UPDATE any profile) — `20260729134008:166-184`.
- `runs_select_admin` (all runs, no active-window limit), `runs_update_admin`, **`runs_delete_admin`** (`20260729134008:245-249`) — the only DELETE policy on `runs`; organizers cannot delete their own runs.
- `run_participants_select_admin`, `run_participants_update_admin`. **No admin DELETE policy on `run_participants`** — bulk cleanup relies on FK cascade from run deletion.

Policies that reference **ban** (all via `is_not_banned()`):

- `runs_insert_own` (WITH CHECK organizer + not banned), `runs_update_own`.
- `run_participants_insert_self_pending`, `run_participants_update_organizer`, `run_participants_delete_own_pending`, `run_participants_delete_own_confirmed_as_organizer`.

Policies that check **neither** (banned users retain these): guest/member active-window SELECT on runs (`20260807104348_run_active_window_select.sql:8-24`, FR-013: `archived_at is null and starts_at > now() - interval '1 hour'`), `runs_select_own_organizer`, confirmed-participant SELECT, maps SELECT, `profiles_select_own`, and — notably — **`profiles_update_own` (nickname changes are not ban-gated)**.

### 3. Run deletion and mutation today

- RLS: table grant DELETE on `runs` to `authenticated` exists (`20260729134008:149`); the only DELETE policy is `runs_delete_admin`. FK cascade: `run_participants.run_id → runs ON DELETE CASCADE`, so deleting a run removes its participant rows atomically. `runs.map_id → maps` has no cascade (irrelevant for run deletion).
- App: **no `.from("runs").delete()` call exists anywhere.** Deletes in `src/lib/services/participants.ts` target participant rows only. So FR-010 is DB-ready but has no API or UI.
- Hard delete vs archival: FR-013 archival is derived-at-read (S-04); deletion is a distinct, admin-only override for abusive content (FR-010 Socrates note). Admin `runs_select_admin` sees archived/past-window runs too, so an admin delete endpoint is not inherently limited to active runs — but the only existing detail surface (`getActiveRunById`) serves active runs.

### 4. auto_join_run RPC — the house template and its ban handling

`supabase/migrations/20260807123643_auto_join_run_rpc.sql`: SECURITY DEFINER, `auth.uid()` caller validation, `SELECT … FOR UPDATE` lock, discriminated text outcomes. Line 32–34: `if not public.is_not_banned() then return 'banned'`. The app maps outcomes in `src/lib/services/participants.ts:185-214`; `banned` intentionally falls to the generic "Could not apply to this run" because it "should be unreachable via the service prelude" — today nothing upstream actually blocks banned users, so a banned member sees the generic message.

**Relevance to S-06**: the RPC pattern exists for *race-sensitive* writes. Admin delete/ban/verify are single-row, non-racing, and already authorized by RLS policies — a SECURITY DEFINER RPC would add privilege surface without buying anything. Plain RLS-scoped `.from()` mutations through the cookie client are the cleanest fit.

### 5. Middleware, locals, and where ban/admin context can live

`src/middleware.ts` (25 lines): creates the cookie SSR client, `getUser()`, sets `context.locals.user` (only local — `src/env.d.ts`), then prefix-matches `PROTECTED_ROUTES = ["/dashboard", "/runs/new"]` and redirects unauthenticated users to `/auth/signin`. **No profile load, no role, no ban check anywhere in the app layer.** Middleware runs for API routes too, so it is the single natural place to (a) load `role`/`is_banned` once into `locals`, (b) gate `/admin`, and (c) short-circuit banned users' mutations with a friendly message instead of opaque RLS errors.

### 6. API route pattern to follow

All 10 routes export uppercase `POST` only. Shared pattern (representative: `src/pages/api/runs/[id]/apply.ts:6-38`): cookie client → `getUser()` → redirect to signin (with `returnTo` for run pages) → service call → domain errors as `ParticipantError` → `redirect(...?error=encodeURIComponent(message))`; raw infrastructure errors are logged server-side only (lessons.md rule). No service-role client in production code — the only one is the local-dev quick-login helper (`src/lib/dev-quick-login-server.ts`), gated to localhost. Forms are native HTML `method="POST"` posts from React islands (browser sends `Origin`, satisfying Astro's default `security.checkOrigin`); `window.confirm` is the existing destructive-action confirm pattern (`RunParticipantActions.tsx:62-69`).

### 7. UI surfaces

Pages: `index`, `runs/index`, `runs/[id]`, `runs/new`, `dashboard`, `auth/*`. **No user profile page, no user listing, no admin surface of any kind.** `role` is never read in `src/` outside generated types.

- Run detail (`src/pages/runs/[id].astro`): loads run + participants server-side; organizer-only data/controls are gated by `isOrganizer = user.id === run.organizerId` computed in frontmatter (lines 42–54, 68) and passed as props to the `RunParticipantActions` island. The same pattern extends naturally to `isAdmin` from `locals`.
- Dashboard (`src/pages/dashboard.astro`): a stub (welcome + signout). Could host admin links but is not a moderation surface.
- shadcn primitives: only `src/components/ui/button.tsx` (+ `LibBadge.astro`). No dialog/table components; `window.confirm` is the standing confirm pattern.

### 8. Ban-flag effect on existing flows (gap analysis)

| Flow | Blocked for banned user today? | Mechanism |
|---|---|---|
| Sign in / session | No | — |
| Browse runs / detail / dashboard / `/runs/new` page | No | — |
| Create run (`POST /api/runs`) | Yes (opaque error) | RLS `runs_insert_own` |
| Apply approval-mode | Yes (opaque error) | RLS insert policy |
| Auto-join | Yes (generic message) | RPC `'banned'` outcome |
| Withdraw / leave-team / decide | Yes (opaque error) | RLS |
| Update nickname (`POST /api/profile/nickname`) | **No** | `profiles_update_own` has no ban check |

Enforcement is DB-complete for domain writes but UX-hostile and leaky at the edges (nickname). A middleware-level gate + friendly messaging closes both.

## Code References

- `supabase/migrations/20260729134008_run_domain_schema.sql:8,16-23` — user_role enum + profiles DDL (role/is_verified/is_banned)
- `supabase/migrations/20260729134008_run_domain_schema.sql:57-85` — `is_admin()` / `is_not_banned()` SECURITY DEFINER helpers
- `supabase/migrations/20260729134008_run_domain_schema.sql:115-137` — privileged-columns trigger (admin-only role/verify/ban writes)
- `supabase/migrations/20260729134008_run_domain_schema.sql:160-184` — profiles select/update policies (own + admin)
- `supabase/migrations/20260729134008_run_domain_schema.sql:245-249` — `runs_delete_admin` (only DELETE policy on runs)
- `supabase/migrations/20260807104348_run_active_window_select.sql:8-24` — FR-013 active-window SELECT (anon + authenticated)
- `supabase/migrations/20260807123643_auto_join_run_rpc.sql:32-34` — RPC ban check → `'banned'`
- `src/middleware.ts:1-25` — auth-only gating; `PROTECTED_ROUTES = ["/dashboard", "/runs/new"]`; `locals.user` only
- `src/env.d.ts:1-5` — `App.Locals` shape (user only)
- `src/pages/api/runs/[id]/apply.ts:6-38` — representative mutation route pattern (auth → service → `?error=` redirect)
- `src/lib/services/participants.ts:185-214` — `auto_join_run` outcome→message mapping (`banned` → generic)
- `src/lib/supabase.ts:6-25` — cookie SSR client (publishable key, RLS-scoped); returns null if env missing
- `src/lib/dev-quick-login-server.ts:6-33` — only service-role client (local dev quick-login)
- `src/pages/runs/[id].astro:42-54,68,212-226` — organizer-only conditional rendering pattern + island props
- `src/components/runs/RunParticipantActions.tsx:62-69` — `window.confirm` destructive-confirm pattern
- `src/types/database.ts:77-85,257,263` — profiles Row, `is_admin` fn type, user_role enum

## Architecture Insights

- **Authorization is DB-first**: RLS policies + SECURITY DEFINER helpers are the source of truth; the app layer re-checks only for UX (friendly errors, hiding controls). Admin mutations should ride the existing `is_admin()` policies through the cookie client — no service-role key, no new RPC.
- **SECURITY DEFINER RPCs are reserved for race-sensitive writes** (`auto_join_run` FOR UPDATE lock). Delete-run / ban / verify are single-row idempotent-ish writes fully covered by RLS — plain `.from()` mutations are the house-consistent choice.
- **Form-POST + redirect contract**: every mutation is a native form POST to an uppercase `POST` route redirecting back with `?error=` (intentional strings only, per lessons.md). Admin endpoints must follow this, including the Astro CSRF/Origin gotcha (native forms fine; fetch/curl without Origin rejected).
- **`locals` is the per-request identity channel**: extend `App.Locals` with profile context (role, is_banned) loaded once in middleware rather than per-page queries.
- **One RLS subtlety for the ban endpoint**: `profiles_update_admin` USING/WITH CHECK is `is_admin()` — nothing DB-side stops an admin banning *themselves* (the trigger allows it because the caller is admin). A self-ban/self-demote guard belongs in the API route.
- **Verified flag is write-only today**: no RLS policy or UI reads `is_verified`; S-06 only needs to let admins set it (FR-012). Displaying a verified badge to other users would require widening `public_profiles` (id, nickname only) — out of S-06 scope unless deliberately included.

## Historical Context (from prior changes)

- `context/archive/2026-07-29-run-domain-schema/plan-brief.md` — Key Decisions: role stored in `profiles` (not user_metadata); **"First admin | Manual SQL promote | No seeded credentials in git"**; admin moderation UI explicitly deferred to S-06 ("only schema + RLS hooks + manual promote SQL").
- `context/archive/2026-07-29-run-domain-schema/change.md:14-18` — the first-admin runbook: find user id in Auth → Users (or `select id, email from auth.users;`), then `update public.profiles set role = 'admin' where id = …`. Verified working in F-01 Phase 3 (`plan.md` Progress 3.3, commit `8aef512`).
- `context/archive/2026-08-07-auto-join-mode/plan-brief.md` — Key Decisions: SECURITY DEFINER RPC chosen *specifically* for concurrency ("Only DB-level serialization survives concurrent Worker isolates"); discriminated text outcomes chosen to satisfy the lessons.md no-raw-errors rule; DEFINER RPCs must be internally authoritative because PostgREST exposes them directly.
- `context/foundation/lessons.md` — "Do not echo raw infrastructure errors into user-facing redirects" applies directly to the current banned-user UX (opaque RLS errors) and to new admin endpoints.

## Related Research

- `context/archive/2026-08-07-auto-join-mode/research.md` — RLS/participant-flow mapping that this research builds on.

## Open Questions

None blocking. Two scoping calls to settle at planning time (both have evidence-grounded defaults):

1. Whether S-06 adds user-facing friendly ban messaging at middleware level (recommended: yes — closes the lessons.md violation and the nickname gap cheaply) or leaves enforcement purely at RLS.
2. Whether ban/verify actions are one-way or toggles (recommended: toggles — `profiles_update_admin` supports both directions and an unbannable mistake is an operational footgun).
