<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit an active run (S-13)

- **Plan**: context/changes/edit-run/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warning 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | WARNING |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Accepted / verified (not extra findings)

- Plan-review **F2** applied: `isRunActive(startsAt, null)` throws dedicated `RunError("Start time must keep the run active")` before the post-update 0-row path, which still uses not-found copy.
- Error surface copies **apply.ts**, not create: `RunError` → `fail(err.message)`; anything else `console.error` + `fail("Could not save this run")`. Map lookup logs PostgREST and uses fixed copy. Trigger tokens `join_mode_locked` / `capacity_below_confirmed` mapped to the planned user-facing strings.
- Owner gate is a dedicated load (`organizer_id = userId` + active window), not `getActiveRunById`, and does not import `loadActiveRunForMutation`.
- Join mode omitted from the patch when a non-organizer `run_participants` row exists; unlocked path requires `isJoinMode`.
- `POST /api/runs/[id]` is redirect-only (no `wantsJson`). Invalid UUID → `/runs`. Unauthenticated → `/auth/signin`. Success → `/runs/{id}`. Fail → `/runs/{id}/edit?error=`.
- Banned POST remains middleware (`/api/` except `/api/auth/`).

## Findings

### F1 — Service capacity floor ignores p1-capacity-when

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/services/runs.ts:621
- **Detail**: Phase 1 Crew Lead decision `p1-capacity-when` (and the trigger at `enforce_run_update_invariants`) raises `capacity_below_confirmed` only when `NEW.max_participants IS DISTINCT FROM OLD.max_participants`, so a title/map save on an S-02 overfilled run still succeeds. `updateRun` always throws `RunError("Capacity cannot be below the confirmed roster")` when posted capacity `< countConfirmedParticipants`, and the existing-row load selects only `id` so it cannot tell “unchanged overfill” from “shrink below confirmed”. Phase 3 will POST the stored `max_participants` on every save, so an already-overfilled run cannot change title/map/starts_at through the app even though RLS+trigger would allow it. Intentional shrinks below confirmed are still correctly rejected.
- **Fix**: Select `max_participants` on the existing row. Throw the capacity `RunError` only when the posted value is distinct from the stored value and below confirmed count (same predicate as the trigger). Keep the always-on `> 0` integer check.
- **Decision**: PENDING

## Verification

### Automated

| Check | Result |
|-------|--------|
| `npx astro sync` | Pass (types generated) |
| `npm run lint` | Pass (0 errors; pre-existing `no-console` warnings only, including the two new `console.error` calls that lessons.md requires) |

### Manual

| Progress | Result |
|----------|--------|
| 2.3–2.7 | Marked `[x]` with `fb2fcdb`. Not re-run in-browser (YOLO). `crew-decisions.md` records curl verification against local `npm run dev`. Residual risk: CSRF/cookie/Origin edge cases a browser would show — same residual as the implement stage. |

## Plan vs diff (commit `fb2fcdb`)

- In plan and in diff: `src/lib/services/runs.ts` — MATCH (`RunError`, `updateRun` contract except F1 vs p1-capacity-when).
- In plan and in diff: `src/pages/api/runs/[id]/index.ts` — MATCH.
- In plan, not in product diff: none for this phase.
- In diff, not in plan: `context/changes/edit-run/plan.md` Progress stamps — implement ritual, not product scope creep.
