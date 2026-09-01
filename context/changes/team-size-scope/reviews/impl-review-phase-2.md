<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Team-size bands under Advanced settings (S-26)

- **Plan**: context/changes/team-size-scope/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: c7f2d21 (`feat(team-size-scope): Apply overlay, create/edit APIs, pending counts (p2)`)

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

Planned Phase 2 files vs `c7f2d21` (product only; parent `7d31915`):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `src/lib/run-limits.ts` | `parseAutoJoinMin` + constants | MATCH |
| `src/lib/services/runs.ts` | DTO, pendingIds, mapper stub, prepare/writers, `mapRunWriteError` | MATCH |
| `src/pages/api/runs/index.ts` | parse + public insert + invite create | MATCH |
| `src/pages/api/runs/[id]/index.ts` | `formString(..., "auto_join_min")` | MATCH |
| `src/lib/services/participants.ts` | overlay `applyToRun` / `autoJoinRun` | MATCH |

Extra in the commit: `context/changes/team-size-scope/plan.md` Progress 2.1–2.2 stamps (expected). Missing vs Phase 2: none. Advanced UI / detail CTA / dashboard chip / `AGENTS.md` are Phase 3.

Locked Crew cuts verified in `c7f2d21`:

- **F1 overlay**: `applyToRun` calls `auto_join_run` when `join_mode === "auto_join" || auto_join_min != null`. Switches on RPC text. `autoJoinRun` is `Promise<AutoJoinRpcOutcome>` (`"confirmed" | "already_confirmed" | "band_full"`), not `Promise<void>`. Confirmed post-check (`getOwnParticipation` require `status === "confirmed"`) runs only on `confirmed` / `already_confirmed`. `band_full` is exhaustiveness-narrowed then falls through to the existing pending insert — never the post-check. `full` still throws `"This run is already full"`. Other outcomes (`already_pending`, `denied`, `no_nickname`, `not_active`, default) still throw; they cannot pending-insert. `autoJoinRun` is only called from `applyToRun`.
- **F3 stub**: `runRowFromPublicRpc` sets `auto_join_min: null`. No DROP/CREATE of `list_player_public_runs`.
- **S-02 Accept**: `decideParticipant` has no capacity gate (client `window.confirm` overfill in `RunParticipantActions.tsx` unchanged). Phase 2 did not touch the decide API beyond `loadActiveRunForMutation` now selecting `auto_join_min` (unused by decide).
- **`?error=`**: create uses `fail(parsedAutoJoinMin.message)` (constants, not `Error.message`). Edit maps `RunError` vs generic `"Could not save this run"`. Apply still maps `ParticipantError.message` vs generic `"Could not apply to this run"`; new overlay throws are `ParticipantError` with fixed copy. Infrastructure `Error` from PostgREST is logged, not forwarded.
- Parse: empty/whitespace → `null`; `0`, negatives, non-integers → `AUTO_JOIN_MIN_INVALID_MESSAGE`; `min > max` → `AUTO_JOIN_MIN_RANGE_MESSAGE`.
- `pendingIds` include `join_mode === "approval_required" || auto_join_min != null`. `formatJoinMode` still two-valued.
- Unlocked writes `number | null`; locked omits PostgREST `auto_join_min` and omits invite `p_update_auto_join_min` (same `joinModeLocked` gate). Invite create passes `p_auto_join_min`. Invite edit passes `p_update_auto_join_min: true` + `p_auto_join_min` when unlocked (NULL clear works). Public `.insert()` includes `auto_join_min`. Capacity drop below stored min while locked is rejected in prepare (CHECK backstop).
- Pending INSERT RLS (`run_participants_insert_self_pending`) does not gate on `join_mode`, so `band_full` fallthrough on auto-join + band is allowed.

`change.md` stays `implementing` — this is a phase-scoped review; phase 3 is not done. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| `npm run lint` | PASS — 0 errors (188 pre-existing warnings, none introduced by this phase) |
| `npm run build` | PASS — Astro server build complete |

## Manual verification

Progress rows 2.3–2.7 remain `- [ ]`. YOLO skips the apply/API click-through (Crew locked). Not a reject reason.

Static review is not a substitute for 2.3 (second player confirms / third pending) or 2.4 (unbanded auto-join full-stop). Overlay control flow matches the plan’s non-obvious snippet.

Residual risk: click-through of Approval+min, unbanded auto-join full, min `0` / min > capacity / empty NULL, locked edit, and invite-only persist were not executed here.

## Findings

None.

## Notes

- Dashboard pending **counts** are fetched for banded auto-join; the chip UI still gates on `joinMode === "approval_required"` (`DashboardRunCard.astro`). That chip change is Phase 3, not drift.
- Until Phase 3 adds the Advanced field, the existing create/edit form omits `auto_join_min` (empty → NULL). Unlocked UI edits cannot yet round-trip a crafted API-set min; Phase 3 is the same change and follows immediately.
- Phase 1 `p_auto_join_min?: number` (no `| null`) still uses `as Args` when passing SQL NULL to clear the band.
- Phase 3 (Advanced UI, detail CTA, dashboard chip, `AGENTS.md`) is not in this review.
