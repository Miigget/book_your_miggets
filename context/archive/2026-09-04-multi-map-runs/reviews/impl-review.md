<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Multi-map session (S-27)

- **Plan**: context/changes/multi-map-runs/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-09-04
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: fcfa49c (p1), f16c9e2 (p2), 530b14f (p3)

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

Full-plan sweep of `main...HEAD` on `feature/multi-map-runs` after Phase 1–3 reviews already APPROVED. Settled locks were re-checked on the combined tree only — no re-open unless drifted.

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `supabase/migrations/<ts>_run_maps.sql` | `20260904130749_run_maps.sql` | MATCH |
| `src/types/database.ts` | `Tables<"run_maps">`, `run_is_public`, both RPCs `p_map_ids` | MATCH |
| `src/lib/run-maps.ts` | cap 8, XOR + first-map, display kinds, `parseMapIdsFromForm` | MATCH |
| `src/lib/services/runs.ts` | DTO `maps[]`, embed, writers, filter, guest batch, `mapRunWriteError` | MATCH |
| `src/pages/api/runs/index.ts` | `map_ids` FormData; insert then `replaceRunMaps`; invite RPC-only | MATCH |
| `src/pages/api/runs/[id]/index.ts` | `parseMapIdsFromForm` → `updateRun` / setter | MATCH |
| `20260904132544_run_maps_is_not_banned.sql` | Crew-approved Phase 1 F1 fold-in | MATCH (planned extra) |
| MapPicker / CreateRunForm / edit seed | multi-select, ordered `map_ids`, category when empty | MATCH |
| `RunMapsSummary` + four list surfaces | shared 3+N / Category / omit | MATCH |
| `src/pages/runs/[id].astro` | compact rows; Category when list empty; `showVerifyFinish` unchanged | MATCH |
| `AGENTS.md` Hard Rules | S-27 invariants including F1/F2/F3, verify `map_id` only, S-28 lock | MATCH |

Product extras vs plan: none. Bookkeeping (`context/changes/multi-map-runs/*`, roadmap status) is expected. No `createRun`. Verify/Complete APIs and `verify_clan_run_finish` are untouched vs `main`. `can_view_run` is comment-only in the new migrations. Middleware still does not prefix-protect `/runs`.

Locked Crew cuts on the combined work:

- **Cap 8, keep/sync `map_id`, XOR category**: CHECK `run_maps_position_chk`; `normalizeRunMapsAndCategory` first-seen dedupe, `mapId = mapIds[0] ?? null`, non-empty list clears category. Backfill `missing_backfill = 0`.
- **F1 SELECT**: `run_is_public` STABLE DEFINER, `search_path = ''`, visibility-only. SELECT = parent visible OR `run_is_public`. Live policies match. Used only in `run_maps` SELECT.
- **F2 setter**: `p_map_ids uuid[] DEFAULT NULL`; skip on NULL; `'{}'` or a list replaces; no `coalesce` on the setter. Create default `'{}'` always writes.
- **F3 create write**: after `.insert().select("id").single()` in `src/pages/api/runs/index.ts`, `replaceRunMaps`. Junction failure → domain/`RunError` / generic; no success redirect. Invite create/edit pass `p_map_ids` (including `[]`) and never call `replaceRunMaps`.
- **Cards 3+N; detail compact; title unchanged**: `RUN_MAPS_CARD_VISIBLE = 3`; detail lists full `detailMaps` as `name · difficulty · pts`; `resolveRunTitle` not in the product diff.
- **Verify awards first `map_id` only; Complete does not award**: `showVerifyFinish` still `run.map != null`; complete/verify-finish routes and SQL not in the diff.
- **S-28 out**: AGENTS records lock field vs junction; no poll UI.
- **`is_not_banned()` on INSERT/DELETE**: live policies include the helper (Phase 1 warning folded in `20260904132544`). Not re-opened.
- **PostgREST `!runs_map_id_fkey`**: accepted adaptation; still present on `RUN_SELECT`.

`replaceRunMaps` call sites are only the public/friends/clan create insert and `updateRun`. Lessons: create/edit redirects map via `RunError` / `RunMapsError` / `mapRunWriteError` or a generic fallback — never raw PostgREST `error.message`.

## Automated verification

| Command | Result |
|---------|--------|
| Local migrations applied | PASS — `20260904130749` and `20260904132544` on local |
| SQL 1.2 backfill | PASS — `missing_backfill = 0` |
| GRANT EXECUTE new invite signatures; old gone | PASS — one overload each; `authenticated` EXECUTE true, `anon` false; `run_is_public` EXECUTE anon+authenticated |
| Live INSERT/DELETE include `is_not_banned()` | PASS |
| Authenticated `GRANT UPDATE` on `runs` | PASS — nine columns (`map_id` / `map_category` / `auto_join_min` included). Closed: `completed_at`, `archived_at`, `extended_until`, `verified_at`, `organizer_id`. `clans.points` not granted UPDATE |
| `npm run lint` | PASS — 0 errors (190 pre-existing warnings) |
| `npm run build` | PASS — Astro server build complete |
| `RUN_MAPS_MAX === 8` + display kinds | PASS — `maps` / `category` / `none` |
| `AGENTS.md` invariants | PASS — Hard Rules bullet covers the Phase 3 contract |

## Manual verification

Progress 1.5–1.8, 2.4–2.8, 3.4–3.9 are `- [x]` with phase SHAs (YOLO). Re-checked against combined code + live local SQL, not a human click-through.

| Check | Result |
|-------|--------|
| 1.5–1.8 RLS / cap / F1 archived public | PASS (prior phase review + live policies unchanged) |
| 2.4–2.8 persist / XOR / domain `?error=` / `?map=` / F3 vs invite | PASS (static + call-site grep) |
| 3.4–3.9 cards/detail/category/invitee/guest Recent | PASS (static — shared summary + compact detail + `RunPreviewCard`) |
| 3.10 completed clan Verify + Complete does not award | PENDING (YOLO residual) — skipped, no clan fixture; Verify/Complete code unchanged vs `main` |

Residual (already in `crew-decisions.md`): browser MapPicker ninth click; guest HTML GET archived `/runs/{id}` 404; clan-fixture Verify/Complete. Load-bearing ACL (`can_view_run` false for archived public as anon) and verify/complete writers were not touched this change.

## Findings

None. Phase 1 WARNING (`is_not_banned()` on writes) was folded in Phase 2 and is live. Combined work did not drift from settled locks.

## Notes

- Junction-after-insert remains two-step as planned: fail the request on junction error; run row may remain; display falls back to singular `map`.
- MapPicker Clear-all and picker-only stars on selected chips are benign extras; cards/detail stay `name · difficulty · pts`.
- `change.md` stamped `impl_reviewed` by this full-plan review. Progress 3.10 stays `[ ]` (epilogue residual, not a missing feature).
