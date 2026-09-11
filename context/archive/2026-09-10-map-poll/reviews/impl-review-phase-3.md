<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Map poll (S-28 / FR-010) Implementation Plan

- **Plan**: context/changes/map-poll/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-09-10
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 669151c (`feat(map-poll): RunPoll island, locked map UI (p3)`)

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

Planned Phase 3 files vs `669151c` (product only):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `src/components/runs/MapPicker.tsx` | optional props; defaults preserved; poll copy via `label` / `emptyHint` / `includeCategoryField={false}` | MATCH |
| `src/components/runs/RunPoll.tsx` (new) | island: create/close confirm+redirect; vote in-island; open no counts; closed counts+winner | MATCH |
| `src/pages/runs/[id].astro` | load after run + `canReadComments`; slot after session maps; Locked map; `detailMaps` from `run.maps` when closed | MATCH |
| `src/pages/runs/[id]/edit.astro` | read-only `lockedMap` when `poll.closed` | MATCH |
| `src/components/runs/CreateRunForm.tsx` | read-only Locked map; MapPicker still seeds `edit.mapIds` from `run.maps` | MATCH |
| `AGENTS.md` Hard Rules (session-maps paragraph) | create/vote/close routes; close must not replace `run_maps`; edit must not re-sync `map_id`; no `run_is_public` | MATCH |

Extra in the commit: `src/lib/fetch-form-json.ts` (`FormJsonMeta.poll`) — contracted glue for Phase 2 vote JSON → island `setPoll`; Progress 3.1–3.2 checkboxes in `plan.md` (implement ritual). Missing vs Phase 3: none.

Locked Crew cuts verified in UI + agent contract:

- MapPicker: `maxSelected` default `RUN_MAPS_MAX`, `includeCategoryField` default `true`, optional `capMessage` / `label` / `emptyHint`. Create/edit caller unchanged (still “Maps (optional)” + category XOR). Poll instance: no hidden `map_category`, unique append, cap 8, difficulty **filter** kept, copy does not say optional or mention run category. Options are catalog maps, not `run.maps`.
- Page load: poll + `listMapsForPicker` only after `run` resolves; poll only when `canReadComments` (same as comments). Guests and pending viewers never mount the island (`showPoll` requires comment-read). Restricted miss still 404s before poll load. `/runs/{id}` still absent from `PROTECTED_ROUTES`.
- Create: organizer + not banned + roster-open (`!completed && !archived`) + no poll row. Close: organizer + open poll + not archived + not verified (Complete still allowed). Vote: `own?.status === "confirmed"` (`canPostOrLike`-style); unseated organizer reads, no vote controls.
- Open UI: option labels + own selection; **no counts** (discriminated `RunMapPoll` omits `count` until `closed_at`). Closed UI: per-option counts + winner highlight. Create/close: `window.confirm` + `fetchFormJson` + redirect (`OrganizerRunLifecycleControls`). Vote: `fetchFormJson` + in-island error (`RunComments`). Reads `?pollError=` on the island; `?error=` still via organizer Banner.
- Locked map: detail row in Run details (name · difficulty · pts). When closed, `detailMaps = run.maps` only (plan-review F1: empty playlist does not duplicate the winner). Session Maps section omitted when empty. `showVerifyFinish` still `run.map != null`. Untitled title still `resolveRunTitle` from the `map` embed (`map_id`). Edit: read-only line; MapPicker seeds `run.maps` only. Cards / `summarizeRunMaps` unchanged.
- `AGENTS.md`: organizer create `POST /api/runs/{id}/poll`, vote `POST /api/runs/{id}/poll/vote`, close `POST /api/runs/{id}/poll/close`; close writes `runs.map_id` (XOR-clears `map_category`) and must not replace `run_maps`; after close, edit must not re-sync `map_id` from `run_maps[0]`; poll SELECT is authenticated comment-read only — do not use `run_is_public`.

Phase interaction: island consumes Phase 2 `getRunMapPoll` / vote JSON `poll` payload; edit still posts playlist `map_ids` (Phase 2 omit + Phase 1 trigger remain the lock). Comment ACL, `can_view_run`, and `run_is_public` were not widened.

`change.md` stays `implementing` — this is a phase-scoped review. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| `npm run lint` | PASS — 0 errors (200 pre-existing-style warnings; no new errors in Phase 3 files) |
| `npx astro sync` | PASS |
| `npm run build` | PASS |

## Manual verification

Progress rows 3.3–3.8 remain `- [ ]`. YOLO skips the UI click-through (Crew locked). Not a reject reason.

Static review (not a substitute for 3.3–3.8): pending/guest have no island; open UI has no counts; closed `detailMaps` skips `run.map` fallback; edit Locked map is read-only; middleware still does not prefix-protect `/runs`; `showVerifyFinish` still keys off `run.map`.

Residual risk: actor-matrix UI (catalog maps not on the session list, change-vote, empty-playlist Locked map vs session list, edit shuffle after close, friends-only 404 vs poll 403, guest public run, clan complete → close → verify-finish) was not executed against a running app.

## Findings

None.

## Notes

- Plan-review F1 (empty playlist duplicate) and F3 (poll MapPicker copy) are implemented as specified.
- Lessons (`?error=` / PostgREST leakage) stay on the Phase 2 fail helpers; the island renders `data.error` / `pollError` only.
- Full-plan review is a separate invocation; this report does not archive the change.
