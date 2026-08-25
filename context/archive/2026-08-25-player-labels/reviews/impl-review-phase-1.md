<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Player labels Implementation Plan

- **Plan**: context/changes/player-labels/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-25
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 2 observations

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

### F1 — Benign extras beyond Phase 1 contract

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/lib/player-label-palette.ts` (`canonicalPaletteHex`); `supabase/migrations/20260825070003_player_labels.sql:33-34` (`player_label_assignments_label_id_idx`)
- **Detail**: Plan contracts `isPaletteHex(...): boolean` and the assignment table without a secondary index. Implementation also exports `canonicalPaletteHex` (used by create/update to store uppercase `#RRGGBB`) and adds `label_id` index (helps delete-count / CASCADE lookups). Neither expands product scope or API surface; both support the contracted behavior.
- **Fix**: Keep as-is for Phase 2+. Optional plan addendum only if future reviews need the helpers documented.
- **Decision**: PENDING

### F2 — Manual SQL/service smoke marked done under YOLO skip

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `plan.md` Progress 1.8–1.10
- **Detail**: Manual rows are `[x]` with “YOLO skipped manual”. No live RLS/cascade/case-unique/`replacePlayerLabels` smoke evidence in this review. Automated criteria (files, lint, build, types present) pass. Residual risk matches plan-brief: member write leak, cascade notice, replace-set wipe-on-unknown — mitigated in code review (validate-before-delete; `is_admin()` policies; CASCADE FKs) but not exercised against a running DB in this turn.
- **Fix**: Before production `/gh-release`, run Progress 1.8–1.10 SQL/service smokes once (or accept residual risk through Phase 2 UI smoke).
- **Decision**: PENDING

## Evidence (phase 1)

### Plan vs diff

- **In plan and in working tree**:
  - `supabase/migrations/20260825070003_player_labels.sql` — MATCH (tables, `lower(name)` unique, hex check, CASCADE FKs, revoke-then-grant, per-op per-role RLS, no seed, no `public_profiles` change)
  - `src/types/database.ts` — MATCH (`player_labels`, `player_label_assignments` present)
  - `src/lib/player-label-palette.ts` — MATCH (10 hexes + `isPaletteHex`); EXTRA `canonicalPaletteHex`
  - `src/lib/services/player-labels.ts` — MATCH (`parseLabelName`, list/create/update/delete/replace; validate dictionary ids before any assignment writes; fixed `AdminError` copy; log raw errors)
  - Four admin POST routes — MATCH (admin role check, redirects, `form.getAll("label_id")`, delete notice with assignment count including zero)
- **In tree but not Phase 1 Changes Required**: `canonicalPaletteHex`, `label_id` index (see F1). No Phase 2/3 UI files (`labels.astro`, `PlayerLabelChip.astro` absent).
- **In plan but missing**: none for Phase 1.

### Contract checks

- Migration revoke `public, anon` then GRANT SELECT both; INSERT/UPDATE/DELETE labels; INSERT/DELETE assignments; policies `*_select_*` `using (true)`; writes `is_admin()`.
- Replace-set: UUID gate → unique ids → dictionary membership → else `Unknown label` with **no** DELETE/INSERT → then delete profile assignments → insert (empty list = unassign-all).
- APIs mirror S-16 `nickname.ts`: cookie client, sign-in / non-admin redirects, `AdminError` → `?error=`, other errors `console.error` + fixed copy (lessons-compliant).
- Palette hexes exact match to plan list; English names not stored in DB.

### Automated verification

- **1.1** PASS — migration content matches contract (spot-read).
- **1.2** PASS (indirect) — did not re-run destructive `db reset`; generated types include both tables (evidence migrate + `db:types` already landed).
- **1.3** PASS — `player_labels` / `player_label_assignments` in `src/types/database.ts`.
- **1.4** PASS — palette + service helpers present as contracted.
- **1.5** PASS — four routes; each checks `locals.profile?.role === "admin"`.
- **1.6** PASS — `npm run lint` exit 0 (0 errors; `no-console` warnings only, including new files).
- **1.7** PASS — `npm run build` Complete.

### Manual verification

- **1.8–1.10** SKIPPED (YOLO) — see F2. Code-path review supports intended RLS/cascade/replace-set behavior; not live-SQL confirmed this turn.

## Notes

Phase-scoped review: `change.md` status left as `implementing` because Phases 2–3 are still open. A full-plan `/10x-impl-review` should stamp `impl_reviewed` after Phase 3.
