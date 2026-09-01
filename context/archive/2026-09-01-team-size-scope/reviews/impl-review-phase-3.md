<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Team-size bands under Advanced settings (S-26)

- **Plan**: context/changes/team-size-scope/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: dce78d4 (`feat(team-size-scope): Advanced UI, detail CTA, dashboard chip, AGENTS.md (p3)`)

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

Planned Phase 3 files vs `dce78d4` (product only; parent `c7f2d21`):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `src/components/runs/CreateRunForm.tsx` | Advanced `<details>`, `auto_join_min` input, lock UX, `parseAutoJoinMin` | MATCH |
| `src/pages/runs/[id]/edit.astro` | passes `autoJoinMin` on `CreateRunFormEditValues` | MATCH |
| `src/pages/runs/[id].astro` | DL team-size row; island `autoJoinMin` | MATCH |
| `src/components/runs/RunParticipantActions.tsx` | Join/Apply/full CTA from band + count | MATCH |
| `src/components/runs/DashboardRunCard.astro` | pending chip for approval **or** band | MATCH |
| `AGENTS.md` | S-26 invariants in Hard Rules | MATCH |

Extra in the commit: `context/changes/team-size-scope/plan.md` Progress 3.1–3.3 stamps (expected). Missing vs Phase 3: none. No product files outside the plan. Capacity / Starts-at stay on the flat form. `ActiveRunCard` / `RunPreviewCard` untouched (no team-size line).

Locked Crew / plan cuts verified in `dce78d4`:

- **Advanced collapsed**: `advancedOpen` starts `edit?.autoJoinMin != null` — create is closed; edit opens only when a min is stored. Summary label is “Advanced settings”. After join-mode control; Capacity stays in the grid above.
- **Two join-mode options**: select still only `approval_required` / `auto_join`. `CreateRunFormJoinMode` unchanged. No third option, no `ALTER TYPE`.
- **`formatJoinMode` binary**: still exhaustive on the two-value enum (`runs.ts:136-146`). Detail Join mode DL uses it; cards still `formatJoinMode(run.joinMode)` only.
- **Detail team-size line**: when `autoJoinMin != null`, extra DL “Auto-join first” + `{N}` — not a hybrid join-mode phrase.
- **CTA Join/Apply/full**: `isJoinCta = (hasBand && confirmedCount < autoJoinMin) || (!hasBand && joinMode === "auto_join")`. `runFull = (hasBand || joinMode === "auto_join") && confirmedCount >= maxParticipants`. Band-full (`hasBand && confirmedCount >= min && < max`) keeps Apply. Unbanded approval has Apply and no full gate. Unbanded auto-join still Join until max, then disabled full.
- **Freeze together**: locked omits `name` and disables both `join_mode` and `auto_join_min` via `joinModeLocked`. Helper copy: “Join mode and team-size cannot be changed after someone has applied.”
- **Dashboard pending chip**: `pendingCount > 0 && !isArchived && (joinMode === "approval_required" || autoJoinMin != null)`. No team-size line on this card.
- **Empty = unset**: empty/optional input; client `parseAutoJoinMin` (Phase 2 helper vs current capacity); skip validate when locked. Hint: organizer counts toward N.
- **`cn()`**: new input classes merged with `cn()`; no string concatenation. No `"use client"` / Next.js directives anywhere in `src/`.
- **Accept**: `window.confirm` soft overfill in `onDecide` unchanged (S-02). Organizer pending/denied lists not retouched.
- **AGENTS.md**: team-size under Advanced; two-option default join; NULL = unset; no `ALTER TYPE join_mode`; overlay (organizer counts); `band_full` ≠ `full`; freeze together; GRANT UPDATE includes `auto_join_min`; invite RPCs take the column (`p_update_auto_join_min` to write NULL); Accept stays S-02 soft overfill.

Phase 2 overlay/API assumptions still hold: form now submits `auto_join_min`; island is the only `RunParticipantActions` call site and passes the new required prop.

`change.md` stays `implementing` — this is a phase-scoped review. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| `npm run lint` | PASS — 0 errors (188 pre-existing warnings, none introduced by this phase) |
| `npm run build` | PASS — Astro server build complete |
| `AGENTS.md` S-26 invariants | PASS — all contract bullets present in Hard Rules |

## Manual verification

Progress rows 3.4–3.8 remain `- [ ]`. YOLO skips the UI click-through (Crew locked). Not a reject reason.

Static review is not a substitute for 3.4 (collapsed Advanced + two options in the browser), 3.6 (second player Join / third Apply / max full), 3.7 (edit freeze after first outsider), or 3.8 (dashboard chip on auto-join + band once someone is pending). Control flow and copy match the plan contracts.

Residual risk: create/edit disclosure, Join→Apply→full CTA, freeze-together on edit, and dashboard pending chip were not clicked in a running app.

## Findings

None.

## Notes

- Dashboard chip also requires `pendingCount > 0`, so unbanded approval_required no longer shows “Pending: 0”. That gate is in the Phase 3 contract, not drift.
- Full-plan impl-review is the next crew stage (all three phase reviews exist; Progress Manual rows stay unchecked under YOLO).
