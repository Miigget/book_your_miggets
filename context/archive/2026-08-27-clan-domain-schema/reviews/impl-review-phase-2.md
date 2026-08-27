<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan-domain schema and RLS contract

- **Plan**: context/changes/clan-domain-schema/plan.md
- **Scope**: Phase 2 of 2
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: ee0072d (`feat(clan-domain-schema): Local verify + typed client (p2)`); epilogue e0097ed
- **File**: src/types/database.ts

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

Phase 2 Changes Required vs git `8f0aa32..ee0072d` plus this review's re-run:

| Planned item | Actual | Verdict |
|--------------|--------|---------|
| Local `npx supabase start` if needed, then `db reset`; no remote push | This review: `npx supabase db reset` exit 0; applied `20260827114633_clan_domain_schema.sql`; no `db push` in p2 commits | MATCH |
| Ad-hoc RLS smoke (anon / unverified / verified / admin) | Implement specialist ran JWT-impersonation SQL; this review re-ran the same script after a fresh reset — 16/16 steps `passed=t` | MATCH |
| `npm run db:types` → `clans` + `clan_members`; do not hand-edit | `src/types/database.ts` +85 lines of generated table types only. Fresh `npx supabase gen types typescript --local` diffs 0 vs committed file. ESLint ignores the file. | MATCH |

Git product surface of ee0072d is `src/types/database.ts`. Other files in that commit are process (`plan.md` Progress, `change.md`, `crew-decisions.md`, `reviews/impl-review-phase-1.md`). Epilogue e0097ed only stamps Progress SHAs and `implemented`. No UI, API routes, `create_clan` RPC, or run-table joins.

Generated `Database` types (lines 37–121):

- `clans` Row: `id`, `owner_id`, `name`, `tag`, `points`, `created_at`, `updated_at`. Insert makes `points`/`id` optional (DB defaults). Relationships: `clans_owner_id_fkey` → `profiles` / `public_profiles`, `isOneToOne: false` (matches locked skip of `UNIQUE(owner_id)`).
- `clan_members` Row: `user_id`, `clan_id`, `created_at`. `user_id` Relationship `isOneToOne: true` (PK). `clan_id` → `clans`. No picture column. No `runs` FK.
- Public `Functions`: no `create_clan`, no `seat_owner_on_clan_insert` (trigger-only; EXECUTE revoked).

Phase 1 interaction: reset re-applied the Phase 1 migration cleanly. Trigger `clans_seat_owner_after_insert` is present. Grants: anon SELECT only on both tables; authenticated INSERT+DELETE on `clans`, DELETE only on `clan_members`; no UPDATE on `clans`; no INSERT on `clan_members`. Policies match the Phase 1 matrix (7 policies).

## Success criteria (Phase 2)

| ID | Check | Result |
|----|--------|--------|
| 2.1 | `npx supabase db reset` exits 0 | PASS — this review, exit 0; last applied `20260827114633_clan_domain_schema.sql` |
| 2.2 | `src/types/database.ts` includes `clans` and `clan_members` | PASS — `clan_members:` L37, `clans:` L77; regen identical |
| 2.3 | `npm run lint` passes | PASS — 0 errors (123 pre-existing warnings, none in `database.ts`) |
| 2.4 | `npm run build` passes | PASS — `astro build` Complete |
| 2.5 | Anon / unverified / verified / admin RLS smoke | PASS — independently re-run after reset (see table below). Progress `[x]` is not rubber-stamped. |
| 2.6 | Owner membership seated on insert without a second client write | PASS — `2.6 trigger exists` + `2.6 owner seated on insert` (`member_count=1`) |

Independent smoke (same `/tmp` script the implementer used; local JWT impersonation, not Studio UI):

| Step | passed | detail |
|------|--------|--------|
| 2.6 owner seated on insert | t | member_count=1 |
| 2.6 trigger exists | t | clans_seat_owner_after_insert |
| admin delete cascades members | t | leftover_members=0 |
| anon insert clans denied | t | 42501 permission denied for table clans |
| anon reads directory row | t | ok |
| anon select clan_members | t | count=0 (empty after reset, before fixtures visible) |
| anon select clans | t | count=0 |
| banned insert denied | t | 42501 RLS |
| client insert clan_members denied | t | 42501 permission denied for table clan_members |
| duplicate tag denied | t | 23505 `clans_tag_lower_btrim_uidx` |
| insert points=1 denied | t | 42501 RLS |
| schema no fk to runs | t | fk_to_runs=0 |
| second clan unique user_id denied | t | 23505 `clan_members_pkey` |
| unverified insert denied | t | 42501 RLS |
| update points denied | t | 42501 permission denied for table clans |
| verified insert succeeds | t | clan_id set |

YOLO residual (already in `crew-decisions.md`): 2.5/2.6 executed as specialist SQL, not Studio click-through. Contract checks are the SQL matrix, not the UI.

## Findings

None.

## Dimension notes

- **Plan Adherence**: Local apply, generated types, and smoke contract all MATCH. Types were not hand-edited.
- **Scope Discipline**: "What We're NOT Doing" held. No create UI, picture, officers, clan runs, membership INSERT grant, points writer, or remote `db push`. Extra commit files are 10x process artifacts.
- **Safety & Quality**: RLS matrix holds under `anon` / `authenticated` JWT claims. Frozen points is grant-level (`has_table_privilege` UPDATE=false), not a generated `Update` type (supabase always emits `Update`; PostgREST still cannot PATCH). No secrets. No FK to `runs`.
- **Architecture**: Direct `INSERT` into `clans` under RLS; trigger seats membership; types only expose tables, not a new RPC.
- **Pattern Consistency**: Generated `Row`/`Insert`/`Update`/`Relationships` shape matches siblings (`friend_requests`). `eslint.config.js` already ignores `src/types/database.ts`.
- **Success Criteria**: 2.1–2.4 re-executed this review. 2.5–2.6 re-executed this review after a clean reset.

## Proceed

Crew override: no triage. Report saved; `change.md` → `impl_reviewed`. Next: archive is a separate step (not this invocation).
