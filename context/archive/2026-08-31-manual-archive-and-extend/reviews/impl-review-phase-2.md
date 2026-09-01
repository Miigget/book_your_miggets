<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual archive, extend, and active-run cap

- **Plan**: `context/changes/manual-archive-and-extend/plan.md`
- **Scope**: Phase 2 of 3
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

Known adaptations, accepted by crew / this review invocation — do not reopen as drift:

- Progress **2.6–2.14** Manual UI: left unchecked; skipped as YOLO human-action (residual risk: Archive/Extend UI is Phase 3; guest/signed-in list, 404-not-403, S-08 archive open, comment write vs read, 5-cap, and in-progress edit were not click-through verified). Automated greps + local PostgREST `.or()` syntax check substitute for the query half only.
- `src/pages/runs/[id]/edit.astro` is not named in Phase 2 Changes Required. One-line `extendedUntil: run.extendedUntil` is required by the CreateRunForm contract (four-arg `isRunActive`). Treat as implied by item 5, not scope creep.
- `mapRunWriteError` was already a private mapper; Phase 2 **exported** it and added `active_run_cap` → the fixed 5-active string. Direct `.insert()` and `createInviteOnlyRun` both go through it. Extra mappings (`join_mode_locked`, etc.) pre-existed.
- `change.md` left **`implementing`**. This is a mid-loop phase review (phase 3 remains). The generic skill stamp `impl_reviewed` would block `/10x-implement` phase 3. Full-plan review after phase 3 should stamp `impl_reviewed`.

### Git vs plan (Phase 2)

Commit `c9f6275` (plus dirty `plan.md` Progress SHA write-back / `crew-decisions.md`).

| Planned | In diff | Verdict |
|---------|---------|---------|
| `src/lib/run-lifecycle.ts` | rewritten: no `RUN_GRACE_MS` / `activeWindowStartsAfter` / `archiveDeadlineAt`; `MAX_ACTIVE_RUNS_PER_ORGANIZER = 5`; `isRunActive` stamp + elapsed extend; phase from stamp/extend then `starts_at` | MATCH |
| `src/lib/services/runs.ts` | `extended_until` on `RUN_SELECT` / `RunRow` / DTOs; `mapRunRow` / `mapArchivedRunRow` / inventory splits / `runRowFromPublicRpc`; list/detail `.or()` + post-filter; `countAudienceActiveRunsForOrganizer`; `archiveRun` / `extendRun`; create/edit error map | MATCH |
| `src/lib/services/participants.ts` | `loadActiveRunForMutation` drops `starts_at` lower bound; `isRunActive` post-filter | MATCH |
| `src/lib/services/comments.ts` | `requireActiveRun` same; comment **read** (`listCommentsForRun`) still ungated | MATCH |
| `src/pages/api/runs/index.ts` | cap after profile/nickname; `ACTIVE_RUN_CAP_MESSAGE`; insert uses `mapRunWriteError` | MATCH |
| `src/components/runs/CreateRunForm.tsx` | four-arg `isRunActive`; create still requires future start | MATCH |
| Phase 3 HTTP/UI/docs | unchanged (no archive/extend routes or islands) | expected |

Unplanned product code: none besides the implied edit.astro prop. Extra paths (`plan.md` Progress, `crew-decisions.md`) are 10x workflow artifacts.

### Contract checklist (plan vs code)

- Audience-active TS: `archivedAt == null` and (`extendedUntil` null or `now < deadline`). `now === deadline` is not active (matches SQL `extended_until > now()`).
- `isRunActive` does not time-archive from `starts_at` (`void startsAt`).
- `getRunLifecyclePhase`: not active → `"archived"`; else `now < starts_at` → `"upcoming"`; else `"in_progress"`.
- `mapRunRow` calls `isRunActive` then `getRunLifecyclePhase` (no time-only phase). Inverse `mapArchivedRunRow`.
- `runRowFromPublicRpc` maps `row.extended_until` (guest Incoming/Recent seed).
- `listActiveRuns` / `getActiveRunById`: `.is("archived_at", null)` + `.or('extended_until.is.null,extended_until.gt."<nowIso>"')`; `mapRunRow` post-filter. Organizer/admin unbounded SELECT still filtered in-app.
- Inventory (`listRunsForOrganizer` / `listRunsForParticipant` / `listPlayerProfileRuns`) splits on `isRunActive(..., extended_until)`.
- `canOpenArchivedRunDetail` unchanged. Archived loaders still `!isRunActive`; participant still confirmed-seat; organizer still no seat (S-08).
- Edit `starts_at`: `isRunActive(newStartsAt, null, existingExtendedUntil)` — past start allowed while audience-active.
- Create API: `countAudienceActiveRunsForOrganizer >= 5` → fixed string; trigger/`P0001` `active_run_cap` mapped to the same string; generic create fail does not echo PostgREST (`lessons.md`).
- `archiveRun` / `extendRun`: RPC + fixed `RunError` strings; never PostgREST text. Banned copy `"Your account is banned"` matches middleware. Admin-non-owner extend is SQL `not_found` → same opaque not-found string.
- Mutation gates do not import each other’s private helpers.
- No remaining `RUN_GRACE_MS` / `activeWindowStartsAfter` / `archiveDeadlineAt` under `src/`.

### Automated verification (re-run this review)

| Item | Result |
|------|--------|
| 2.1 `npm run lint` | PASS (exit 0; 0 errors; existing warnings only) |
| 2.2 `npm run build` | PASS |
| 2.3 No `RUN_GRACE_MS` / `activeWindowStartsAfter` / `archiveDeadlineAt` under `src/` | PASS (`rg` empty) |
| 2.4 `mapRunRow` / `runRowFromPublicRpc` / inventory use `isRunActive` + `extended_until` | PASS |
| 2.5 Create API 5-active string; `archiveRun` / `extendRun` exist | PASS |
| PostgREST `.or()` syntax (local REST, quoted ISO) | PASS — HTTP 200 (empty local `runs` table; not a product click-through) |
| 2.6–2.14 Manual | pending / YOLO skip |

## Lessons (priors)

- Opaque `?error=` lesson: create path uses `mapRunWriteError` then a fixed fallback; `archiveRun` / `extendRun` are ready for Phase 3 HTTP (log + fixed strings).
- Stale-docs lesson applies in **Phase 3** (`AGENTS.md` / `prd.md` 1h copy) — not this phase.
- Dual-defense 5-cap: app pre-check + SQL trigger; race still closed in Postgres (`pg_advisory_xact_lock` from Phase 1).
