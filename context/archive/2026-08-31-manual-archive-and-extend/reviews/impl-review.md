<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual archive, extend, and active-run cap

- **Plan**: `context/changes/manual-archive-and-extend/plan.md`
- **Scope**: Phase 1–3 of 3 (full plan)
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

## Review notes (not findings)

Known adaptations, accepted by crew / prior phase reviews — do not reopen as drift:

- Progress **1.9 N/A**: live RLS rewritten from S-15 (`20260824101006`). `clan_only` / `is_same_clan` are absent on this branch. S-21 must retarget `is_run_active_row` when it merges (`crew-decisions.md` **p1-rls-base**).
- Progress **1.12–1.13**, **2.6–2.14**, **3.5–3.12** Manual: left unchecked; skipped as YOLO human-action. Do not REJECT. Residual risk: Studio grant UI, guest/signed-in list click-through, Archive/Extend/admin Delete, 5-cap banner, player Incoming/Recent hrefs, and home preview were not exercised in a browser. Code/SQL contract was re-checked from source + prior phase SQL smokes.
- `list_player_public_runs`: `DROP FUNCTION` then `CREATE` + re-GRANT because `CREATE OR REPLACE` cannot change `RETURNS TABLE`. Query still has no time predicate.
- `src/pages/runs/[id]/edit.astro` `extendedUntil` prop and `OrganizerRunLifecycleControls` `timeZone` are implied by Phase 2/3 contracts, not scope creep.
- `prd.md` **FR-013** and US-06 still mention the v1 1-hour grace. Phase 3 contract was Guardrails + US-01 **Then** only; `prd-v2.md` remains the v2 source.
- This review could not re-run Phase 1 SQL smokes (Docker/Supabase local not available in this worktree). Phase 1 impl-review recorded PASS on catalog, backfill, cap, RPCs, grants, and `list_player_public_runs`. Live defs were re-read from `20260831131219_manual_archive_and_extend.sql`.

### Git vs plan (full)

Commits `fd08d41` (p1), `c9f6275` (p2), `5079165` (p3) on `feature/manual-archive-and-extend`. Extra paths (`context/changes/…`, `roadmap.md`) are 10x workflow artifacts.

| Planned | In diff | Verdict |
|---------|---------|---------|
| `supabase/migrations/<ts>_manual_archive_and_extend.sql` | `20260831131219_manual_archive_and_extend.sql` | MATCH |
| `src/types/database.ts` via `npm run db:types` | regenerated; `extended_until` + `archive_run` / `extend_run` | MATCH |
| `src/lib/run-lifecycle.ts` | stamp + elapsed extend; `MAX_ACTIVE_RUNS_PER_ORGANIZER = 5`; no `RUN_GRACE_MS` | MATCH |
| `src/lib/services/runs.ts` | `mapRunRow` / RPC map / inventory / cap / `archiveRun` / `extendRun` | MATCH |
| `src/lib/services/participants.ts` / `comments.ts` | mutation gates use `isRunActive`; comment **read** ungated | MATCH |
| `src/pages/api/runs/index.ts` | 5-active fail string after profile/nickname | MATCH |
| `src/components/runs/CreateRunForm.tsx` | four-arg `isRunActive`; create still requires future start | MATCH |
| `src/pages/api/runs/[id]/archive.ts` / `extend.ts` | POST; `runFail`; infra log + fixed strings | MATCH |
| `src/pages/api/admin/runs/[id]/archive.ts` | admin gate like Delete; `archiveRun`; Delete untouched | MATCH |
| `OrganizerRunLifecycleControls.tsx` | Archive + 1/2/3/6; no `"use client"`; `cn()` | MATCH |
| `src/pages/runs/[id].astro` | organizer island; admin `showArchive`; `?error=` for organizer or admin | MATCH |
| `AdminRunControls.tsx` | “Archive run” above Delete | MATCH |
| `src/pages/runs/new.astro` | hide form at cap; same 5-active string | MATCH |
| `AGENTS.md` / `prd.md` Guardrails + US-01 Then | archive/extend POST, 5-cap, no 1h auto-archive | MATCH |

Unplanned product code: none besides implied edit prop / `timeZone`. “What We're NOT Doing” held: no un-archive, no cron/lazy stamp, no admin extend, no owner hard-delete, no comment-read ACL widen, no 403-for-restricted, no Vitest, no `/runs` prefix-protect.

### Cross-phase contract (SQL ↔ TS ↔ HTTP)

- Audience-active: SQL `archived_at IS NULL AND (extended_until IS NULL OR extended_until > now())` matches TS `archivedAt == null` and (`extendedUntil` null or `now >= deadline` → inactive). Equality at the deadline is inactive on both sides.
- `mapRunRow` uses `isRunActive` then `getRunLifecyclePhase` (not time-only). Inverse `mapArchivedRunRow`. `runRowFromPublicRpc` maps `extended_until`.
- Organizer/admin SELECT stays unbounded; app list/detail/mutation loaders filter with `.is("archived_at", null)` + `.or(...)` and/or `isRunActive`.
- Cap: UI hide + API pre-check + `create_invite_only_run` UX raise + BEFORE INSERT `pg_advisory_xact_lock(8724, …)` then count. Same `active_run_cap` / `P0001` mapped to the fixed string. Elapsed-extend unstamped does not occupy a slot (`is_run_active_row` / `isRunActive`).
- `archive_run` / `extend_run` DEFINER, `search_path = ''`, `EXECUTE` authenticated only. Soft codes. Organizer banned → `banned`; admin archive of someone else’s run works; admin non-owner extend → `not_found`. Column UPDATE grant omits `archived_at` / `extended_until` / `organizer_id`.
- HTTP: cookie-session POST only; invalid UUID / no session match comment helpers; `RunError` → `runFail`; other errors `console.error` + fixed copy (lessons.md opaque `?error=`). Middleware banned POST gate still covers `/api/runs/{id}/archive|extend` and `/api/admin/runs/{id}/archive` (no exemption).
- `PROTECTED_ROUTES` unchanged; `/runs` not prefix-protected.
- `Welcome.astro` still `listActiveRuns(..., { publicOnly: true })`. Player Incoming/Recent still split on `isRunActive`; Recent href still `canOpenArchivedRunDetail`. Archived detail: no apply/leave island; comment write gated (`canPostOrLike` requires `!isArchived`).

### Automated verification (this review)

| Item | Result |
|------|--------|
| 1.1–1.9, 1.14 SQL smokes | Not re-run here (no Docker). PASS in phase-1 review; migration source re-read MATCH |
| 1.2 types | PASS — `extended_until` on `runs` Row/Insert/Update; `archive_run` / `extend_run`; RPC Returns includes `extended_until` |
| 1.10 / 2.1 / 3.1 `npm run lint` | PASS (exit 0; 0 errors; existing warnings only, including expected `console.error` on archive/extend routes) |
| 1.11 / 2.2 / 3.2 `npm run build` | PASS |
| 2.3 No `RUN_GRACE_MS` / `activeWindowStartsAfter` / `archiveDeadlineAt` under `src/` | PASS (`rg` empty) |
| 2.4 `mapRunRow` / inventory / RPC map use `isRunActive` + `extended_until` | PASS |
| 2.5 Create API 5-active string; `archiveRun` / `extendRun` exist | PASS |
| 3.3 AGENTS.md archive/extend POST + 5-cap; `PROTECTED_ROUTES` does not prefix-protect `/runs` | PASS |
| 3.4 `prd.md` Guardrails / US-01 Then no longer claim a 1-hour auto-archive | PASS |
| 1.12–1.13, 2.6–2.14, 3.5–3.12 Manual | pending / YOLO skip |

## Lessons (priors)

- Opaque `?error=`: archive/extend/admin-archive and create cap use `RunError.message` or fixed strings; infrastructure paths log and do not echo PostgREST.
- Stale-docs: AGENTS.md + Guardrails/US-01 Then updated in this change. FR-013 left on purpose (v1 FR freeze).
- Dual-defense 5-cap and closed column grants match S-13 / plan F2–F3.
- Pattern: new routes mirror `src/pages/api/admin/runs/[id]/delete.ts`; island mirrors `AdminRunControls` (`fetchFormJson`, confirm, `ServerError`).
