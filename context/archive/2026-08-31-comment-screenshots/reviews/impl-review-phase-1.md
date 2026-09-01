<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Comment screenshots Implementation Plan

- **Plan**: context/changes/comment-screenshots/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation
- **Commit reviewed**: 8273109 (cherry-pick of 77e5541 onto `feature/comment-screenshots` from `main`)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence (Phase 1 only)

### Git / blast radius

- `8273109` files: change-folder artifacts, `supabase/migrations/20260831130723_comment_screenshots.sql`, `src/types/database.ts` (+7 generated lines).
- Implementation files in `77e5541` (clan-runs mistaken landing) vs `8273109` are identical for the SQL migration. Types on `8273109` do **not** contain `clan_only` / `is_same_clan`. Clan-runs was not mixed into this SHA.

### Plan vs actual

| Planned | Actual | Verdict |
|---------|--------|---------|
| `screenshot_path` + three CHECKs (regex, author bind, run bind) | Same constraint names and expressions as the plan contract | MATCH |
| Drop `run_comments_body_nonempty_chk`; add `run_comments_body_or_screenshot_chk`; keep max-length; body stays NOT NULL | Present; `body_max_length_chk` kept | MATCH |
| No GRANT UPDATE; no `run_comments` UPDATE policy | Migration does not GRANT UPDATE and adds no UPDATE policy | MATCH |
| Private bucket `comment-screenshots`, 5242880, jpeg/png/webp, `public=false` | Exact insert | MATCH |
| Helper `comment_screenshot_object_run_id`: STABLE, SECURITY DEFINER, `search_path=''`, uuid regex then cast else null; revoke public; grant authenticated | Exact | MATCH |
| Storage SELECT/INSERT/DELETE policies; no anon SELECT; no UPDATE policy | Three policies, `TO authenticated` only | MATCH |
| Types via `db:types`: `screenshot_path` on Row/Insert; helper in Functions | Generated shape; Insert optional; Update field is gen output | MATCH |
| Do not touch `clan-pictures` or comment-table INSERT/SELECT/DELETE policies | Migration does not | MATCH |

### Automated re-check (this review)

- `npx supabase db reset`: **not re-run** (shared local DB is on `20260831131219_manual_archive_and_extend`; reset would wipe parallel crews). Migration applied inside a transaction and rolled back: bucket/policies/constraints created as specified.
- `npm run db:types`: **not re-run** against this local DB (would pick up unrelated migrations). `8273109` types hunk is the generated `screenshot_path` + `comment_screenshot_object_run_id` only.
- CHECK expressions (temp table, same SQL as the migration): author-mismatch fail; run-mismatch fail; screenshot-only `body=''` ok; empty body + null path fail; text-only ok.
- Helper fail-closed: junk path → null; well-formed second folder → that uuid.
- `npm run lint` on worktree at `8273109` (after `astro sync`): exit 0 (0 errors, pre-existing warnings).
- `npm run build` on worktree at `8273109`: exit 0.
- JWT Storage API smoke (anon/confirmed INSERT/SELECT, archived author DELETE): **not re-executed here**. Policy SQL matches the plan verbatim. Residual: same class as skipped Studio 1.6.

### Manual

- 1.6 Studio: marked `[x]` with Progress note that YOLO skipped human Studio; SQL smoke 1.3 used as substitute. Not treated as REJECTED.

## Findings

### F1 — Authenticated still has table-level UPDATE on `run_comments`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260820092809_run_comments.sql:80 (pre-existing; Phase 1 did not change grants)
- **Detail**: Plan smoke 1.3 asks `has_table_privilege(..., 'UPDATE')` to stay false. Local `authenticated` still has UPDATE via default ALL grants (`relacl` includes `w`). S-12 granted `select, insert, delete` without `REVOKE UPDATE` (unlike `runs`). Phase 1 correctly did not GRANT UPDATE and added no UPDATE policy, so append-only remains RLS-enforced. This is not a Phase 1 regression.
- **Fix**: Optional later `revoke update on table public.run_comments from authenticated` if we want the smoke criterion to match privilege bits. Not required before Phase 2; no UPDATE policy means PostgREST still cannot update rows.
- **Decision**: PENDING

═══════════════════════════════════════════════════════════
  IMPLEMENTATION REVIEW: Comment screenshots Implementation Plan
  Scope: Phase 1 of 3  |  Date: 2026-08-31
  Findings: 0 critical 0 warnings 1 observation
═══════════════════════════════════════════════════════════

  Plan Adherence        PASS    ✅
  Scope Discipline      PASS    ✅
  Safety & Quality      PASS    ✅
  Architecture          PASS    ✅
  Pattern Consistency   PASS    ✅
  Success Criteria      PASS    ✅

  ► Overall: APPROVED

═══════════════════════════════════════════════════════════
  OBSERVATION FINDINGS ℹ️
═══════════════════════════════════════════════════════════

  F1 — Authenticated still has table-level UPDATE on run_comments
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
    Severity:  ℹ️ OBSERVATION
    Impact:    🏃 LOW — quick decision; fix is obvious and narrowly scoped
    Dimension: Safety & Quality
    Location:  supabase/migrations/20260820092809_run_comments.sql:80

    Detail:
    Plan smoke 1.3 wants has_table_privilege UPDATE false. authenticated
    still has UPDATE from default ALL grants. Phase 1 did not GRANT
    UPDATE and added no UPDATE policy. Append-only is RLS.

    Fix: Optional revoke update on run_comments from authenticated later.
         Not a Phase 2 blocker.
