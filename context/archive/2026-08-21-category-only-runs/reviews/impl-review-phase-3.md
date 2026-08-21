<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Category-only runs

- **Plan**: context/changes/category-only-runs/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-21
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation

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

### F1 — Grandfathered both-null card not live-smoked (YOLO)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: ActiveRunCard.astro:46-62 (same ternary on dashboard, history, Welcome, admin archive, runs/[id].astro)
- **Detail**: Progress 3.6 is marked `[x]` but YOLO skipped planting a live both-null row (Phase 2 already XOR-saved `p2-grand`). That is a skipped human-action gate, not a missing branch. Every Map-row surface uses `run.map ? Map : run.mapCategory ? Category : null`, so a grandfathered neither still renders neither Map nor Category. Do not REJECT for this.
- **Fix**: None required. Display branch matches the contract. Re-plant a both-null row only if a live eyeball is wanted before archive.
- **Decision**: PENDING

## Verification

### Automated

| Check | Result |
|-------|--------|
| `npm run lint` | Pass (0 errors; 54 `no-console` warnings, same class as Phase 2; none introduced by this phase). |
| `npx astro sync` | Pass. |
| `npm run build` | Pass. |

### Manual (Progress 3.3–3.9)

In-browser click-through not re-run (YOLO human-action skip). Code + locked checks stand in.

| Progress | Result |
|----------|--------|
| 3.3 list card + `/runs/{id}` Category, no map name | MATCH. `ActiveRunCard` and `runs/[id].astro` else-if `run.mapCategory`; detail is a Category section with the value only (no stars/points/creator). |
| 3.4 dashboard (active + past), history, Welcome, admin archive | MATCH. Same ternary copied onto every planned inlined Map row. `/runs` uses `ActiveRunCard`. |
| 3.5 mapped run keeps Map line, no extra Category | MATCH. Category is only in the `else if` after `run.map`. |
| 3.6 grandfathered neither | Branch MATCH; live row not planted (F1 / YOLO residual risk). |
| 3.7 `?map=insane` + title `{nick} run` | Matching is Phase 2 (`matchesMapOrOrganizer` includes `map_category`). Titles still `run.displayTitle` → `resolveRunTitle` (unchanged; no category in the fallback). |
| 3.8 MapPicker “All difficulties” filter-only; create requires Run category | MATCH. Filter select still has `aria-label="Filter by difficulty"`, no `name`, not persisted. `validate()` rejects empty map + empty category with the domain string. |
| 3.9 edit mapped → category-only; category-only → map | MATCH. Selecting a map clears category state and hides the Run category select; hidden `map_category` submits `""` when `mapId` is set. Edit page passes `mapCategory: run.mapCategory ?? ""`. |

Progress 3.3–3.5 and 3.7–3.9 are not rubber stamps of missing code: the contract is in the diff. 3.6 is the YOLO-skipped live row only.

## Locked checks

- `CreateRunForm` value-imports `MAP_CATEGORIES` from `@/lib/map-categories` only. `runs.ts` is `import type { MapPickerItem }` — no value import. Island-safe.
- Run category `<select id="run_category">` has no `name`. Exactly one `<input type="hidden" name="map_category" value={mapId ? "" : category} />`. MapPicker difficulty select still unnamed.
- Category line on every Map-row surface. Titles unchanged (`resolveRunTitle` / `displayTitle` not touched in p3).
- 3.6 skip: see F1. Display branch correctly coded.

## Plan vs diff

Commit `597633e` on `feature/category-only-runs` (parent `d4c1270`). Epilogue `4236b6f` is Progress SHAs + `change.md` → `implemented` only.

- In plan and in diff: `CreateRunForm.tsx` — MATCH. `CreateRunFormEditValues.mapCategory`. State + `validate()` XOR. Label **Run category**, hint “Required when no map.” Options = `MAP_CATEGORIES` ladder order (not localeCompare). Map selected → hide select + clear category; clear map leaves category empty. Hidden `map_category` always present.
- In plan and in diff: `MapPicker.tsx` — MATCH. Copy-only: empty state mentions picking a run category. Filter aria-label / “All difficulties” unchanged.
- In plan and in diff: `new.astro` — MATCH. Subtitle “Pick a map or a category…”.
- In plan and in diff: `edit.astro` — MATCH. `mapCategory: run.mapCategory ?? ""`.
- In plan and in diff: `ActiveRunCard.astro`, `runs/[id].astro`, `dashboard.astro` (active + past), `history.astro`, `Welcome.astro`, `admin/users/[id].astro` — MATCH. No shared card module (out of scope).
- In diff, not in plan: `plan.md` Progress checkboxes + epilogue `change.md` — implement ritual, not product scope creep.

No planned Phase 3 file missing from the diff.

## Safety notes (not extra findings)

- Astro interpolates `{run.mapCategory}`; catalog CHECK + `MAP_CATEGORIES` keep values in the eight strings. No XSS surface beyond existing map-name interpolation.
- Hidden `map_category` matches the `starts_at_local` + hidden `starts_at` pattern (disabled/unmounted fields cannot drop the POST key).
- Phase 2 XOR helper still owns persistence; this phase only submits the pair. Map still wins when both would be sent (`mapId` set → hidden value `""`).
- Lessons `?error=` rule: no new API `?error=` paths in this phase.

## Decision

F1 PENDING (observation only; no code fix). YOLO path: Done (no triage). `change.md` stays `implemented` — this is a phase review, not a full-plan impl-review.
