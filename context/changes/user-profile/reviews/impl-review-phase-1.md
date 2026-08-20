<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Own profile, public profile, and clickable nicknames

- **Plan**: context/changes/user-profile/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 8ba2189

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

Phase 1 product change is the identity migration plus regenerated types. Commit `8ba2189` also seeded the change folder (`change.md`, plan, brief, plan-review, crew-decisions) — expected 10x artifacts, not product scope creep. No Phase 2/3 files (`src/pages/profile.astro`, profile APIs, `NicknameLink`, `/players/[id]`).

Hosted Supabase does not yet list `20260820071325` (`supabase migration list` remote empty). Expected until `/gh-release`; not a Phase 1 defect.

### Plan vs actual (Phase 1)

| Planned item | Verdict |
|--------------|---------|
| Migration suffix `user_profile_identity.sql` (timestamp may shift) | MATCH — `supabase/migrations/20260820071325_user_profile_identity.sql` |
| `profiles.kog_points integer null` + non-negative check | MATCH — `profiles_kog_points_non_negative_chk` |
| `profiles.kog_points_verified boolean not null default false` | MATCH |
| Recreate `public_profiles` as `id, nickname, is_verified, kog_points, kog_points_verified` only; `security_invoker = false`; GRANT SELECT to `anon, authenticated`; revoke from `public` | MATCH — live `reloptions {security_invoker=false}`; no email/role/ban |
| Enum `nickname_change_request_status`: pending / accepted / denied | MATCH |
| Table `nickname_change_requests` with FK cascade, nonempty `btrim` check, timestamps, default pending | MATCH — 32-char limit left to the app as planned |
| Partial unique index one pending row per `user_id` | MATCH — `nickname_change_requests_one_pending_per_user_uidx` |
| RLS: insert own pending; select own; update own pending (check still pending); admin select/update via `is_admin()` | MATCH — 5 policies, RLS enabled |
| Grants: `select, insert, update` to `authenticated`; no anon writes | MATCH — anon has no SELECT/INSERT/UPDATE/DELETE on the table |
| Replace `enforce_profile_privileged_columns` control flow (nick lock, points-flag clear, `updated_at`) | MATCH — trigger `profiles_enforce_privileged_columns` still attached (`tgenabled = O`); body matches the plan snippet |
| `npm run db:types`; do not hand-edit `database.ts` | MATCH — `src/types/database.ts` byte-identical to a fresh `supabase gen types typescript --local` |

Supporting extra (not scored as scope creep): non-unique `nickname_change_requests_user_id_idx` on `user_id`. The partial unique index only covers pending rows; this index helps own/admin SELECT of request history. Same file, no new API surface.

### Safety & patterns

- View stays `security_invoker = false` with SELECT-only grants to `anon` / `authenticated` — guests can read identity; clients cannot UPDATE the view. Column list excludes email, role, and ban. Banned rows are not filtered (plan + plan-review F6).
- Trigger is `SECURITY DEFINER` + `set search_path = ''` + `revoke all from public`, same as `20260729134008`. Non-admins cannot flip `role` / `is_verified` / `is_banned`; verified nickname is restored; `kog_points` change forces `kog_points_verified = false`; otherwise the old flag is restored (member cannot set it true). Admins skip the lock block.
- RLS uses `(select auth.uid())` and `{table}_{op}_{who}` names, matching `profiles_*` / `run_participants_insert_self_pending`. Own UPDATE WITH CHECK keeps `status = 'pending'` so members cannot self-accept.
- Additive migration only (`ALTER` / `CREATE` / `CREATE OR REPLACE`). No `DROP` of `public_profiles`. `ON DELETE CASCADE` on `user_id`.
- Anon TRUNCATE/TRIGGER/REFERENCES on new objects matches sibling tables (`maps`, `profiles`, `runs`) — default-privilege residue, not a Phase 1 regression. Anon still cannot SELECT `profiles` or write `nickname_change_requests`.
- `lessons.md` `?error=` rule does not apply this phase (no API routes).

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 1.1 Migration file exists with RLS on the new table and view columns excluding email/role/ban | PASS — file present; 5 policies; view def is the five identity columns |
| 1.2 `npx supabase db reset` (or project-equivalent apply) succeeds locally | PASS — not re-run (destructive). Local DB has columns, view, table, trigger, policies. `migration list` local `20260820071325` |
| 1.3 `npm run db:types` regenerates types including `kog_points`, `kog_points_verified`, `nickname_change_requests` | PASS — committed file matches a fresh local gen; enum + table + view fields present |
| 1.4 `npm run lint` | PASS — exit 0; 19 pre-existing `no-console` warnings in unrelated files; 0 errors |
| 1.5 `npm run build` | PASS — `astro build` complete |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 1.6 Unverified can UPDATE nickname; verified UPDATE leaves nickname unchanged | `[x]` | Re-ran locally in a rolled-back txn: unverified `rev_unverified` → `rev_unverified_2`; verified stayed `rev_verified` |
| 1.7 Member UPDATE of `kog_points` clears the flag; member cannot set the flag true | `[x]` | Points 10→20 set flag false; subsequent `SET kog_points_verified = true` left flag false |
| 1.8 Second pending request hits the unique index unless updated in place | `[x]` | Second INSERT → `unique_violation`; in-place UPDATE replaced pending string to `new_nick_b` |
| 1.9 `anon` SELECT on `public_profiles` sees new columns; SELECT of `profiles` as anon fails | `[x]` | Anon sees `id,nickname,is_verified,kog_points,kog_points_verified`; `SELECT profiles` → `insufficient_privilege` |

## Findings

None.

## Residual risk

Full `npx supabase db reset` was not re-executed this review (local data wipe). Applied schema + `migration list` stand in. Hosted project still lacks this migration until a tagged release. Anon/authenticated TRUNCATE on public tables is repo-wide default residue, unchanged by this slice.

## Proceed

YOLO Done path: report saved; no triage (zero findings). `change.md` stays `implementing` (phase-scoped review; full-plan `impl_reviewed` is after all phases). Next stage is implement Phase 2.
