# Clan-domain schema and RLS contract — Implementation Plan

## Overview

Land the smallest clan tables (`clans` + `clan_members`) with per-role RLS so a verified member can insert a clan, the owner is seated as the first member in the same statement, guests can read the public directory/details (name, tag, members, points stuck at 0), and friends-only / invite-only runs cannot leak through clan rows. This is foundation F-02 only — no create UI, invites, officers, clan runs, or points accumulation.

## Current State Analysis

- Twenty migrations already cover profiles, runs, restricted visibility, friends, comments, and labels. **No clan tables, enums, or helpers exist** in `supabase/migrations/` or `src/types/database.ts`.
- RLS conventions are stable: per-operation policies with explicit `TO anon` / `TO authenticated`, `(select auth.uid())`, `public.is_admin()` / `public.is_not_banned()`, verified gates via `exists (… public.public_profiles … and is_verified)`, revoke-then-grant, `SECURITY DEFINER` helpers/triggers with `set search_path = ''` and `REVOKE ALL … FROM public`.
- Owner-as-first-row already exists for runs: `seat_organizer_on_run_insert` AFTER INSERT (`supabase/migrations/20260731111849_participant_apply_leave_and_organizer_seat.sql`). That trigger uses `ON CONFLICT DO NOTHING` because uniqueness is per `(run_id, user_id)` — an organizer can own many runs. F-02 uniqueness is global (`clan_members.user_id` PK); do not copy the conflict clause. Public run create is a direct table INSERT under RLS; RPCs exist only when child rows cannot be seated by a trigger (`create_invite_only_run`).
- Guest-readable rosters of profile UUIDs already exist (`player_label_assignments`, `public_friendships`). Those objects do not join `runs`. Restricted runs leak only when a new policy/view/DEFINER RPC selects `runs` / `run_participants` / `run_invites` without the S-15 audience predicates.
- Publishable `SUPABASE_KEY` is the authz boundary (`src/lib/supabase.ts`). There is no test runner (`AGENTS.md`); later slices prove schema with `db reset`, `npm run db:types`, lint, build, and SQL smoke. Production applies migrations on tag `v*` (`.github/workflows/deploy.yml`), not on merge to `main`.

## Desired End State

- One additive migration creates `public.clans` and `public.clan_members`, seats the owner via trigger, and encodes the F-02 policy matrix (guest SELECT, verified INSERT, insert-only membership, admin DELETE, frozen points).
- Local `npx supabase db reset` applies cleanly. Generated `src/types/database.ts` includes both tables. `npm run lint` and `npm run build` pass.
- Smoke SQL shows: guests read clans and member user ids; unverified/banned/anon cannot insert; a verified member gets a clan plus one membership row; a second clan for the same user fails; points stay 0; clients cannot write membership; no clan policy or FK touches `runs`.

### Key Discoveries:

- Migration + RLS mandate: `AGENTS.md` — `YYYYMMDDHHmmss_short_description.sql` and per-operation, per-role policies.
- Copy later-slice grant hygiene (`player_labels` / `friend_requests`): `REVOKE ALL ON TABLE … FROM public, anon` then explicit grants — not F-01’s older grant-only style.
- Verified INSERT gate: inline `public_profiles.is_verified` like `friend_requests_insert_sender_pending` (`supabase/migrations/20260821130000_friend_requests.sql`). Do not add `is_verified_member()` or `is_clan_owner()` in F-02.
- Unique `lower(name)` index pattern: `player_labels_name_lower_uidx` (`supabase/migrations/20260825070003_player_labels.sql`).
- World-readable SELECT `USING (true)` split `TO anon` / `TO authenticated` — same as labels.
- No `FORCE ROW LEVEL SECURITY` in this repo; a `SECURITY DEFINER` seating trigger (table owner) can INSERT `clan_members` without a client INSERT policy. FK `ON DELETE CASCADE` from `clans` still runs as `authenticated` on the child, so admin DELETE on `clan_members` is required for cascade to succeed.
- F-01 remote `db push` phase is not repeated: the deploy workflow already pushes migrations on `v*`.

## What We're NOT Doing

- Create-clan UI, pages, or API routes (S-18)
- Profile picture column or Storage upload (S-18)
- Clan invites / client INSERT on `clan_members` (S-19)
- Officer role enum or owner/officer helpers (S-21)
- Clan runs, `runs.visibility` changes, or any join/FK/view/RPC involving `runs`, `run_participants`, `run_invites` (S-21, FR-028)
- Complete / verified-finish / points increment (S-22 / S-23)
- Rename, leave, transfer-owner, or owner-delete product paths
- `create_clan()` RPC (INVOKER or DEFINER)
- New `profiles.role` values; clan owner is `clans.owner_id`, not a global role
- `service_role` on the Worker; Vitest/Jest; remote `db push` in this change

## Implementation Approach

One additive migration via `npx supabase migration new clan_domain_schema`. Direct `INSERT` into `clans` under RLS (verified, not banned, `owner_id = auth.uid()`, `points = 0`); AFTER INSERT trigger seats `clan_members`. Both tables are guest-readable. Membership has no client INSERT. No UPDATE policies (points stay 0 via PostgREST). Admin DELETE on both tables so clan delete can cascade. Then local reset, regenerate types, lint, build, SQL smoke.

Table names follow repo plurals (`runs`, `run_participants`): `clans` and `clan_members` (not `clan` / `membership`).

## Critical Implementation Details

**Do not join run tables.** Clan policies, the seating trigger, indexes, and grants must reference only `clans`, `clan_members`, `profiles` / `public_profiles`, `auth.uid()`, `is_admin()`, and `is_not_banned()`. A DEFINER helper that lists “runs by clan member” would reopen FR-028; F-02 must not add one.

**Cascade delete needs a child DELETE policy.** Postgres applies RLS to FK `ON DELETE CASCADE` for non-owner roles. `clans_delete_admin` alone is not enough — also `clan_members_delete_admin` plus `GRANT DELETE` on `clan_members`. There is no app path to unseat the owner; do not add a leave trigger in F-02.

**Seating function is trigger-only.** `REVOKE ALL` on the function from `public`. Do not `GRANT EXECUTE` to `anon` or `authenticated` (Supabase warns DEFINER functions in `public` become Data API callable if granted).

**Do not copy run-domain `ON CONFLICT`.** `seat_organizer_on_run_insert` swallows a duplicate seat on the same run. F-02’s membership PK is global `user_id`. Inserting a second clan with `ON CONFLICT DO NOTHING` would commit clan B with `owner_id` set and **no** membership row — contradicting Phase 2 smoke and Desired End State. Insert `(NEW.owner_id, NEW.id)` with no conflict clause so the PK aborts the outer `clans` INSERT. Do not add `UNIQUE(owner_id)` — the membership PK already encodes one clan per player.

## Phase 1: Author schema migration

### Overview

Create the migration SQL that defines tables, constraints, the owner-seat trigger, grants, and RLS for the F-02 contract.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_clan_domain_schema.sql` (create via `npx supabase migration new clan_domain_schema`)

**Intent**: Introduce the two clan-domain tables and the owner-as-first-member invariant so S-18 can insert and guests can SELECT without inventing the ERD.

**Contract**:
- `public.clans`: `id uuid PK default gen_random_uuid()`; `owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`; `name text NOT NULL` with nonempty trimmed CHECK (and a modest max length, same spirit as `runs_title_max_length_chk`); `tag text NOT NULL` with nonempty trimmed CHECK and a short max length; `points integer NOT NULL DEFAULT 0 CHECK (points >= 0)`; `created_at` / `updated_at timestamptz NOT NULL DEFAULT now()`. Unique index on `lower(btrim(tag))`. Index on `owner_id`. No picture column. No role enum.
- `public.clan_members`: `user_id uuid PK REFERENCES public.profiles(id) ON DELETE CASCADE` (at most one clan per player); `clan_id uuid NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE`; `created_at timestamptz NOT NULL DEFAULT now()`. Index on `clan_id`.
- Trigger: `SECURITY DEFINER`, `set search_path = ''`, AFTER INSERT ON `clans` → insert `(user_id, clan_id) = (NEW.owner_id, NEW.id)` into `clan_members` with **no** `ON CONFLICT` (do not copy `on conflict (run_id, user_id) do nothing` from `seat_organizer_on_run_insert`; the membership PK must abort a second clan for the same player). Revoke execute from public; no client EXECUTE grant.
- Enable RLS on both tables.

#### 2. Grants and RLS policies

**File**: same migration

**Intent**: Encode FR-014 / FR-016 / FR-017 / FR-028 for the foundation surface under the publishable key: verified create, guest directory + member roster, frozen points, no run leak, no self-join.

**Contract** (policy matrix):
- Grants: `REVOKE ALL ON TABLE … FROM public, anon` then `GRANT SELECT` both tables to `anon, authenticated`. `GRANT INSERT, DELETE` on `clans` to `authenticated`. `GRANT DELETE` on `clan_members` to `authenticated`. **No** `GRANT INSERT` or `GRANT UPDATE` on `clan_members`. **No** `GRANT UPDATE` on `clans` (PostgREST cannot change `points` or rename).
- **clans SELECT**: `clans_select_anon` / `clans_select_authenticated` — `USING (true)`.
- **clans INSERT** (`clans_insert_verified_owner`, `TO authenticated`): `WITH CHECK` that `(select auth.uid()) = owner_id`, `public.is_not_banned()`, `exists (select 1 from public.public_profiles p where p.id = owner_id and p.is_verified)`, and `points = 0`.
- **clans DELETE**: `clans_delete_admin` — `USING (public.is_admin())`.
- **clan_members SELECT**: `clan_members_select_anon` / `clan_members_select_authenticated` — `USING (true)`.
- **clan_members DELETE**: `clan_members_delete_admin` — `USING (public.is_admin())` (cascade + moderation). No INSERT/UPDATE policies on `clan_members`.
- No policies that mention `runs`, `run_participants`, `run_invites`, `are_friends`, `can_view_run`, or `is_run_invitee`.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` with AGENTS naming (`*_clan_domain_schema.sql`)
- SQL is valid enough that Phase 2 `db reset` can apply it (checked in Phase 2)

#### Manual Verification:

- Policy matrix in the migration matches the Contract above (spot-check by reading SQL)
- No picture column, officer/role enum, `create_clan` RPC, or references to `runs` / `run_participants` / `run_invites`

**Implementation Note**: After completing this phase and automated checks that apply, pause for human confirmation of the SQL review before Phase 2 if a second pair of eyes is needed; otherwise continue into local apply.

---

## Phase 2: Local verify + typed client

### Overview

Apply the migration on local Supabase, smoke-test the RLS matrix, and regenerate TypeScript `Database` types.

### Changes Required:

#### 1. Local apply

**File**: local Docker Supabase (CLI)

**Intent**: Prove the migration on a clean local database the same way later slices did.

**Contract**: `npx supabase start` (if needed) then `npx supabase db reset`. Fix SQL errors in the F-02 migration before proceeding. Do not push to the linked remote project in this change.

#### 2. RLS smoke checks

**File**: ad-hoc SQL via `psql` / Studio against local (JWT roles `anon` / `authenticated`)

**Intent**: Confirm guest vs verified vs unverified vs admin boundaries before types are committed.

**Contract**: At minimum verify:
- As anon: `SELECT` on `clans` and `clan_members` succeeds; `INSERT` into `clans` fails.
- As authenticated unverified (or banned): `INSERT` into `clans` fails.
- As authenticated verified, not banned: `INSERT` into `clans` with `owner_id = auth.uid()`, nonempty name/tag, `points` omitted or 0 succeeds; a `clan_members` row exists for that owner; inserting a second clan as the same user fails (unique `user_id`); `INSERT` with `points = 1` fails; `INSERT` into `clan_members` fails; `UPDATE clans SET points = 10` fails.
- Duplicate tag (case-insensitive / trimmed) fails.
- As admin: `DELETE` from `clans` removes the clan and its `clan_members` rows.
- Schema: no FK from clan tables to `runs`.

#### 3. Generated types

**File**: `src/types/database.ts` via `npm run db:types`

**Intent**: Make the schema callable from TypeScript for S-18 without hand-duplicating tables.

**Contract**: After reset, `npm run db:types`. File includes `clans` and `clan_members`. Do not hand-edit (ESLint ignores this generated file). `createClient` is already `createServerClient<Database>(...)` — no client wiring change unless types fail to compile.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` exits 0
- `src/types/database.ts` includes `clans` and `clan_members`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Anon / unverified / verified / admin smoke checks above behave as expected
- Studio (or `\d`) shows owner membership seated on insert without a second client write

**Implementation Note**: Pause for human confirmation of manual RLS smoke results before treating the change as ready for plan-review / implement close-out. Remote apply is `/gh-release` (tag `v*`), not this phase.

---

## Testing Strategy

### Unit Tests:

- None — repo has no test runner yet (`AGENTS.md`). Do not add Vitest solely for this change.

### Integration Tests:

- Local `db reset` + RLS smoke SQL (Phase 2) stands in for integration coverage.
- Lint + build gate TypeScript generation.

### Manual Testing Steps:

1. `npx supabase start` → `db reset` → confirm `clans` and `clan_members` plus the seating trigger in Studio.
2. As anon, select both tables; attempt insert → denied.
3. As unverified member, attempt insert → denied.
4. As verified member, insert a clan → one membership row for the owner; guest select returns name, tag, `points = 0`, and the member user id.
5. Same user inserts a second clan → unique violation; second clan with same tag (different case) → unique violation; insert with `points = 5` → denied.
6. Attempt client insert on `clan_members` and `UPDATE` of `points` → denied.
7. As admin, delete the clan → membership rows gone.
8. Confirm no clan object references `runs`.

## Performance Considerations

- Unique index on `lower(btrim(tag))` and PK on `clan_members.user_id` are the write-time guards; add `clan_members_clan_id_idx` for directory roster lookups.
- Keep `(select auth.uid())` in INSERT CHECK (existing repo RLS style). No extra DEFINER helpers in F-02, so no extra EXECUTE surface.

## Migration Notes

- Additive only; no backfill (no existing clans).
- Schema rollback is not supported via Worker rollback — fix forward with a new migration if required.
- Production apply is CD on tag `v*` (`npx supabase db push --linked`), not merge to `main` and not a phase of this plan.
- S-18 will `ALTER` in a picture/storage column; S-19 will add membership INSERT; S-23 will add the only points writer (likely `GRANT UPDATE` plus a tight policy/trigger). Do not pre-create those grants.

## References

- Roadmap F-02: `context/foundation/roadmap.md`
- PRD Access Control Changes, FR-014, FR-016, FR-017, FR-028: `context/foundation/prd-v2.md`
- Sibling foundation: `context/archive/2026-07-29-run-domain-schema/plan.md`
- Owner-seat trigger: `supabase/migrations/20260731111849_participant_apply_leave_and_organizer_seat.sql`
- Verified INSERT pattern: `supabase/migrations/20260821130000_friend_requests.sql`
- Guest SELECT + unique `lower(name)`: `supabase/migrations/20260825070003_player_labels.sql`
- Restricted-run leak surface (do not join): `supabase/migrations/20260824101006_restricted_run_visibility.sql`
- Types: `package.json` script `db:types`; client `src/lib/supabase.ts`
- Deploy migrations: `.github/workflows/deploy.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Author schema migration

#### Automated

- [x] 1.1 Migration file exists under `supabase/migrations/` with AGENTS naming (`*_clan_domain_schema.sql`) — 8f0aa32
- [x] 1.2 SQL is valid enough that Phase 2 `db reset` can apply it (checked in Phase 2) — 8f0aa32

#### Manual

- [x] 1.3 Policy matrix in the migration matches the Contract (SQL review) — 8f0aa32
- [x] 1.4 No picture column, officer/role enum, `create_clan` RPC, or references to `runs` / `run_participants` / `run_invites` — 8f0aa32

### Phase 2: Local verify + typed client

#### Automated

- [x] 2.1 `npx supabase db reset` exits 0
- [x] 2.2 `src/types/database.ts` includes `clans` and `clan_members`
- [x] 2.3 `npm run lint` passes
- [x] 2.4 `npm run build` passes

#### Manual

- [x] 2.5 Anon / unverified / verified / admin RLS smoke checks behave as expected
- [x] 2.6 Studio (or `\d`) shows owner membership seated on insert without a second client write
