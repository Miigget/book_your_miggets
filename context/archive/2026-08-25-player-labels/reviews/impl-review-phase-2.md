<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Player labels Implementation Plan

- **Plan**: context/changes/player-labels/plan.md
- **Scope**: Phase 2 of 3
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

### F1 — countAssignmentsByLabel helper (planned aggregate, unlisted export)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/lib/services/player-labels.ts:58-71`
- **Detail**: Phase 2 contract allows “a cheap assignment aggregate or a per-row count in the loader.” Implementation adds `countAssignmentsByLabel` (one `select("label_id")` then in-memory counts) used by `labels.astro` for “Used by N”. Not named in Changes Required file list; does not expand product/API surface or list nicknames. Matches Performance note (no N+1 of player fields). Full-table assignment select is fine for MVP-sized data; SQL `GROUP BY` would be tighter later.
- **Fix**: Keep as-is for Phase 3+. Optional plan addendum naming the helper if future reviews need it documented.
- **Decision**: PENDING

### F2 — Manual UI smoke marked done under YOLO skip

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `plan.md` Progress 2.6–2.10
- **Detail**: Manual rows are `[x]` with “YOLO skipped manual”. No live create/edit/delete/assign/empty-dictionary/guest-404 evidence in this review. Automated criteria (files, form actions, lint, build) pass. Residual risk: wrong POST targets, empty-state Save button, or assignment form failure masking S-16 — mitigated by code review (isolated try, empty dict omits Save, POST URLs match Phase 1 APIs) but not UI-exercised this turn.
- **Fix**: Before production `/gh-release`, run Progress 2.6–2.10 once (or accept residual risk through Phase 3 public-profile smoke).
- **Decision**: PENDING

## Evidence (phase 2)

### Plan vs working tree

- **In plan and present**:
  - `src/pages/admin/labels.astro` — MATCH (Banner notice/error; `← Users`; empty copy + create form; name + palette radios; edit forms; delete with Used by N; plain HTML POST to create/update/delete; no `client:*`; fixed load error; no nickname listing)
  - `src/pages/admin/users/[id].astro` — MATCH (Labels section after identity editors, before archive; own try for dictionary + assigned ids; failure keeps S-16 editors + fixed copy; empty dictionary → link `/admin/labels`, no Save; checkboxes `name="label_id"` + Save → `/api/admin/users/{id}/labels`)
  - `src/pages/admin/index.astro` — MATCH (subtitle + “Manage player labels” → `/admin/labels`; no chips in users table)
  - `src/lib/services/player-labels.ts` — EXTRA helper only (F1); Phase 1 mutations untouched
- **In tree but not Phase 2 Changes Required (named)**: `countAssignmentsByLabel` (F1)
- **Phase 3 not leaked**: no `PlayerLabelChip.astro`; `/players/[id].astro` does not call `listAssignedLabels`; `PROTECTED_ROUTES` unchanged (no `/players`)
- **In plan but missing**: none for Phase 2

### Contract checks

- Middleware still gates `/admin*`; pages use cookie `createClient`; no React islands on admin label UI
- Chip color via inline `background-color` + `cn()` layout classes; palette radios show hex + English name (not stored in DB)
- Lessons: page load errors use fixed copy + `console.error`; Banner still shows `?notice=` / `?error=` from APIs (Phase 1 fixed-copy contract)
- Empty dictionary: create form remains on labels page; player page has link, no Save
- S-16 forms / archive list / 404/500 behavior preserved

### Automated verification

- **2.1** PASS — `labels.astro` posts to `/api/admin/labels`, `/api/admin/labels/{id}`, `/api/admin/labels/{id}/delete`
- **2.2** PASS — checkboxes `label_id` post to `/api/admin/users/{id}/labels`
- **2.3** PASS — `/admin` index links to `/admin/labels`
- **2.4** PASS — `npm run lint` exit 0 (0 errors; `no-console` warnings only)
- **2.5** PASS — `npm run build` Complete

### Manual verification

- **2.6–2.10** SKIPPED (YOLO) — see F2. Code-path review supports intended UI contracts; not live-browser confirmed this turn.

## Notes

Phase-scoped review: `change.md` status left as `implementing` because Phase 3 is still open. A full-plan `/10x-impl-review` should stamp `impl_reviewed` after Phase 3.
