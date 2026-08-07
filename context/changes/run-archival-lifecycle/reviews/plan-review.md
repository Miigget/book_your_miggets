<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Run archival lifecycle

- **Plan**: context/changes/run-archival-lifecycle/plan.md
- **Mode**: Deep
- **Date**: 2026-08-07
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 0 critical 1 warnings 1 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

Grounding: 10/10 paths ✓, symbols ✓, brief↔plan ✓

## Findings

### F1 — Withdraw bypasses active-run mutation gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Mutation gate / Desired End State
- **Detail**: Desired End State said apply/approve/leave fail as “not active” after grace. `loadActiveRunForMutation` gates those three, but `withdrawApplication` never calls it. After grace, guest detail 404s so the UI path closes, yet withdraw API can still succeed on a past-grace run.
- **Fix A ⭐ Recommended**: Route withdraw through `loadActiveRunForMutation`
  - Strength: Same “not active” contract as apply/leave/decide; one choke point stays authoritative.
  - Tradeoff: Pending applicants cannot withdraw after grace via API (already off active UX).
  - Confidence: HIGH — matches existing mutation pattern and end-state wording.
  - Blind spot: None significant.
- **Fix B**: Document withdraw as ungated (cleanup allowed after archive)
  - Strength: Lets users clear a stale pending row without reopening join mutations.
  - Tradeoff: Two mutation policies for implementers and S-07 to remember.
  - Confidence: MEDIUM — product-valid, but contradicts “mutations fail after grace” unless spelled out.
  - Blind spot: Whether S-07 archive UX expects withdraw on archived runs.
- **Decision**: FIXED via Fix A

### F2 — “Upcoming-only” copy is overstated

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — List and detail UI
- **Detail**: Plan said fix header/empty-state copy that “currently says only upcoming.” Empty state is already “No active runs yet”; only the list subtitle uses “upcoming.”
- **Fix**: Narrow Phase 3 copy guidance to the list subtitle (and any other explicit “upcoming” strings found at implement time).
- **Decision**: FIXED
