<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Participant archive history Implementation Plan

- **Plan**: context/changes/participant-archive-history/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-17
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 5f71dc6

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

Phase 2 product change is `src/lib/services/runs.ts` in commit 5f71dc6. Same commit also wrote Phase 1 Progress SHAs and set roadmap S-07 to `in-progress` — expected 10x artifacts, not product scope creep. No Phase 3 UI (`history.astro`, middleware `/runs/history`, Topbar, dual-mode `[id].astro`).

### Planned contracts vs code

- **DTOs**: `RunListItem.lifecyclePhase` stays `ActiveRunLifecyclePhase`. `ArchivedRunListItem` / `ArchivedRunDetail` use `lifecyclePhase: "archived"`. Shared `runFieldsFromRow` (allowed nested helper) reuses `resolveRunTitle`; `RUN_SELECT` gained `archived_at`.
- **Active path unchanged**: `listActiveRuns` / `getActiveRunById` still `.is("archived_at", null)` + `.gt("starts_at", activeWindowStartsAfter(now))`. `mapRunRow` still returns `null` when `getRunLifecyclePhase` is `"archived"`.
- **List**: `listArchivedRunsForParticipant` loads confirmed `run_id`s for `userId` first; empty memberships → `[]` (no unbounded `runs` scan); then `RUN_SELECT` `.in("id", runIds)`; keep `!isRunActive(starts_at, archived_at, now)`; sort `starts_at` desc; `confirmedCountsForRuns` on the **archived subset**; map with `mapArchivedRunRow` (not `mapRunRow`). Organizer/admin RLS cannot populate history with unseated created runs.
- **Detail**: `getArchivedRunForParticipant` calls `getOwnParticipation` (not forked). Returns `null` when invalid UUID, `own?.status !== "confirmed"`, run missing, or still active (`mapArchivedRunRow` / `isRunActive`). Organizer/admin SELECT success is not enough.
- **UUID**: both `getActiveRunById` and `getArchivedRunForParticipant` `isUuid`-guard and return `null` (plan-review F1 / Progress 2.9).
- **Grep**: archive loaders exist only in `runs.ts` (plus plan docs). Active pages still call `listActiveRuns` / `getActiveRunById` only.

### Import cycle (implementer note)

`runs.ts` statically imports `getOwnParticipation` from `participants.ts`. `participants.ts` already imported `ensureOwnProfile`, `getOwnNickname`, `isUuid`, and `AppSupabaseClient` from `runs.ts`.

This is a **static cycle**, but both sides only use the other's values inside async function bodies — not at module init. ESM live bindings resolve that; `npm run build` (Vite / Cloudflare adapter) succeeded. Not a finding. Optional later split if the cycle grows; do not fork `getOwnParticipation` (plan: call, do not fork).

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 2.1 Archive list/detail loaders exist; used only for archive | PASS — defined in `runs.ts`; no active-page callers |
| 2.2 Active loaders still filter the active window | PASS — `archived_at` null + `activeWindowStartsAfter` |
| 2.3 `npm run lint` | PASS — exit 0; 15 pre-existing `no-console` warnings in unrelated files, 0 errors |
| 2.4 `npm run build` | PASS — `astro build` complete |
| 2.9 Both detail loaders return null for invalid UUID | PASS — `isUuid` early-return; no PostgREST `22P02` path |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 2.5 Confirmed participant: list archived-only, newest first | `[ ]` | YOLO skipped (human-action). Residual risk, not a finding. |
| 2.6 Pending/denied/withdrawn: omitted; detail null | `[ ]` | YOLO skipped. Static review: list requires `status = 'confirmed'`; detail requires `own?.status === "confirmed"`. |
| 2.7 Organizer after leave-team: omitted; detail null | `[ ]` | YOLO skipped. Static review: leave-team deletes the confirmed row → empty ids / `getOwnParticipation` null. |
| 2.8 `getActiveRunById` still null for past-grace | `[ ]` | YOLO skipped. Static review: active query + `mapRunRow` drop archived. |

## Findings

None.

## Residual risk

Progress 2.5–2.8 remain unchecked (YOLO). Static review of confirmed-ids-first list and confirmed+archived detail found no S-08 leak. Postgres `now()` vs Worker `Date` skew at the grace edge is the same S-04 acceptance. Phase 3 must pass session `user.id` into these loaders.

## Proceed

YOLO Done path: report saved; no triage. Next stage is implement Phase 3. Do not start Phase 3 in this invocation.
