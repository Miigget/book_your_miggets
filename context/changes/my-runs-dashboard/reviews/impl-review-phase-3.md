<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: My-runs dashboard Implementation Plan

- **Plan**: context/changes/my-runs-dashboard/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-18
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 113597c (epilogue 2b21e40)

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

Phase 3 product change is `src/lib/services/runs.ts` (`getArchivedRunForOrganizer`) and `src/pages/runs/[id].astro` (loader order + `archivedSource: "organizer"` + Dashboard back link). Commit 113597c also stamped Phase 3 automated Progress in `plan.md`; epilogue 2b21e40 wrote the SHA into Progress and set `change.md` to `implemented` — expected 10x artifacts, not product scope creep. No migration. `dashboard.astro`, `history.astro`, `middleware.ts`, and `getArchivedRunForParticipant` body were not modified.

### Plan vs actual (Phase 3)

| Planned item | Verdict |
|--------------|---------|
| `getArchivedRunForOrganizer(supabase, runId, userId)` → `ArchivedRunDetail \| null` | MATCH (`runs.ts:418-436`) |
| `!isUuid` → `null` | MATCH (`runs.ts:423`) |
| Fetch `RUN_SELECT` by id; missing → `null` | MATCH (`runs.ts:426, 432`) |
| `organizer_id !== userId` → `null` (do not rely on RLS) | MATCH (`runs.ts:433`) — **CRITICAL check** |
| `mapArchivedRunRow` (null if still active) | MATCH (`runs.ts:435`; mapper `runs.ts:154-155`) |
| Do not call `getOwnParticipation` | MATCH (no call in organizer loader) |
| Do not change `getArchivedRunForParticipant` | MATCH (Phase 3 diff only inserts the new function) |
| Comment: callers must pass signed-in viewer; check mandatory because admin RLS | MATCH (`runs.ts:412-416`) |
| Do not call from `/runs/history` | MATCH (`history.astro` has no organizer loader) |
| Extend `archivedSource` with `"organizer"` | MATCH (`[id].astro:37`) |
| Sequence: active → participant (if user) → organizer (if user) → admin (if isAdmin) | MATCH (`[id].astro:50-62`) |
| Archived mode omits `RunParticipantActions` and pending/denied fetches | MATCH (`[id].astro:67-79`, `252-269`) |
| `AdminRunControls` unchanged (`isAdmin` && page loaded) | MATCH (`[id].astro:272-281`) |
| Back link: participant → `/runs/history` (“← Past runs”) | MATCH |
| Back link: organizer → `/dashboard` (“← Dashboard”) | MATCH (`[id].astro:99-102`) |
| Back link: admin-only → `/admin` | MATCH |
| Invalid UUID still 404, not 500 | MATCH (`isUuid` nulls then `pageError = "missing"`) |
| Active detail back link stays `/runs` | MATCH (`[id].astro:126`) |

Seated organizer still hits participant first, so History back link is preserved. Unseated organizer (including an admin who organized but left) takes the organizer path before admin bypass — matches the plan’s “admin-only bypass stays Admin.”

### Safety & patterns

- **Authz (CRITICAL):** `getArchivedRunForOrganizer` returns null unless `data.organizer_id !== userId` is false. Fetch is by id (admin RLS could return any row); the JS check is the leak guard. Guest skips both archived user loaders (`if (!run && user)`). Unrelated member: participant miss (no confirmed seat) + organizer miss (id mismatch) → 404 unless admin.
- `getArchivedRunForParticipant` still gates on `own?.status !== "confirmed"` (`runs.ts:397-398`). Organizer loader does not weaken that.
- No `service_role`, no new policy, no migration. Errors throw at the DB boundary (`Failed to load archived run`); page catch maps to friendly 500 copy.
- Pattern: organizer loader mirrors `getArchivedRunForAdmin` (uuid, `RUN_SELECT`, `maybeSingle`, `mapArchivedRunRow`) plus the ownership check the admin helper deliberately omits.
- Phase 1/2 assumptions hold: dashboard still deep-links to `/runs/{id}`; unseated Past cards now resolve instead of 404.

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 3.1 `getArchivedRunForOrganizer` exists and returns null when `organizer_id` does not match | PASS — `runs.ts:418-433` |
| 3.2 `[id].astro` calls it only when `user` is set, after participant, before admin | PASS — `[id].astro:51-62` |
| 3.3 `getArchivedRunForParticipant` still returns null without a confirmed seat | PASS — `runs.ts:397-398`; body unchanged this phase |
| 3.4 `npm run lint` | PASS — exit 0; 19 pre-existing `no-console` warnings, 0 errors; none new in Phase 3 files |
| 3.5 `npm run build` | PASS — `astro build` complete |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 3.6 Unseated organizer (leave-then-archive): archived `/runs/{id}` from dashboard Past is read-only; back link Dashboard | `[ ]` | YOLO skipped (human-action). Loader + `archivedSource === "organizer"` → `/dashboard`; actions gated on `!isArchived`. Residual risk, not a finding. |
| 3.7 Seated organizer: opens; back link Past runs | `[ ]` | YOLO skipped. Participant loader runs first; source stays `"participant"`. Residual risk, not a finding. |
| 3.8 Guest and unrelated member: archived URL still 404 | `[ ]` | YOLO skipped. Guests skip user loaders; unrelated fail both membership and `organizer_id` checks. Residual risk, not a finding. |
| 3.9 Admin who did not organize and did not play: admin bypass; back link Admin | `[ ]` | YOLO skipped. Organizer loader returns null on id mismatch; admin is last. Residual risk, not a finding. |
| 3.10 Active detail/mutations unchanged | `[ ]` | YOLO skipped. Active path still `getActiveRunById`; `RunParticipantActions` still `!isArchived`. Residual risk, not a finding. |
| 3.11 `/runs/history` unchanged (leave-team organizer still absent) | `[ ]` | YOLO skipped. `history.astro` / `listArchivedRunsForParticipant` untouched this phase. Residual risk, not a finding. |

## Findings

None.

## Residual risk

Progress 3.6–3.11 were not exercised against a running app (YOLO human-action skip). Highest residual: leave-then-archive back-link and 404 matrix (guest / unrelated / admin-only) — code paths match the plan; not session-tested. Phase 1 manuals 1.6–1.7 and Phase 2 manuals 2.5–2.13 remain untested.

## Proceed

YOLO Done path: report saved; no triage. `change.md` stays `implemented` (phase-scoped review; full-plan `impl_reviewed` is after all phases). Next stage is full impl-review.
