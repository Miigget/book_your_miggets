<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Multi-map session (S-27)

- **Plan**: context/changes/multi-map-runs/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-09-04
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 530b14f (`feat(multi-map-runs): MapPicker, shared cards, detail, AGENTS.md (p3)`)

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

Planned Phase 3 files vs `530b14f` (product only; parent `f16c9e2`):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `src/components/runs/MapPicker.tsx` | `selectedIds` / `onChange`, ordered `map_ids` hiddens, category only when empty, append+remove, cap 8 | MATCH |
| `src/components/runs/CreateRunForm.tsx` | `mapIds: string[]`, client `normalizeRunMapsAndCategory`, MapPicker on default form | MATCH |
| `src/pages/runs/[id]/edit.astro` | seeds `mapIds` from `run.maps`, `mapCategory` from `run.mapCategory` | MATCH |
| `src/components/runs/RunMapsSummary.astro` (new) | `summarizeRunMaps` → Map/Maps `name · difficulty · pts`, `+N more`, Category, omit | MATCH |
| `ActiveRunCard` / `DashboardRunCard` / `RunPreviewCard` / `admin/users/[id].astro` | singular Map/Category blocks replaced with shared summary | MATCH |
| `src/pages/runs/[id].astro` | seven-field Map DL removed; compact rows for full set; Category when list empty | MATCH |
| `AGENTS.md` | Hard Rules bullet with S-27 invariants | MATCH |

Extra in the commit: `context/changes/multi-map-runs/reviews/impl-review-phase-{1,2}.md` plus Progress/crew-decisions stamps (expected bookkeeping). Missing vs Phase 3: none. No verify-finish / Complete / grant / `runs.ts` writer / S-28 files.

Locked Crew cuts verified in `530b14f`:

- **Cards `name · difficulty · pts`, truncate 3 +N**: `summarizeRunMaps` uses `RUN_MAPS_CARD_VISIBLE = 3`. `RunMapsSummary` renders visible rows then `+{extra} more`. Eight maps → three lines + `+5 more`.
- **Detail compact rows, not 7×N**: `[id].astro` builds `detailMaps` (junction, else `[map]`) and lists `name · difficulty · pts` only. `formatReleasedOn` / stars / length / creator / released DL removed. Detail does **not** use the card truncator — full set (≤8).
- **Category-only: no blank Map row**: `kind: "none"` → omit; `kind: "category"` → `Category: {value}`. Detail Map section only when `detailMaps.length > 0`; Category DL when list empty and `mapCategory` set.
- **Title helper unchanged**: `resolveRunTitle` not in this diff; `h1` still `run.displayTitle`.
- **Cap 8, `map_ids` FormData**: hidden `name="map_ids"` per id in add-order; ninth click sets `RUN_MAPS_CAP_MESSAGE` and does not append; client validate calls the same normalize. No leftover `map_id` field.
- **Verify/Complete unchanged this slice**: `showVerifyFinish` still `run.map != null`. `complete.ts` / `verify-finish.ts` / `verify_clan_run_finish` not in the diff. Progress 3.10 left `[ ]` (YOLO residual — no clan fixture). Not a missing Phase 3 feature.
- **S-28 out**: AGENTS records lock field vs junction; no poll UI.

MapPicker stays on the default form (after title, before starts-at). Selected chips have remove, no reorder arrows. `map_category` hidden is difficulty iff `selectedIds.length === 0`. Edit seed uses `run.maps` which `mapsFromRow` already fills from embed or singular `map` fallback (Phase 2). Incoming/Recent/Welcome consume `RunPreviewCard` (shared summary). Guest archived `/runs/{id}` 404 path and comment ACL unchanged.

`change.md` stays `implementing` — this is a phase-scoped review; 3.10 is still open as residual. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| `npm run lint` | PASS — 0 errors (190 pre-existing warnings; none new on Phase 3 files) |
| `npm run build` | PASS — Astro server build complete |
| `AGENTS.md` invariants | PASS — Hard Rules bullet covers `run_maps` cap/unique/add-order, first-map sync, XOR category, cards 3+N, RPC stays singular + app attach, SELECT parent-visible OR `run_is_public`, setter NULL skip / `'{}'` replace, F3 insert site (no `createRun`), invite `p_map_ids` inside RPC, verify awards `map_id` only, no GRANT on `verified_at` / `clans.points`, S-28 must not replace `run_maps` |

## Manual verification

Progress rows 3.4–3.9 are `- [x]` with SHA `530b14f` (YOLO). Re-checked here against code, not a human click-through:

| Check | Result |
|-------|--------|
| 3.4 three maps → card three lines; detail all three; untitled title map 1 | PASS (static) — cards via `RunMapsSummary`; detail full `detailMaps`; title still `displayTitle` / first-map sync |
| 3.5 maps 4–8 → three + `+5 more`; ninth click/submit cap message | PASS (static) — truncate 3; MapPicker ninth click sets `RUN_MAPS_CAP_MESSAGE`; submit uses same normalize |
| 3.6 category-only Hard → Category, no blank Map; `{nick} run` if untitled | PASS (static) — `kind: "category"` / Category DL; Map section omitted; `resolveRunTitle` unchanged |
| 3.7 clear maps + leave category | PASS (static) — Clear all + hidden `map_category` when empty; Phase 2 XOR persist |
| 3.8 invite-only two maps; guest 404 / cannot read junction | PASS (static) — same DTO/cards/detail; guest 404 / RLS not touched this phase |
| 3.9 player Incoming/Recent set (archived public Recent); guest 404 archived detail | PASS (static) — `PlayerProfileRunSections` uses `RunPreviewCard`; `href=null` when viewer cannot open archive |
| 3.10 completed clan Verify + Complete does not award | PENDING (YOLO residual) — skipped, no clan fixture; Verify/Complete code unchanged |

Residual: MapPicker ninth *click* was not driven in a browser this review (already in `crew-decisions.md`). Ninth *submit* is the same cap string the API maps. 3.10 remains the human/clan-fixture checklist, not a code gap.

## Findings

None.

## Notes

- MapPicker selected chips still show `stars` (picker-only). Cards and detail do not — settled lock is list/detail `name · difficulty · pts`.
- `RunMapsSummary` is a `<div>`/`<ul>` dropped into some `<dl>` cards (stacked lines allowed by plan). Preview/Welcome already used a grid, not `dt`/`dd`. Not a contract miss.
- Client validate calls `normalizeRunMapsAndCategory(mapIds, "")`; category rides the hidden field. Cap is the shared check; difficulty select only emits valid `MAP_CATEGORIES` or empty.
- Clear-all on the picker is extra vs the plan’s remove-per-row; benign, supports 3.7.
- Phase 1–2 APPROVED work (F1 SELECT, F3 insert, XOR, `?map=` any name) is not re-opened. This slice did not break those writers.
