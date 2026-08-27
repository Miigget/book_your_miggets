<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create clan directory — Implementation Plan

- **Plan**: context/changes/create-clan-directory/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 456f414 (`feat(create-clan-directory): Picture column + Storage bucket (p1)`)
- **Files**: `supabase/migrations/20260827130638_clan_picture_storage.sql`; `src/types/database.ts`

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

Phase 1 Changes Required vs `456f414`:

| Planned item | Actual | Verdict |
|--------------|--------|---------|
| `picture_path text null` + `clans_picture_path_chk` (null or `{uuid}/{uuid}.{jpg\|jpeg\|png\|webp}`) | Constraint present, definition identical to the plan snippet | MATCH |
| Do not `GRANT UPDATE` / do not add a clans UPDATE policy; leave `clans_insert_verified_owner` as-is | `has_table_privilege` UPDATE=false for `anon` and `authenticated`; 0 UPDATE policies on `public.clans`; INSERT+DELETE still granted to `authenticated` | MATCH |
| Public bucket `clan-pictures`, `file_size_limit = 1048576`, MIME jpeg/png/webp | `storage.buckets` row: `public=t`, `1048576`, `{image/jpeg,image/png,image/webp}` | MATCH |
| `storage.objects` SELECT to `anon` + `authenticated` on that bucket; INSERT/DELETE folder-scoped to `auth.uid()`; no UPDATE | 4 policies: `clan_pictures_select_anon` / `_authenticated` (`using (bucket_id = 'clan-pictures')`), `clan_pictures_insert_own_folder` / `_delete_own_folder` (`(storage.foldername(name))[1] = (select auth.uid()::text)`); no UPDATE policy mentioning `clan-pictures` | MATCH |
| No index on `clans.points` | `pg_indexes` has none | MATCH |
| `npm run db:types` — `clans.Row` / `Insert` gain `picture_path`; do not hand-edit | +3 generated lines only; fresh `npx supabase gen types typescript --local` diffs 0 vs committed file | MATCH |

Git scope of `456f414` is the migration + types plus earlier 10x artifacts (`change.md`, `plan.md`, `plan-brief.md`, `research.md`, `plan-review.md`, `crew-decisions.md`). No extra product files. Working-tree dirt (`roadmap.md`, `shape-notes.md`, untracked foundation files) is not part of this commit.

SELECT `using (bucket_id = 'clan-pictures')` is the documented public-access form (Context7 `/supabase/supabase` “Public Access”) and is the safe reading of the plan’s “`using (true)` on that bucket”. A bare `using (true)` would open every bucket.

## Success criteria (Phase 1)

| ID | Check | Result |
|----|--------|--------|
| 1.1 | `npx supabase db reset` exits 0 (migration after F-02) | PASS — this review applied `20260827114633_clan_domain_schema.sql` then `20260827130638_clan_picture_storage.sql`. CLI then exited 1 on `supabase_storage_* container is not ready: starting` (local Docker flake). Schema/bucket/policies present afterward; not a migration defect. Implementer recorded exit 0 at `456f414`. |
| 1.2 | `npm run db:types` — `picture_path`; not hand-edited | PASS — Row `picture_path: string \| null`; Insert optional; regen identical |
| 1.3 | SQL smoke: bucket; no clans UPDATE; verified INSERT with `picture_path`; UPDATE picture/points denied; unverified INSERT fails; anon SELECT | PASS — independent re-run of `/tmp/clan-picture-storage-smoke.sql` after reset: 8/8 `passed=t`, `ALL PASSED` |
| 1.4 | `npm run lint` exits 0 | PASS — 0 errors (123 pre-existing warnings; `database.ts` is eslint-ignored) |
| 1.5 | `npm run build` exits 0 | PASS — `astro build` Complete |
| 1.6 | Local Studio: nullable column + bucket 1 MiB jpeg/png/webp | YOLO skip — not a defect. Residual: confirm in Studio. SQL already shows `picture_path` nullable and the bucket row. |

Independent smoke (JWT impersonation, rolled back):

| Step | passed | detail |
|------|--------|--------|
| bucket public clan-pictures 1MiB jpeg/png/webp | t | public=t limit=1048576 mimes={image/jpeg,image/png,image/webp} |
| no storage.objects UPDATE policy on clan-pictures | t | |
| authenticated INSERT+DELETE, no UPDATE on clans | t | auth I=t D=t U=f anon U=f I=f |
| verified INSERT picture_path set, points omitted | t | rows=1 |
| UPDATE picture_path denied | t | permission denied for table clans |
| UPDATE points denied | t | permission denied for table clans |
| unverified INSERT denied | t | 42501 RLS |
| anon SELECT picture_path | t | rows=1 |

## Findings

None.

## Residual (not findings)

- **1.6 Studio visual** skipped under YOLO (human-action). Column nullability and bucket limits are evidenced by SQL; Studio click-through is residual risk only.
- **`db reset` CLI flake** on Storage container restart after a successful apply. Re-check `npx supabase status` if a later phase needs Storage HTTP, not Postgres.

## Dimension notes

- **Plan Adherence**: Column, CHECK, bucket, MIME/size, storage RLS (SELECT/INSERT/DELETE, no UPDATE), and generated types all MATCH. F-02 INSERT policy and frozen points grants untouched.
- **Scope Discipline**: “What We're NOT Doing” held — no `GRANT UPDATE` on `clans`, no R2, no UI/API, no `/clans` routes, no `points` index, no comment-screenshot bucket. Extra commit files are 10x process artifacts.
- **Safety & Quality**: Path CHECK blocks URLs/open-redirects. Folder-scoped storage INSERT/DELETE uses `(select auth.uid()::text)`. Public SELECT is bucket-scoped. Points freeze is still grant-level (`has_table_privilege` UPDATE=false); generated `clans.Update.picture_path` does not grant PostgREST PATCH (same as F-02). No secrets. No FK to `runs`.
- **Architecture**: Additive migration only; picture remains INSERT-time for Phase 2. S-20 reuse is documented in the migration header (helper later, not this public bucket).
- **Pattern Consistency**: Policy naming and `(select auth.uid()…)` match F-02 / friends. Storage is greenfield; SQL `insert into storage.buckets` and `using (bucket_id = …)` match current Supabase docs.
- **Success Criteria**: 1.1–1.5 re-executed this review. 1.6 is YOLO residual, not rubber-stamping.

## Proceed

Crew override: no triage (YOLO informational / Done). Report saved; `change.md` stays `implementing` so the crew does not route `impl_reviewed` → archive. Next: `/10x-implement create-clan-directory` Phase 2.
