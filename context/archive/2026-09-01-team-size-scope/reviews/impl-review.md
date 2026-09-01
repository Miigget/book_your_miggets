<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Team-size bands under Advanced settings (S-26)

- **Plan**: context/changes/team-size-scope/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: 7d31915 (p1), c7f2d21 (p2), dce78d4 (p3)

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

Full-plan review after phase reviews `impl-review-phase-1.md` / `-2.md` / `-3.md` (all APPROVED, 0 findings). This pass re-checked product commits independently (`7d31915^..dce78d4`). YOLO skipped Progress Manual rows (1.4–1.7, 2.3–2.7, 3.4–3.8); Crew locked — not a reject reason.

**Planned vs product diff:**

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `supabase/migrations/<ts>_run_auto_join_min.sql` | `20260901140012_run_auto_join_min.sql` | MATCH |
| `src/types/database.ts` | present (p1) | MATCH |
| `src/lib/run-limits.ts` | `parseAutoJoinMin` (p2) | MATCH |
| `src/lib/services/runs.ts` | DTO, pendingIds, writers, mapper stub (p2) | MATCH |
| `src/pages/api/runs/index.ts` | parse + insert + invite create (p2) | MATCH |
| `src/pages/api/runs/[id]/index.ts` | `formString(..., "auto_join_min")` (p2) | MATCH |
| `src/lib/services/participants.ts` | overlay `applyToRun` / `autoJoinRun` (p2) | MATCH |
| `src/components/runs/CreateRunForm.tsx` | Advanced disclosure (p3) | MATCH |
| `src/pages/runs/[id]/edit.astro` | `autoJoinMin` on edit values (p3) | MATCH |
| `src/pages/runs/[id].astro` | team-size DL + island prop (p3) | MATCH |
| `src/components/runs/RunParticipantActions.tsx` | Join/Apply/full CTA (p3) | MATCH |
| `src/components/runs/DashboardRunCard.astro` | pending chip for band (p3) | MATCH |
| `AGENTS.md` | S-26 Hard Rules (p3) | MATCH |

Extra in range: 10x `context/changes/team-size-scope/*` (change identity, plan, research, plan-reviews, Progress SHA stamps). Not product-scope creep. Missing vs plan: none. `ActiveRunCard` / `RunPreviewCard` / decide / withdraw / leave / kick untouched.

**Locked Crew / plan cuts (cross-phase):**

- `auto_join_min` nullable integer, no default, no backfill; CHECK `runs_auto_join_min_chk` (`NULL OR 1 ≤ min ≤ max`). No `ALTER TYPE join_mode`.
- Overlay gate: `join_mode = auto_join OR auto_join_min IS NOT NULL`. Outcome order: `full` at max, then `band_full` at min. Unbanded auto-join never emits `band_full`. `min = max` stays all auto-join until capacity.
- GRANT UPDATE is the prior eight columns plus `auto_join_min`. Lifecycle stamps stay closed.
- Invite create copied live `20260831131219` body (5-cap UX pre-check kept); `p_auto_join_min` on INSERT; DROP + re-GRANT EXECUTE authenticated. Setter uses `CASE WHEN p_update_auto_join_min` (no coalesce); unlocked writes NULL to clear.
- Freeze trigger locks `auto_join_min` with `join_mode` via `join_mode_locked` after any non-organizer participant. Prepare/form omit both fields when locked.
- **F1 overlay:** `applyToRun` switches on RPC text. `autoJoinRun` returns string, not void. Confirmed post-check only on `confirmed` / `already_confirmed`. `band_full` falls through to pending insert. `full` stays `"This run is already full"`.
- **F3 stub:** `runRowFromPublicRpc` sets `auto_join_min: null`. No DROP/CREATE of `list_player_public_runs`.
- CTA matches fill rule: Join under band, Apply after, full only at max. Band-full does not hide Apply. Unbanded approval keeps Apply with no full gate.
- `formatJoinMode` stays two-valued. Detail adds “Auto-join first N”; cards stay binary. Advanced collapsed by default; Capacity stays on the flat form.
- S-02 Accept soft overfill unchanged. `?error=` uses domain strings (`ParticipantError` / `RunError` / parse constants), not PostgREST `Error.message`.
- Dashboard `pendingIds` and chip share `approval_required || autoJoinMin != null`.

## Automated verification

| Command | Result |
|---------|--------|
| Local migration `20260901140012` (`npx supabase migration list --local`) | PASS — present on local |
| `npm run lint` | PASS — 0 errors (188 pre-existing warnings, none introduced by this change) |
| `npm run build` | PASS — Astro server build complete |
| `AGENTS.md` S-26 invariants | PASS — Hard Rules document Advanced placement, two-option join, NULL=unset, no `ALTER TYPE`, overlay (organizer counts), `band_full` ≠ `full`, freeze together, GRANT includes `auto_join_min`, invite RPCs + `p_update_auto_join_min`, Accept S-02 |

Phase 1 `npm run db:types` was PASS at p1 review (committed types match regenerated file). Not re-run here; types file is unchanged since `7d31915`.

## Manual verification

Progress rows 1.4–1.7, 2.3–2.7, 3.4–3.8 remain `- [ ]`. YOLO skips concurrent SQL and click-through (Crew locked). Not a reject reason.

Static full sweep is not a substitute for 1.4 (two concurrent `auto_join_run` at last min-band seat) or the apply/UI click-through. Control flow, SQL outcome order, grants, and CTA mapping match the plan contracts.

Residual risk: last min-band race, Approval+min Join→Apply→full, unbanded auto-join full-stop, locked edit freeze-together, invite persist/clear, and dashboard chip on auto-join+band were not executed in a running app.

## Findings

None.

## Notes

- Direct PostgREST can write `auto_join_min` once granted (accepted in plan Migration Notes; CHECK is the backstop).
- Generated invite Args type `p_auto_join_min?: number` (no `| null`); unlocked clear still passes SQL NULL under the existing `as Args` assertion.
- Code-ready for archive. Manual Progress rows stay open as residual risk.
