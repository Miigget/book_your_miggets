<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create clan directory — Implementation Plan

- **Plan**: context/changes/create-clan-directory/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: `456f414` (p1), `67cd0b6` (p2), `7eb291b` (p3)
- **Prior phase reviews**: `impl-review-phase-1.md`, `impl-review-phase-2.md`, `impl-review-phase-3.md` — each APPROVED, 0 findings. This pass is an independent full-plan sweep, not a rubber-stamp.

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

Product files in `456f414^..7eb291b` vs plan Changes Required:

| Planned item | Actual | Verdict |
|--------------|--------|---------|
| P1 migration: `picture_path` + CHECK `{uuid}/{uuid}.{jpg\|jpeg\|png\|webp}`; public `clan-pictures` 1 MiB jpeg/png/webp; storage SELECT/INSERT/DELETE, no UPDATE; no `GRANT UPDATE` on `clans`; no `points` index | `supabase/migrations/20260827130638_clan_picture_storage.sql`; SELECT scoped with `bucket_id = 'clan-pictures'` (tighter than bare `using (true)`) | MATCH |
| P1 types: `clans.Row`/`Insert` gain `picture_path`; not hand-edited | `src/types/database.ts` (+3 generated lines) | MATCH |
| P2 `src/lib/storage.ts`: bucket, MIME, 1 MiB, path builder, upload/public URL/remove; in-process + bucket-limit → fixed picture string | All helpers; `StorageImageError` / `PICTURE_REJECT_MESSAGE`; Storage `error.message` logged, not forwarded | MATCH |
| P2 `clans.ts`: `ClanError` fixed strings; `requireVerifiedViewer`; membership lookup; create (upload then INSERT, omit `points`); 23505 blob `includes`; `public_profiles` id+nickname; rank points DESC, name ASC, id ASC | `mapClanCreateConstraintError`; `removeObject` on insert fail; no `email` / no `profiles` / no `runs` | MATCH |
| P2 `POST /api/clans`: FormData; unauth sign-in; verified / nickname-locked gates; success `/clans/{id}`; fail fixed `?error=` | Same HTTP shape as `POST /api/runs`; lessons.md held | MATCH |
| P2 `/clans/new` + `CreateClanForm`: protect `/clans/new` only; banned / unverified / already-member branches; multipart optional file | `PROTECTED_ROUTES` includes `/clans/new`; no `"/clans"` | MATCH |
| P3 ranked `/clans` + `ClanCard`; detail `/clans/{id}` 404 not 403; chrome Clans / Browse Clans / Browse clans; no New clan; `safeAuthReturnTo` `/clans/{uuid}`; AGENTS.md Hard Rules | All present. Exact `/clans` return-to omitted (optional). Roadmap Baseline rewrite correctly skipped (not “Absent: clan tables”) | MATCH |

Process extras in the three commits (`change.md`, `crew-decisions.md`, `plan-brief.md`, `plan.md`, `research.md`, `plan-review.md`) are 10x artifacts, not product scope.

### Cross-phase

| Check | Result |
|-------|--------|
| Picture-at-INSERT; F-02 no-UPDATE freeze intact | MATCH — no `.from("clans").update`; migration has no GRANT UPDATE / no clans UPDATE policy |
| P2 success redirect `/clans/{id}` has a page | MATCH — `[id].astro` in p3 |
| Email never on clan pages | MATCH — roster `public_profiles` `id, nickname` only |
| Directory uses `listClans` ranking | MATCH |
| `/clans/new` is static; `[id]` does not capture `"new"` | MATCH (`isUuid` would 404 anyway) |

Plan-review F1–F3 (blob `includes`, picture reject string, verified-without-nickname locked copy) are implemented.

## Success criteria

| ID | Check | Result |
|----|--------|--------|
| 1.1 | `npx supabase db reset` exits 0 | PASS — independently verified in phase-1 review (apply succeeded; CLI flake on Storage container restart is residual). Not re-run this pass (destructive). |
| 1.2 | `npm run db:types` — `picture_path`; not hand-edited | PASS — phase-1 review regen identical; this pass confirms Row `string \| null`, Insert optional |
| 1.3 | SQL smoke: bucket; no clans UPDATE; verified INSERT; UPDATE denied; unverified INSERT fails; anon SELECT | PASS — phase-1 review independent re-run: 8/8 `passed=t` |
| 1.4 / 2.1 / 3.1 | `npm run lint` exits 0 | PASS — this review: 0 errors, 141 pre-existing `no-console` / Topbar `class:list` warnings |
| 1.5 / 2.2 / 3.2 | `npm run build` exits 0 | PASS — this review: `astro build` Complete (Cloudflare server) |
| 2.3 / 3.3 | `PROTECTED_ROUTES` has `/clans/new` not `/clans`; AGENTS.md does not prefix-protect `/clans` | PASS — middleware `["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile", "/clans/new"]`; AGENTS.md Hard Rules include `/clans/new`, “do not prefix-protect `/clans`”, members from `public_profiles` (no email) |
| 1.6, 2.4–2.10, 3.4–3.9 | Manual Studio / browser | YOLO skip — not a defect. Progress rows left unchecked (not rubber-stamping). |

## Findings

None.

## Residual (not findings)

- **Human-action manuals** (1.6, 2.4–2.10, 3.4–3.9) skipped under YOLO. Code paths for gates, 23505 mapping, picture reject, ranking, 404, CTAs, nickname-only roster, and no `runs` join are present. Browser click-through and Studio object path remain residual risk.
- **Phase-1 `db reset` Storage container flake** after a successful apply — local Docker, not a migration defect.
- **Committed `roadmap.md` Baseline** was not rewritten in `7eb291b` (plan trigger phrase absent). Working-tree v3 regen already lists F-02 clan tables — do not patch the old file on top of that regen.
- **`/clans/new` back link** remains `← Home` (not in Phase 3 Changes Required).

## Dimension notes

- **Plan Adherence**: All 13 Changes Required items MATCH. No MISSING. No intent DRIFT. Storage SELECT `using (bucket_id = 'clan-pictures')` is the safe reading of “`using (true)` on that bucket.”
- **Scope Discipline**: “What We're NOT Doing” held — no friend invites, clan runs, officers UI, `GRANT UPDATE`, R2/data URLs, comment-screenshot reuse of `clan-pictures`, prefix-protect `/clans`, pagination, tag-slug URLs, New clan chrome, client `clan_members` writes, extra DEFINER helpers, or clan↔runs joins. Benign extras: name/tag parse strings, client MIME/size UX, config/profile fail copy on POST.
- **Safety & Quality**: Email off clan pages; points freeze grant-level; `picture_path` CHECK blocks URLs; storage INSERT/DELETE folder-scoped to `auth.uid()`; `?error=` is `ClanError` / fixed copy (lessons.md); XSS via Astro/React text interpolation; missing clan 404 never 403; `safeAuthReturnTo` uuid-only.
- **Architecture**: Pages thin; service owns DTOs/ranking/constraint map; bucket-parameterized helper stays decoupled for S-20 (must not reuse `clan-pictures`). Picture remains INSERT-only.
- **Pattern Consistency**: `POST /api/runs`, `friends.ts` verified lookup, `mapRunMapCategoryConstraintError`, `/runs` list chrome, `/players/{id}` 404/`dl`/`NicknameLink`. `new.astro` maps non-`ClanError` load failures to a generic string (stricter than `runs/new` `err.message`) — aligns with lessons.md.
- **Success Criteria**: Automated re-checked this review (lint, build, routes/docs). Phase-1 schema smoke cited from same-day independent phase review. Manuals are YOLO residual, not rubber-stamping.

## Proceed

Crew override: YOLO informational / Done. No triage (0 findings). Report saved; `change.md` stamped `impl_reviewed`. Do not archive from this invocation.
