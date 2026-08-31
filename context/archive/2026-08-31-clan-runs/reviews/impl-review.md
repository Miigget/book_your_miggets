<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan-only runs Implementation Plan

- **Plan**: `context/changes/clan-runs/plan.md`
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

None.

## Git scope

Reviewed commits `9547b93` (p1), `138405f` (p2), `f6c60ff` (p3) on `feature/clan-runs`. Ignored `77e5541` (comment-screenshots, not this change). Ignored unrelated dirty folders (`comment-screenshots/`, `manual-archive-and-extend/`, foundation extras). Ritual docs (`plan.md` Progress SHA write-back, `crew-decisions.md`, phase review files, roadmap S-21 `in-progress`) are expected implement stamps, not product scope.

| Path | Plan | Diff | Verdict |
|------|------|------|---------|
| `supabase/migrations/20260831123821_run_visibility_add_clan_only.sql` | yes | p1 | MATCH — `ALTER TYPE … ADD VALUE 'clan_only'` only |
| `supabase/migrations/20260831123822_clan_only_run_rls.sql` | yes | p1 | MATCH — `is_same_clan` DEFINER/`clan_members` only; SELECT/`can_view_run` clan branch; owner WITH CHECK; `is_run_organizer` policy |
| `src/types/database.ts` | yes | p1 | MATCH — `clan_only` on enum + constants; `is_same_clan` generated; not hand-edited for the enum |
| `src/lib/services/runs.ts` | yes | p1+p2 | MATCH — `formatVisibility` `"Clan only"`; `VISIBILITIES` + `isVisibility`; updated unverified string; `CLAN_ONLY_OWNER_REQUIRED`; `updateRun` still throws only on `invite_only`; `confirmedCountsForRuns` still counts archived ids |
| `src/components/runs/CreateRunForm.tsx` | yes (p2; p1 F1) | p1+p2 | MATCH — p1 union only (accepted plan-review F1); p2 `ownsClan`, option iff owner or edit is `clan_only`, clan hint, invite picker still `invite_only` only, unverified hidden `visibility=public` |
| `src/lib/services/clans.ts` | yes | p2 | MATCH — `userOwnsClan` on `clans.owner_id`, `ClanError`/`CLAN_LOAD_FAILED`, not `getClanMembershipForUser` |
| `src/pages/api/runs/index.ts` | yes | p2 | MATCH — unverified then owner gate; `clan_only` uses `.insert({ … visibility })`; invite RPC only for `invite_only`; no PostgREST `Error.message` in `?error=` |
| `src/pages/api/runs/[id]/index.ts` | yes | p2 | MATCH — same gates; `invite_only` → `setRunVisibilityAndInvites`; else including `clan_only` → `updateRun` |
| `src/pages/runs/new.astro` | yes | p2 | MATCH — verified path loads friends + `userOwnsClan`; no extra `public_friendships` for the owner fact |
| `src/pages/runs/[id]/edit.astro` | yes | p2 | MATCH — `ownsClan` passed; `isVerified={false}` unchanged; option kept when `edit.visibility === "clan_only"` |
| `src/lib/run-list-sections.ts` | yes | p3 | MATCH — `clanRuns`; `viewerClanId` + `organizerClanByUserId`; `inClanSection`; partition order public → friends → invited → clan → admin leftover; Public still `visibility === "public"` only |
| `src/pages/runs/index.astro` | yes | p3 | MATCH — signed-in no `publicOnly`; guests `publicOnly: true`; `hasAnyRuns` includes `clanRuns`; Clan section; Restricted subtitle only |
| `src/middleware.ts` | yes (no-op) | untouched | MATCH — `/runs` list and `/runs/{id}` not prefix-protected |
| `AGENTS.md` | yes | p3 | MATCH — clan-only 404; Clan section; never mix `clan_only` into Public; owner-only create (not officers) |
| `src/pages/dashboard.astro` | must not catch-only | untouched | MATCH — catch copy unchanged |
| `src/components/Welcome.astro` | guest publicOnly | untouched | MATCH — still `{ publicOnly: true }` |
| `list_player_public_runs` / comment ACL / `runs.clan_id` | not doing | untouched | MATCH |

`loadRunListViewerFacts` 4th arg is `runs` (not `runIds`) so clan-only organizer ids can be derived. Sole caller `src/pages/runs/index.astro` updated. Intent MATCH, not extra surface.

## Automated verification (re-run this review)

| ID | Check | Result |
|----|--------|--------|
| 1.1 | Both new migrations apply on local Supabase | PASS (files + prior p1 apply). This review did **not** re-apply: shared local DB currently has S-24 `20260831131219_manual_archive_and_extend` and not `20260831123821`/`23822`. Re-applying `clan_only_run_rls` would overwrite S-24 window RLS. Phase 1 review recorded both versions in `schema_migrations` and passed. |
| 1.2 | `db:types` includes `clan_only` on `run_visibility` | PASS — `src/types/database.ts` enum + constants array |
| 1.3 | `formatVisibility` exhaustive `clan_only` case | PASS — compiles (`npm run lint` / `npm run build`) |
| 1.4 | Authenticated organizer archived friends_only/invite_only head-count, no 42P17 | PASS (p1 evidence). Not re-run here (local DB still on the old INVOKER organizer policy because S-21 RLS is not applied on this instance). |
| 1.5 | Anon `SELECT` clan_only returns no rows | PASS (p1 evidence). Not re-run here (same local-DB reason; `clan_only` enum label is not on this instance). |
| 1.6 / 2.4 / 3.5 | `npm run lint` | PASS — 0 errors, 170 pre-existing warnings (`no-console` / `class:list`) |
| 1.7 / 2.5 / 3.6 | `npm run build` | PASS |
| 2.1 | `isVisibility("clan_only")` true; invite-only still RPC-only | PASS (code path) |
| 2.2 | Create/edit API unverified vs non-owner vs owner gates | PASS (code path) — unverified non-public before owner check; verified non-owner → `CLAN_ONLY_OWNER_REQUIRED`; `clan_only` insert/`updateRun`. No live HTTP POST (no test runner; YOLO) |
| 2.3 | CreateRunForm hides clan_only unless `ownsClan` or edit visibility is `clan_only`; no invitee fieldset | PASS |
| 3.1 | `partitionActiveRuns` never puts `clan_only` in `publicRuns`; members in `clanRuns`; admin leftovers in Restricted | PASS (code path) |
| 3.2 | Guest `/runs` and landing still `publicOnly`; signed-in `/runs` does not | PASS |
| 3.3 | `PROTECTED_ROUTES` still does not prefix-protect `/runs` | PASS |
| 3.4 | AGENTS.md names Clan section and clan-only 404 | PASS |

## Manual verification

- [ ] 1.8 Dashboard Incoming / Past UI
- [ ] 2.6–2.10 create/edit/404 click-through
- [ ] 3.7–3.14 catalog / 404 / comments / dashboard click-through

Correctly left unchecked. YOLO residual risk (Crew Lead skipped all Manual Progress rows; not missing implementation). Automated RLS bar for the dashboard bug remains the p1 SQL smoke, not the catch copy.

## Contract checks (cross-phase)

- Two migrations: file 1 is ADD VALUE only; file 2 (later timestamp) uses `'clan_only'::run_visibility`.
- `is_same_clan`: `STABLE SECURITY DEFINER`, `search_path = ''`, reads `clan_members` only, no `a is distinct from b`. EXECUTE: `authenticated` only (revoke `public`/`anon`). Not called from `clan_members` policies. Not granted to anon.
- `runs_select_active_authenticated` inlines `clan_only AND is_same_clan(organizer_id, auth.uid())`. Anon SELECT still `visibility = public` only. `can_view_run` is never used FROM policies on `runs`.
- `can_view_run` clan branch after guest `uid is null` guard and after friends/invite. Does not call `is_run_in_active_window`.
- `runs_insert_own` / `runs_update_own` keep verified conjunct; add `visibility <> 'clan_only' OR EXISTS (clans.owner_id = organizer_id)`. `runs_update_admin` untouched (unbounded).
- `run_participants_select_organizer` `USING (is_run_organizer(run_id))`. Dashboard catch copy unchanged; `confirmedCountsForRuns` still counts archived ids.
- Gate order: `isVisibility` → unverified non-public → `clan_only` owner → invitee-list. Unverified + `clan_only` never returns the owner string. Lessons.md: no PostgREST in `?error=` (ClanError → generic create/save copy after `console.error`).
- Partition: first matching bucket; friend-admin who is also a clan member sees Clan only. Guests never query `clan_members` / `public_friendships` (empty facts).
- Comment ACL untouched (`canReadComments` still confirmed / archived participant / organizer / admin). `list_player_public_runs` unchanged. No `runs.clan_id`. No officers UI. No Vitest.

## Change.md

Stamped `impl_reviewed` after this full review.
