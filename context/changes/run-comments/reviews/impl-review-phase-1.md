<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Run comments and likes

- **Plan**: context/changes/run-comments/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 9e16af7

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

Phase 1 product change is `supabase/migrations/20260820092809_run_comments.sql` plus regenerated `src/types/database.ts`. Commit `9e16af7` also seeded the change folder (plan, brief, plan-review, crew-decisions) and flipped S-12 in `context/foundation/roadmap.md` — expected 10x artifacts, not product scope creep. No Phase 2/3 files (`src/lib/services/comments.ts`, comment API routes, `RunComments` island). Dirty working tree is plan Progress SHA suffixes (` — 9e16af7`) plus crew-decisions timeline — ritual, not a defect.

Hosted Supabase does not yet list `20260820092809` (`supabase migration list` remote empty). Expected until `/gh-release`; not a Phase 1 defect. Local `supabase_migrations.schema_migrations` includes `20260820092809`.

### Plan vs actual (Phase 1)

| Planned item | Verdict |
|--------------|---------|
| `run_comments`: uuid pk, `run_id`/`author_id` CASCADE FKs, `body`, `created_at`, CHECKs `char_length(btrim(body)) > 0` and `<= 1000`, unique `(id, run_id)`, index `(run_id, created_at)` | MATCH — `run_comments_body_nonempty_chk`, `run_comments_body_max_length_chk`, `run_comments_id_run_id_key`, `run_comments_run_id_created_at_idx` |
| `run_comment_likes`: PK `(comment_id, user_id)`, `user_id` → profiles CASCADE, composite FK `(comment_id, run_id)` → `run_comments (id, run_id)` CASCADE, index `(run_id)` | MATCH — `run_comment_likes_comment_run_fkey`, `run_comment_likes_run_id_idx` |
| Helpers `is_run_organizer(uuid)`, `is_run_in_active_window(uuid)` clone `is_confirmed_participant` (DEFINER, `search_path = ''`, revoke public, execute to authenticated) | MATCH — organizer via `runs.organizer_id = (select auth.uid())`; window `archived_at is null AND starts_at > now() - interval '1 hour'` (= `activeWindowStartsAfter()` / `RUN_GRACE_MS`) |
| RLS on both tables; no anon policies or GRANTs; `{table}_{op}_{qualifier}` names | MATCH — 10 policies, all `to authenticated`; anon has zero table/function privileges |
| `run_comments` SELECT: confirmed / admin / organizer; INSERT own + confirmed + `is_not_banned` + active window with `(select auth.uid())`; DELETE `is_admin()` only; no UPDATE | MATCH |
| `run_comment_likes` SELECT same three predicates; INSERT/DELETE own + confirmed + not banned + active window; no admin unlike | MATCH |
| `GRANT SELECT, INSERT, DELETE` to `authenticated` only; no UPDATE grant | MATCH — live ACL `authenticated=ard…` (no `w` / UPDATE) |
| Do not inline `EXISTS` on `run_participants` | MATCH — policies call `is_confirmed_participant(run_id)` |
| `npm run db:types`; no hand-edits | MATCH — committed `src/types/database.ts` byte-identical to a fresh `supabase gen types typescript --local`; Tables `run_comments` / `run_comment_likes` + Functions `is_run_organizer` / `is_run_in_active_window` |

Supporting extra (not scored as scope creep): `run_comments_author_id_idx` and `run_comment_likes_user_id_idx`. Same FK-covering style as `runs_organizer_id_idx` / `run_participants_user_id_idx`. Same files, no new API surface.

### Safety & patterns

- Empty tables, no backfill. `ON DELETE CASCADE` from runs/profiles/comments is the planned rollback/takedown path (admin run-delete already removes comments; admin comment-delete cascades likes).
- Helpers are `SECURITY DEFINER` only to read `runs` without RLS recursion — same justified pattern as `is_confirmed_participant`. Bodies still key off `(select auth.uid())`. Execute is authenticated-only (`anon` cannot call them).
- Append-only holds: no UPDATE policy; authenticated has no UPDATE privilege. RLS would also deny UPDATE even if GRANT leaked.
- Authenticated leftover `TRUNCATE` / `REFERENCES` / `TRIGGER` / `MAINTAIN` (`Dxtm`) is the same default-privilege residue as `run_participants` / `nickname_change_requests`. PostgREST does not expose TRUNCATE; comments are stricter than `run_participants` (no anon SELECT, no UPDATE).
- Policy names and `(select auth.uid())` wrapper match `run_participants_*` / `nickname_change_requests_*`. `lessons.md` `?error=` rule does not apply this phase (no API routes).

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 1.1 Migration applies cleanly on local Supabase | PASS — not re-run `db reset` (destructive). Local catalog has both tables, helpers, 10 policies. `schema_migrations` includes `20260820092809` |
| 1.2 `npm run db:types`; tables appear in `src/types/database.ts` | PASS — committed file matches a fresh local gen |
| 1.3 `npm run lint` | PASS — exit 0; 44 pre-existing `no-console` warnings in unrelated files; 0 errors |
| 1.4 `npm run build` | PASS — `astro build` complete |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 1.5 As `anon`: SELECT on either table returns zero rows (no grant/policy) | `[x]` | Re-ran: `SET ROLE anon` → `permission denied for table run_comments` / `run_comment_likes` (stronger than empty-result; no GRANT) |
| 1.6 Confirmed participant INSERT comment + like / unlike; INSERT on archived fails | `[x]` | Not re-impersonated. Policies encode confirmed + `is_run_in_active_window`; crew-decisions: implementer SQL-verified |
| 1.7 Unseated organizer SELECT yes, INSERT no | `[x]` | Not re-impersonated. SELECT `is_run_organizer(run_id)` is independent of roster; INSERT requires `is_confirmed_participant` |
| 1.8 Admin SELECT any; DELETE comment cascades likes | `[x]` | Not re-impersonated. DELETE policy is `is_admin()` only; composite FK `ON DELETE CASCADE` present |
| 1.9 CHECK rejects empty/whitespace-only and bodies > 1000 | `[x]` | Re-ran in rolled-back txns: `'   '` and `repeat('a', 1001)` → `check_violation` |

## Findings

None.

## Residual risk

Full `npx supabase db reset` was not re-executed this review (local data wipe). Applied schema + `schema_migrations` stand in. Hosted project still lacks this migration until a tagged release. Authenticated TRUNCATE/REFERENCES/TRIGGER on public tables is repo-wide default residue, unchanged in kind by this slice (comments still have no anon access and no UPDATE). Role-play for 1.6–1.8 was not repeated here; policy SQL matches the locked ACL.

## Proceed

YOLO Done path: report saved; no triage (zero findings). `change.md` stays `implementing` (phase-scoped review; full-plan `impl_reviewed` is after all phases). Next stage is implement Phase 2.
