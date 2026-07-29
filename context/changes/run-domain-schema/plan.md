# Run-domain schema and RLS baseline — Implementation Plan

## Overview

Land the first Postgres migration for Book Your Miggets: minimal `profiles`, `runs`, and `run_participants` tables with per-role RLS, an `auth.users` → `profiles` signup trigger, generated TypeScript `Database` types wired into the SSR client, and the same migration applied locally and to the linked remote Supabase project. This unlocks S-01 without over-modeling map catalog, archival jobs, or auto-join race handling.

## Current State Analysis

- Auth works end-to-end via Supabase email/password and cookie SSR (`src/lib/supabase.ts`, `src/middleware.ts`); identity is `auth.users` only — no app roles, ban, or `is_verified`.
- `supabase/config.toml` exists (migrations + seed enabled) but `supabase/migrations/` is absent and `./seed.sql` is missing, so `db reset` would fail on seed.
- No `.from(...)` queries, no generated DB types; `createServerClient` is untyped.
- App secrets are publishable/anon-equivalent (`SUPABASE_KEY`); deploy-plan forbids `service_role` on the Worker — RLS is the authorization boundary.
- F-01 roadmap risk: over-modeling ahead of real flows; downstream slices extend the contract with new migrations.

## Desired End State

- `supabase/migrations/<timestamp>_run_domain_schema.sql` creates enums, three tables, signup trigger, grants, and RLS policies matching PRD guest/member/admin access for the minimal contract.
- Local: `npx supabase start` + `npx supabase db reset` applies cleanly; smoke checks show anon can read active runs / confirmed participants and cannot write; members can insert own runs; privileged profile fields are not self-writable.
- `src/types/database.ts` is generated and committed; `createClient` uses `createServerClient<Database>(...)`.
- Remote linked project has the same migration via `npx supabase db push`; a short runbook documents promoting the first admin with SQL.
- Verification: `npm run lint` and `npm run build` still pass.

### Key Discoveries:

- Migration naming and RLS mandate: `AGENTS.md` — `YYYYMMDDHHmmss_short_description.sql` + per-operation, per-role policies.
- Remote apply path: `context/deployment/deploy-plan.md` §1.3 — `npx supabase db push` after `link`, or SQL Editor; Worker rollback does not undo schema.
- Profile bootstrap pattern: Supabase `handle_new_user` trigger on `auth.users` (`SECURITY DEFINER`, `search_path = ''`); do not authorize from `user_metadata`.
- Typing: `createServerClient<Database>(url, key, options)` from `@supabase/ssr`; keep generated types separate from hand-written DTOs (`src/types.ts` reserved by AGENTS.md).

## What We're NOT Doing

- Map catalog table or seed of KoG maps (S-01 / Open Roadmap Question 1)
- Product API routes or UI for create/list/apply
- Archive lifecycle job / cron / derived in-progress UX (S-04) — only `archived_at` stub column
- Auto-join confirmation race / capacity enforcement logic (S-05)
- Admin moderation UI (S-06) — only schema + RLS hooks + manual promote SQL
- Discord / OAuth / clan roles
- Putting `service_role` on the Worker or authorizing via `raw_user_meta_data`
- Seeding a default admin account in git

## Implementation Approach

One additive migration authored via `npx supabase migration new run_domain_schema`, applied with local reset, types generated from local DB, client typed, then the same migration pushed to the linked cloud project. RLS uses `TO anon` / `TO authenticated` with ownership and status predicates; admin checks read `profiles.role` (source of truth). Trigger owns profile inserts so clients do not self-insert privileged rows.

## Critical Implementation Details

- **Trigger security:** `handle_new_user` must be `SECURITY DEFINER` with `SET search_path = ''` (or equivalent locked search_path) and insert only into `public.profiles` with safe defaults (`role = member`, `is_verified = false`, `is_banned = false`). Do not copy role/ban from user-editable metadata.
- **RLS gotchas:** Prefer `TO anon` / `TO authenticated` over deprecated `auth.role()`. UPDATE policies need matching SELECT visibility plus `WITH CHECK`. Prefer `(select auth.uid())` in predicates. If an `is_admin()` helper is `SECURITY DEFINER`, keep it tight (read `profiles.role` for `auth.uid()` only) and avoid exposing dangerous EXECUTE grants.
- **Active runs for guests:** Treat “active” as `archived_at IS NULL` for anon SELECT on `runs`. Do not implement FR-013 grace logic here.
- **Remote push is one-way:** Confirm with `--dry-run` first; never expect `wrangler rollback` to undo schema.
- **Seed file:** Add a minimal `supabase/seed.sql` (comment-only or no-op) so `db reset` succeeds until S-01 adds map seed data. Do not seed admin credentials.

## Phase 1: Author schema migration

### Overview

Create the migration SQL and seed stub that define the minimal product contract: enums, tables, FKs, signup trigger, grants, and RLS.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_run_domain_schema.sql` (create via `npx supabase migration new run_domain_schema`)

**Intent**: Introduce the three domain tables and security baseline so later slices can read/write without inventing the core ERD.

**Contract**:
- Enums: `user_role` (`member`, `admin`); `join_mode` (`approval_required`, `auto_join`); `participant_status` (`pending`, `confirmed`, `denied`).
- `profiles`: `id` uuid PK FK → `auth.users(id)` ON DELETE CASCADE; `role user_role NOT NULL DEFAULT 'member'`; `is_verified boolean NOT NULL DEFAULT false`; `is_banned boolean NOT NULL DEFAULT false`; `created_at` / `updated_at` timestamptz.
- `runs`: `id` uuid PK; `organizer_id` uuid FK → `profiles(id)`; `map text NOT NULL`; `starts_at timestamptz NOT NULL`; `max_participants int NOT NULL CHECK (max_participants > 0)`; `min_points int NOT NULL DEFAULT 0 CHECK (min_points >= 0)`; `join_mode join_mode NOT NULL DEFAULT 'approval_required'`; `archived_at timestamptz NULL`; timestamps.
- `run_participants`: `id` uuid PK; `run_id` FK → `runs`; `user_id` FK → `profiles`; `status participant_status NOT NULL DEFAULT 'pending'`; `UNIQUE (run_id, user_id)`; timestamps.
- Indexes: at least `runs (archived_at, starts_at)`, `runs (organizer_id)`, `run_participants (run_id, status)`, `run_participants (user_id)`.
- Trigger: `on_auth_user_created` → `handle_new_user` inserts profile defaults.
- Enable RLS on all three tables; `GRANT` appropriate table privileges to `anon` / `authenticated` (SELECT/INSERT/UPDATE/DELETE as policies allow — no blanket write for anon).

#### 2. RLS policies

**File**: same migration

**Intent**: Encode PRD Access Control for the minimal surface so guest browse and member ownership work under the publishable key.

**Contract** (policy matrix):
- **profiles**: `authenticated` SELECT own row; `authenticated` UPDATE own row but `WITH CHECK` / column discipline so `role`, `is_verified`, `is_banned` cannot be changed by self (admin-only updates for those); admin SELECT/UPDATE all via `is_admin()`; no anon writes; anon SELECT optional — default deny public profile dump unless a narrow public field policy is needed later (prefer deny for F-01).
- **runs**: `anon` + `authenticated` SELECT where `archived_at IS NULL`; organizer SELECT own rows including archived; admin SELECT all; `authenticated` INSERT with `organizer_id = auth.uid()` and not banned; organizer UPDATE own non-archived (or own) rows; admin UPDATE/DELETE all; no anon writes.
- **run_participants**: `anon` + `authenticated` SELECT where `status = 'confirmed'` (public roster); participant SELECT own rows any status; organizer SELECT all rows for their runs; admin SELECT all; `authenticated` INSERT self as `pending` when not banned; organizer UPDATE status on their runs’ participants; admin UPDATE; DELETE optional for organizer/admin only if needed — otherwise defer leave/cancel semantics to later slices.
- Ban gate: banned users fail INSERT/UPDATE on runs and participants.

#### 3. Seed stub

**File**: `supabase/seed.sql`

**Intent**: Satisfy `config.toml` `sql_paths = ["./seed.sql"]` so local reset does not fail.

**Contract**: Minimal file (header comment only is fine). No admin user, no map catalog.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` with AGENTS naming
- `supabase/seed.sql` exists
- SQL is valid enough that Phase 2 `db reset` can apply it (checked in Phase 2)

#### Manual Verification:

- Policy matrix in the migration matches the Contract above (spot-check by reading SQL)
- No map catalog, cron, or service_role usage appears in the migration

**Implementation Note**: After completing this phase and automated checks that apply, pause for human confirmation before Phase 2 if the SQL review needs a second pair of eyes; otherwise continue into local apply.

---

## Phase 2: Local verify + typed client

### Overview

Apply the migration on local Supabase, smoke-test RLS, generate and commit TypeScript types, and type the SSR client.

### Changes Required:

#### 1. Local apply

**File**: local Docker Supabase (CLI)

**Intent**: Prove the migration workflow on a clean local database.

**Contract**: With Docker available: `npx supabase start` then `npx supabase db reset` (runs migrations + seed). Fix any SQL errors in the migration before proceeding. Optionally run `npx supabase db advisors` / MCP advisors and address critical RLS findings introduced by this migration.

#### 2. RLS smoke checks

**File**: ad-hoc SQL via `psql` / Studio / MCP `execute_sql` against local

**Intent**: Confirm guest vs member vs admin boundaries before remote push.

**Contract**: At minimum verify:
- As anon: SELECT returns only non-archived runs and confirmed participants; INSERT into `runs` fails.
- As authenticated member: can insert a run with `organizer_id = auth.uid()`; cannot set own `profiles.role` to `admin`.
- After manual `UPDATE profiles SET role = 'admin' WHERE id = …`: admin can SELECT archived runs (if any) / update privileged profile fields.

#### 3. Generated types + client wiring

**Files**: `src/types/database.ts` (new); `src/lib/supabase.ts`; optionally `package.json` script `db:types`

**Intent**: Make the schema contract usable from TypeScript for S-01 without hand-duplicating tables.

**Contract**:
- Generate with `npx supabase gen types typescript --local > src/types/database.ts` (or CLI equivalent `supabase gen types --local`).
- `createClient` returns `createServerClient<Database>(...)`.
- Optional: `"db:types": "supabase gen types typescript --local > src/types/database.ts"` in `package.json`.
- Do not invent hand-written duplicates of Row types in this change.

#### 4. Backfill note for existing local Auth users

**File**: plan/runbook note only (or short comment in `change.md` Notes) — no product UI

**Intent**: Users created before the trigger may lack profiles.

**Contract**: Document one-off backfill SQL: insert into `profiles` for `auth.users` ids missing a profile. Run locally if smoke tests hit missing-profile FKs.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` exits 0
- `src/types/database.ts` exists and includes `profiles`, `runs`, `run_participants`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Anon / member / admin smoke checks above behave as expected
- Signing up a new user locally creates a `profiles` row with `role = member`

**Implementation Note**: Pause for human confirmation of manual RLS smoke results before Phase 3 remote push.

---

## Phase 3: Remote push + admin runbook

### Overview

Apply the same migration to the linked cloud Supabase project and document first-admin promotion.

### Changes Required:

#### 1. Remote migration apply

**File**: remote project via CLI

**Intent**: Satisfy F-01 “migration workflow proven … in deploy.”

**Contract**:
- Ensure project is linked (`npx supabase link`).
- `npx supabase db push --dry-run` then `npx supabase db push` (without `--include-seed` unless seed is intentionally empty/safe).
- Confirm tables exist remotely (Studio or MCP `list_tables`).
- If types were generated `--local` only, optionally regenerate `--linked` and diff; commit if identical or intentionally updated.

#### 2. Admin promote runbook

**File**: `context/changes/run-domain-schema/plan.md` References / Notes (and optionally a short comment on GitHub issue #1) — keep durable text in `change.md` ## Notes or a sibling `runbook.md` only if needed; prefer appending to `change.md` Notes

**Intent**: Close the S-06 “first admin” unknown for environments without seeding credentials into git.

**Contract**: Document:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-uuid>';
```

Run in SQL Editor after identifying the user id. Default remains `member` for all signup-created profiles.

### Success Criteria:

#### Automated Verification:

- `npx supabase db push` exits 0 (or equivalent successful apply)
- Remote schema lists `profiles`, `runs`, `run_participants`

#### Manual Verification:

- Promote-admin SQL works on one real account in the target project
- App still boots against remote Auth (existing signup/signin) with no regression from schema-only change

**Implementation Note**: Remote push requires human-held credentials / linked project; do not invent service_role usage in the Worker.

---

## Testing Strategy

### Unit Tests:

- None — repo has no test runner yet (`AGENTS.md`). Do not add Vitest solely for this change.

### Integration Tests:

- Local `db reset` + RLS smoke SQL (Phase 2) stands in for integration coverage.
- Lint + build gate TypeScript wiring.

### Manual Testing Steps:

1. `npx supabase start` → `db reset` → confirm three tables + trigger in Studio.
2. Sign up a fresh user → confirm `profiles` row defaults.
3. Attempt anon insert of a run → denied; anon select of a seeded active run → allowed.
4. As member, create run + pending participant; confirm anon sees run but not pending row; set participant `confirmed` → anon sees roster row.
5. Attempt self-promote to admin via client update → denied; SQL promote → admin policies apply.
6. `db push` to linked remote → tables visible in cloud Studio.

## Performance Considerations

- Add the indexes listed in Phase 1; avoid premature search indexes for S-03.
- Prefer `(select auth.uid())` and a small admin helper to keep RLS plans stable under PostgREST.

## Migration Notes

- Additive only; no data migration on empty domain tables.
- Backfill profiles for pre-trigger Auth users when needed.
- Schema rollback is not supported via Worker rollback — fix forward with a new migration if required.
- Keep `archived_at` null for all new runs until S-04 decides write-time vs derived archival.

## References

- Roadmap F-01: `context/foundation/roadmap.md`
- PRD Access Control, Business Logic, FR-011/012: `context/foundation/prd.md`
- Deploy migrations: `context/deployment/deploy-plan.md` §1.3, §8.2
- Client: `src/lib/supabase.ts`
- Supabase managing user data (triggers): https://supabase.com/docs/guides/auth/managing-user-data
- CLI: `supabase migration new`, `db reset`, `db push`, `gen types`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Author schema migration

#### Automated

- [x] 1.1 Migration file exists under `supabase/migrations/` with AGENTS naming
- [x] 1.2 `supabase/seed.sql` exists
- [x] 1.3 SQL is ready for Phase 2 `db reset`

#### Manual

- [x] 1.4 Policy matrix in the migration matches the Contract (SQL review)
- [x] 1.5 No map catalog, cron, or service_role usage in the migration

### Phase 2: Local verify + typed client

#### Automated

- [ ] 2.1 `npx supabase db reset` exits 0
- [ ] 2.2 `src/types/database.ts` exists and includes `profiles`, `runs`, `run_participants`
- [ ] 2.3 `npm run lint` passes
- [ ] 2.4 `npm run build` passes

#### Manual

- [ ] 2.5 Anon / member / admin RLS smoke checks behave as expected
- [ ] 2.6 New local signup creates a `profiles` row with `role = member`

### Phase 3: Remote push + admin runbook

#### Automated

- [ ] 3.1 `npx supabase db push` exits 0 (or equivalent successful apply)
- [ ] 3.2 Remote schema lists `profiles`, `runs`, `run_participants`

#### Manual

- [ ] 3.3 Promote-admin SQL works on one real account in the target project
- [ ] 3.4 App still boots against remote Auth (signup/signin) with no regression
