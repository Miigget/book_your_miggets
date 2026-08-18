<!-- PLAN-REVIEW-REPORT -->
# Plan Review: My-runs dashboard Implementation Plan

- **Plan**: context/changes/my-runs-dashboard/plan.md
- **Mode**: Deep
- **Date**: 2026-08-18
- **Verdict**: SOUND
- **Findings**: 0 critical 1 warning 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 8/8 paths ✓ (`src/pages/dashboard.astro`, `src/lib/services/runs.ts`, `src/pages/runs/[id].astro`, `src/pages/runs/history.astro`, `src/middleware.ts`, `src/components/Topbar.astro`, `src/pages/runs/index.astro`, `supabase/migrations/20260729134008_run_domain_schema.sql`), 12/12 symbols ✓ (`listActiveRuns`, `listArchivedRunsForParticipant`, `mapRunRow`, `mapArchivedRunRow`, `isRunActive`, `confirmedCountsForRuns`, `getActiveRunById`, `getArchivedRunForParticipant`, `getArchivedRunForAdmin`, `PROTECTED_ROUTES`, `runs_select_own_organizer`, `RUN_SELECT`), brief↔plan ✓ (manage / two sections / pending / organizer loader / empty UX / 3 phases match `crew-decisions.md` locked ⭐). `listRunsForOrganizer` and `getArchivedRunForOrganizer` are new — expected absent.

Progress↔Phase: one `## Progress` heading at bottom; Phase 1–3 names match; every Success Criteria bullet has a numbered Progress row; no `- [ ]` outside Progress — PASS.

Contradiction / promise-gap: FR-005 view + two-section inventory + pending counts + unseated organizer archived detail + empty UX are each backed by a phase. Inbox / edit-cancel / pagination / migration / history-reuse stay in “NOT Doing” and do not reappear in phases. Phase 2 Past-card 404 until Phase 3 is explicit, not a last-mile gap — PASS.

Code verification of riskiest claims (inline against source; no nested subagent):

- **`runs_select_own_organizer` already SELECTs archived owned rows** — confirmed. Policy (`20260729134008_run_domain_schema.sql:204-208`) is `auth.uid() = organizer_id` with no active-window predicate. `runs_organizer_id_idx` exists (`:49`). No migration needed.
- **Archived detail order is active → participant → admin** — confirmed. `[id].astro:49-57` matches. `archivedSource` is `"participant" | "admin"` (`:36`); back link is admin vs `/runs/history` (`:94-95`). Inserting `getArchivedRunForOrganizer` after participant and before admin is the correct S-09-shaped extension. Seated organizer still hits participant first (History back link).
- **`mapRunRow` vs `isRunActive`** — confirmed. `mapRunRow` (`runs.ts:143-148`) uses `getRunLifecyclePhase` (time only). `isRunActive` / `mapArchivedRunRow` (`run-lifecycle.ts:40-47`, `runs.ts:150-154`) honor stamped `archived_at`. Phase 1 contract to split with `isRunActive` first is load-bearing; do not dual-map.
- **Pending counts can copy `confirmedCountsForRuns`** — confirmed. Helper is a per-id `head: true` count (`runs.ts:163-188`). Organizer SELECT of pending rows is allowed (`run_participants_select_organizer`, schema `:275-286`). Restricting the extra query to active `approval_required` ids matches RLS and the locked “not an inbox” decision.
- **Leave-team deletes the organizer confirmed row, but only while active** — partial. `leaveTeamAsOrganizer` (`participants.ts:290-316`) does delete the confirmed row, yet it gates through `loadActiveRunForMutation` (`:158-183`: `archived_at is null` and `starts_at > now - 1h`). Archived leave-team via the API returns “Run not found or no longer active”. Unseated-archived is leave-then-archive (or a SQL delete), not leave-after-archive. See F1.
- **Ungated by-id archived fetch leaks via admin RLS** — confirmed. `getArchivedRunForAdmin` (`runs.ts:329-345`) selects by id with no `organizer_id` check; `runs_select_admin` returns any row. `getArchivedRunForOrganizer` must return null unless `organizer_id === userId`, and must run only after a participant miss. Do not call it from `/runs/history`.
- **S-07 leak guard must stay membership-based** — confirmed. `listArchivedRunsForParticipant` starts from confirmed `run_participants` (`runs.ts:260-296`). Callers: `history.astro`, `admin/users/[id].astro`. Plan correctly leaves behavior unchanged (comments only in Phase 1).
- **`/dashboard` stub + Topbar + middleware** — confirmed. Stub has no Topbar (`dashboard.astro`). Topbar already links Dashboard (`Topbar.astro:23-25`). `PROTECTED_ROUTES` includes `/dashboard` (`middleware.ts:4`). Banned GET is allowed (POST `/api/` gated only). `history.astro:22` still assigns `err.message` — plan correctly forbids copying that (`lessons.md`).
- **Blast radius**: `getArchivedRunForParticipant` / `getArchivedRunForAdmin` callers = `[id].astro` only. `listArchivedRunsForParticipant` callers = history + admin profile (untouched behavior). Dashboard is isolated. Pattern copies S-07 list chrome and S-09 loader-order / back-link-by-source; no new abstraction.

## Findings

### F1 — Manual test calls leave-team on an archived run

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Testing Strategy — Manual Testing Steps 3–4
- **Detail**: Step 4 says “As A, leave-team on that archived run” after step 3 SQL-sets `starts_at` past grace. `leaveTeamAsOrganizer` always calls `loadActiveRunForMutation` (`src/lib/services/participants.ts:158-183, 290-291`), which requires `archived_at is null` and `starts_at > now - 1h`. The UI/API cannot unseat an organizer after archival. The product path is leave-team while the run is still active, then let it archive (or SQL-delete the confirmed organizer row after archival). As written, Phase 3 manual 3.6 would fail for the wrong reason.
- **Fix**: Reorder the recipe: leave-team while the run is still in the active window, then SQL-set `starts_at` past grace. Dashboard Past still lists it; `/runs/history` drops it; Phase 3 opens read-only with a Dashboard back link. (SQL-delete of the confirmed organizer row after archival is an equivalent lab shortcut — do not call leave-team on an archived run.)
- **Decision**: Fixed via Fix A — Testing Strategy steps 3–4 are leave-then-archive (seated archive stays on the other run); Phase 3 manual 3.6 and success-criteria bullet note leave-then-archive, not leave-after-archive.

## Triage

Fixed: F1 (Fix A) (1)

Skipped: none

Accepted: none

Dismissed: none

► Verdict after fixes: SOUND (Blind Spots PASS; test recipe now leave-then-archive)

