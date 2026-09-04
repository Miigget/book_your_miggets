<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Multi-map session (S-27)

- **Plan**: context/changes/multi-map-runs/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-09-04
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: f16c9e2 (`feat(multi-map-runs): normalize, create/edit writes, loaders, filter (p2)`)

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

Planned Phase 2 files vs `f16c9e2` (product only; parent `fcfa49c`):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `src/lib/run-maps.ts` (new) | cap 8, normalize XOR + first-map, display kinds, `parseMapIdsFromForm` | MATCH |
| `src/lib/services/runs.ts` | DTO `maps[]`, `RUN_SELECT` embed, writers, filter, guest batch, `mapRunWriteError` | MATCH |
| `src/pages/api/runs/index.ts` | `getAll("map_ids")`, public insert then `replaceRunMaps`, invite `p_map_ids` only | MATCH |
| `src/pages/api/runs/[id]/index.ts` | `parseMapIdsFromForm` → `updateRun` / setter | MATCH |
| `supabase/migrations/20260904132544_run_maps_is_not_banned.sql` | Crew-approved Phase 1 F1 fold-in | MATCH (planned extra) |

Extra in the commit: `context/changes/multi-map-runs/plan.md` Progress 2.1–2.8 checkboxes (expected). Missing vs Phase 2: none. MapPicker / cards / detail / `AGENTS.md` Hard Rules are Phase 3.

No fictional `createRun`. Public/friends/clan create still inlines `.insert()` in `src/pages/api/runs/index.ts` then calls exported `replaceRunMaps` (allowed helper that this insert calls). Invite create/edit pass `p_map_ids` (including `[]`) and do not PostgREST-write `run_maps` after the RPC.

Locked Crew cuts verified in `f16c9e2` + local DB `20260904132544`:

- **F3 create write site**: after successful `.insert().select("id").single()`, `replaceRunMaps(supabase, run.id, mapIds, …)`. Junction failure → `mapRunWriteError` / `RunError.message` or generic `"Could not create this run"`; no success redirect. Run row may remain; `mapsFromRow` still falls back to singular `map` (synced `map_id`).
- **Invite-only via `p_map_ids` only**: `createInviteOnlyRun` / `setRunVisibilityAndInvites` always pass `p_map_id`, `p_map_category`, and `p_map_ids`. No `replaceRunMaps` on those paths. Setter still omits `p_update_auto_join_min` when join-mode is locked.
- **First-map sync + XOR**: `normalizeRunMapsAndCategory` — first-seen dedupe, cap throw `RUN_MAPS_CAP_MESSAGE`, `mapId = mapIds[0] ?? null`, non-empty list clears category (list wins if difficulty also sent), empty list validates category or both-null. `prepareOwnedActiveRunPatch` wraps `RunMapsError` → `RunError`.
- **Cap 8, domain `?error=`**: app throws before PostgREST; `mapRunWriteError` maps `run_maps_cap` / `run_maps_position_chk` → `RUN_MAPS_CAP_MESSAGE`; `run_maps_map_id_fkey` / `run_maps_pkey` / `run_maps_run_id_position_key` → `"Map is invalid"`. Create/edit redirects use mapped/`RunError`/`RunMapsError` strings or a generic fallback — never `error.message` (lessons).
- **`?map=` any attached name**: `matchesMapOrOrganizer` uses `mapsFromRow` names plus singular `map?.name`, organizer nick, and `map_category`.
- **`is_not_banned()` on INSERT/DELETE**: live policies `run_maps_insert_organizer_open` / `run_maps_delete_organizer_open` include `is_not_banned()` + organizer + three-arg `is_run_roster_open_row`. SELECT unchanged (`parent visible OR run_is_public`). No GRANT UPDATE on lifecycle stamps / `clans.points`.
- **PostgREST `!runs_map_id_fkey` hint**: `RUN_SELECT` uses `map:maps!runs_map_id_fkey` and nested `map:maps!run_maps_map_id_fkey`. Accepted adaptation; not re-opened.

`change.md` stays `implementing` — this is a phase-scoped review; phase 3 is not done. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| `npm run lint` | PASS — 0 errors (190 pre-existing warnings; `console.error` on new write paths matches sibling APIs) |
| `npm run build` | PASS — Astro server build complete |
| `RUN_MAPS_MAX === 8` + display kinds | PASS — `src/lib/run-maps.ts` exports `RUN_MAPS_MAX = 8` and `RunMapsSummary` kinds `maps` / `category` / `none` |
| Local migration `20260904132544` | PASS — applied on local; INSERT/DELETE policies include `is_not_banned()` |

## Manual verification

Progress rows 2.4–2.8 are `- [x]` with SHA `f16c9e2` (YOLO). Re-checked here against code + local policies, not a live Astro FormData session:

| Check | Result |
|-------|--------|
| 2.4 three UUIDs → positions 1..3, `map_id` = first, category null | PASS (static) — normalize + `replaceRunMaps` `position: index + 1`; create insert writes synced `map_id` / null category |
| 2.5 empty `map_ids` + Hard | PASS (static) — XOR keeps category; `replaceRunMaps` deletes then returns on empty list |
| 2.6 nine ids / duplicate → domain `?error=` | PASS (static) — nine unique throw `RUN_MAPS_CAP_MESSAGE` before DB; first-seen dedupe is the plan contract; leftover unique/FK map to `"Map is invalid"` |
| 2.7 `?map=` matches second attached name | PASS (static) — `matchesMapOrOrganizer` scans `mapsFromRow` (embed sorted by `position`, else batch `maps[]`, else `[map]`) |
| 2.8 public insert writes junction; invite RPC-only | PASS (static) — `index.ts` insert then `replaceRunMaps`; invite branch only `createInviteOnlyRun` |

Residual: curl/FormData against a running Astro session was not re-executed in this review. Live MapPicker still posts `map_id` until Phase 3 (already logged in `crew-decisions.md`). Load-bearing API contract is `map_ids`.

## Findings

None.

## Notes

- Phase 1 impl-review F1 (`is_not_banned()` missing on `run_maps` writes) is addressed by `20260904132544`. Not re-opened.
- `summarizeRunMaps` is exported and unused until Phase 3 cards — planned, not drift.
- `run-maps.ts` does not import `runs.ts` (island-safe, same class as `run-limits.ts`). `isMapCategory` comes from `@/lib/map-categories`.
- `listPlayerProfileRuns` still does not DROP `list_player_public_runs`. RPC rows start `maps: []`; `attachRunMapsFromJunction` chunks like participant counts. Empty junction + singular `map` still displays as `[map]`.
- `getOwnedActiveRunForEdit` uses `RUN_SELECT` so `run.maps` is available for Phase 3 seed.
- Title still `resolveRunTitle` with `map?.name` only.
- Phase 3 (MapPicker multi-select, shared card/detail summary, edit seed, `AGENTS.md`) is not in this review.
