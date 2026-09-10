<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Map poll (S-28 / FR-010) Implementation Plan

- **Plan**: context/changes/map-poll/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-09-10
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: 43b38ae (p1), 353c5d3 (p2), 669151c (p3)
- **Prior phase reviews**: impl-review-phase-1.md, impl-review-phase-2.md, impl-review-phase-3.md — each APPROVED, 0 findings

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

Product files in `43b38ae^..HEAD` vs plan (all three phases). Context artifacts under `context/changes/map-poll/` are 10x ritual, not product creep.

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `supabase/migrations/<ts>_run_map_poll.sql` | `20260910125037_run_map_poll.sql` | MATCH |
| `src/types/database.ts` | tables + `create_map_poll` / `vote_map_poll` / `close_map_poll` | MATCH |
| `src/lib/services/polls.ts` | new | MATCH |
| `src/pages/api/runs/[id]/poll.ts` | `parseMapIdsFromForm` | MATCH |
| `src/pages/api/runs/[id]/poll/vote.ts` | `pollFail` + JSON poll payload | MATCH |
| `src/pages/api/runs/[id]/poll/close.ts` | archive.ts skeleton | MATCH |
| `src/lib/services/runs.ts` | closed-poll omit + `map_id_locked` | MATCH |
| `src/lib/comment-mutation-http.ts` (`pollFail`) | contracted sibling of `commentFail` | MATCH |
| `src/components/runs/MapPicker.tsx` | optional props; poll copy via `label` / `emptyHint` | MATCH |
| `src/components/runs/RunPoll.tsx` | island | MATCH |
| `src/pages/runs/[id].astro` | load after run + comment-read; Locked map; `detailMaps` from `run.maps` when closed | MATCH |
| `src/pages/runs/[id]/edit.astro` | read-only locked map | MATCH |
| `src/components/runs/CreateRunForm.tsx` | read-only Locked map; MapPicker seeds `run.maps` | MATCH |
| `AGENTS.md` | poll routes; close must not replace `run_maps`; no first-map re-sync; no `run_is_public` | MATCH |
| `src/lib/fetch-form-json.ts` (`FormJsonMeta.poll`) | contracted vote-JSON glue | MATCH |

Missing vs plan: none. Unplanned product extras: none beyond the two contracted glue files named in the Phase 2 HTTP contract (`pollFail`) and Phase 3 vote island (`fetchFormJson` poll payload).

Locked Crew cuts verified across phases:

- Dual identity held: close `UPDATE runs SET map_id = winner, map_category = null` then stamps `closed_at` / `winner_map_id`; no `run_maps` / `p_map_ids` on close.
- Vote SELECT: own row among comment-read while open; all rows only after `closed_at`. No anon GRANT. No `run_is_public` / `can_view_run`. App does not aggregate until closed.
- Freeze: trigger `map_id_locked` (P0001) after close; `prepareOwnedActiveRunPatch` keeps form `mapIds` but overwrites `mapId` / `mapCategory` with existing lock; invite setter same 13-arg signature, skips those columns when closed, still applies `p_map_ids`.
- Vote and close `SELECT … FOR UPDATE` the poll row. Close after Complete allowed (DEFINER + `is_run_active_row`); create after Complete `not_open`. Archive / `verified_at` refuse close.
- Restricted miss: poll APIs never 403; wrong actor → `not_found`. `/runs/{id}` still absent from `PROTECTED_ROUTES`.
- UI: island after session maps, gated like comments; open UI has no counts; unseated organizer reads, no vote; Locked map on detail/edit; empty playlist does not duplicate the winner in the session list (plan-review F1).
- Lessons: domain strings only in `?error=` / `?pollError=`; infra `console.error` + generic; `map_id_locked` mapped through `mapRunWriteError`.

What We're NOT Doing: none of the out-of-scope items appear in the product diff (no reopen, no live tallies, no admin poll routes, no verify SUM, no comment/screenshot ACL widening, no Vitest, no card redesign).

Phase interaction: island consumes Phase 2 `getRunMapPoll` / vote JSON; edit still posts playlist `map_ids` (Phase 2 omit + Phase 1 trigger remain the lock). Close-vs-freeze order matches the load-bearing plan note.

## Automated verification

Re-run this invocation (full plan):

| Command | Result |
|---------|--------|
| `npm run lint` | PASS — 0 errors (200 pre-existing-style `no-console` / Astro class warnings) |
| `npx astro sync` | PASS |
| `npm run build` | PASS |

Phase 1 `db:types` and local migration apply were already PASS on 43b38ae (see impl-review-phase-1.md). Not re-resetting the local DB in this review.

## Manual verification

Progress rows 1.4–1.11, 2.3–2.9, and 3.3–3.8 remain `- [ ]`. YOLO skips human-action manuals (Crew locked). Not a reject reason.

Static review is not a substitute for those actor-matrix SQL / HTTP / UI click-throughs.

Residual risk: live sessions were not used to confirm non-organizer create, pending vote, PostgREST INSERT deny, cross-user vote SELECT while open, `map_id_locked` after close, tie-break, zero-vote close, invite-only edit after lock, friends-only 404 vs poll 403, guest public run (no island), or clan complete → close → verify-finish.

## Findings

None.

## Notes

- Phase reviews 1–3 each APPROVED with 0 findings; this full-plan pass re-read product files and found no compounding drift.
- Plan-review F1 (empty playlist duplicate) and F3 (poll MapPicker copy) are implemented as specified. F2 (`parseMapIdsFromForm`) is on the create route.
- `change.md` stamped `impl_reviewed` by this review. Do not archive in this invocation.
