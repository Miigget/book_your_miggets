<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Map poll (S-28 / FR-010) Implementation Plan

- **Plan**: context/changes/map-poll/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-09-10
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 353c5d3 (`feat(map-poll): services, APIs, edit omit (p2)`)

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

Planned Phase 2 files vs `353c5d3` (product only):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `src/lib/services/polls.ts` (new) | present | MATCH |
| `src/pages/api/runs/[id]/poll.ts` | present; `parseMapIdsFromForm` | MATCH |
| `src/pages/api/runs/[id]/poll/vote.ts` | present; `pollFail` + JSON poll payload | MATCH |
| `src/pages/api/runs/[id]/poll/close.ts` | present; archive.ts skeleton | MATCH |
| `src/lib/services/runs.ts` (`prepareOwnedActiveRunPatch`, `mapRunWriteError`) | select extended; closed-poll override; `map_id_locked` | MATCH |
| `src/lib/comment-mutation-http.ts` (`pollFail`) | sibling of `commentFail` (`?pollError=`) | MATCH (contracted) |

Extra in the commit: Progress checkboxes 2.1–2.2 + Phase 1 SHA stamps in `plan.md` (implement ritual). Missing vs Phase 2: none. Island / MapPicker / Locked map / `AGENTS.md` are Phase 3.

Locked Crew cuts verified in app code:

- `PollError` same shape as `RunError`. Wrappers `rpc` + `switch (outcome)` with the planned user-facing strings. Infra / unexpected: generic + `console.error` (never PostgREST in `?error=` / `?pollError=`).
- Loader: null when no row / RLS hide. Open: options + `ownMapId` + `closed: false` (own-row vote SELECT only; no counts). Closed: per-option `count`, `winnerMapId`, `closed: true`. App does not aggregate while `closed_at` is null.
- Create POST: form `map_ids` via `parseMapIdsFromForm` (not JSON `{ mapIds }`). Cardinality 2–8 left to RPC `invalid_options`.
- Create/close copy `archive.ts` (`runFail`, `{ ok: true, redirect }`). Vote copies comments (`pollFail` / `?pollError=`; JSON success reloads poll for the island). Domain errors 400; unauthenticated 401; never 403. Paths not in `PROTECTED_ROUTES`.
- `prepareOwnedActiveRunPatch` loads `map_id` / `map_category` and a closed poll in parallel. If closed, `mapIds` still come from the form (`replaceRunMaps` / `p_map_ids`); `mapId` / `mapCategory` overwritten with existing lock. `updateRun` patches those columns (no-op). Invite wrapper still passes `p_map_id` (setter ignores when closed). `mapRunWriteError`: `map_id_locked` → `The poll winner is locked`.
- Edit HTTP (`src/pages/api/runs/[id]/index.ts`) unchanged — omit lives in the shared preparer. Trigger remains the hard gate.

`change.md` stays `implementing` — this is a phase-scoped review; Phase 3 is not done. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| `npm run lint` | PASS — 0 errors (200 pre-existing-style `no-console` warnings; new `console.error` in `polls.ts` matches `archiveRun`) |
| `npx astro sync` | PASS |
| `npm run build` | PASS |

## Manual verification

Progress rows 2.3–2.9 remain `- [ ]`. YOLO skips the HTTP click-through (Crew locked). Not a reject reason.

Static review (not a substitute for 2.3–2.9): create/close/vote never return 403; `not_found` maps to `Run not found or no longer active`; pending vote uses the same copy; close `no_votes` / `already_verified` / `not_active` strings match the plan; playlist omit does not skip `replaceRunMaps` / `p_map_ids`.

Residual risk: actor-matrix HTTP (second create, pending vs confirmed vote, close with/without votes, edit after close on both visibilities, create-after-Complete vs close-after-Complete, Archive/verify close, restricted wrong-actor) was not executed against a running app.

## Findings

None.

## Notes

- Phase 1 freeze trigger is still the hard gate if the app omit is skipped or RLS hides the closed-poll probe; `map_id_locked` is now mapped through `mapRunWriteError` (lessons: no PostgREST in `?error=`).
- Phase 3 (`RunPoll` island, Locked map UI, MapPicker props, `AGENTS.md`) is not in this review. `getRunMapPoll` is wired on vote JSON only until the island mounts.
- Lessons applied: create/close/vote fail helpers pass `PollError.message` only; unexpected paths use fixed generics + `console.error`.
