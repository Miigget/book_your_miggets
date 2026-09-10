---
change_id: map-poll
mode: YOLO
started: 2026-09-10
updated: 2026-09-10
status: in-progress
---

# Crew decisions — map-poll

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-09-10 | 10x-new | created change.md (S-28 / FR-010) |
| 2026-09-10 | 10x-research | wrote research.md; next = plan |
| 2026-09-10 | 10x-plan | plan.md + plan-brief.md; status planned |
| 2026-09-10 | 10x-plan-review | SOUND; F1–F3 LOW one-liners applied to plan |

## Decisions the Crew Lead made (no human)

### Critical
- **tie-break** — Winner when two options share max votes? Chose **A: first option in organizer add-order**. Why: deterministic SQL `ORDER BY position`, same semantics as `run_maps`; no extra close UI; silent organizer-order bias is acceptable for FR-010 MVP.
- **reopen** — One poll forever vs reopen after close? Chose **A: one poll per run, no reopen**. Why: FR-010 is singular; `UNIQUE(run_id)` stays simple; locked `map_id` cannot unfreeze into verify-finish desync.
- **create-window** — When may organizer create the poll? Chose **A: while roster-open (after start OK; complete and archive no)**. Why: copy `is_run_roster_open_row` like edit/`run_maps`; in-progress teams can still pick a map; close of an already-open poll can still happen after Complete.
- **zero-vote** — Close with no votes? Chose **A: refuse close (`no_votes`), poll stays open, `map_id` unchanged**. Why: FR-010 is a voted winner, not an organizer default; UNIQUE one-poll-per-run would otherwise trap a dead poll if we stamped close without a lock.

### Non-obvious
- **research-vs-plan** — After `/10x-new`, hire research or skip to plan? Chose **hire `/10x-research`**. Why: S-28 is a new poll/vote/close model on shipped `runs.map_id`, `run_maps`, comment ACL, and organizer RPCs; AGENTS.md already constrains S-28 not to replace `run_maps`. That is a clear codebase-map need, not the YOLO “unclear → skip” case.
- **parent-link** — `map-poll` equals roadmap Change ID S-28. Chose **1:1 link, no `--parent`**. Why: hybrid rule is written down; ignore `--parent`.
- **complexity** — Confirm plan complexity? Chose **A: MEDIUM, 5–7 [S] questions**. Why: new tables + RPCs + edit freeze + island, but archive/comment/MapPicker templates exist; HIGH would re-ask locked ACL/lock-field; LOW would skip load-bearing lifecycle.
- **option-cap** — Min/max maps on one poll? Chose **A: 2–8 (same as `run_maps` / MapPicker)**. Why: one cognitive cap; reuse `RUN_MAPS_MAX` uniqueness; poll is not the session list but forking MapPicker for 16 is not worth it on MVP.
- **live-tallies** — Who sees counts while open? Chose **A: hide counts until close; voters see options + own vote**. Why: no bandwagon; simpler SELECT (no live aggregates); organizer race-watching is extra ACL for little FR-010 value.

### Obvious (optional, keep short)
- Intent seed from roadmap S-28 / FR-010, not a humanized empty slug.
- Skip `/10x-frame` (not a bug+fix; no convergence failure).
- Plan-review SOUND; applied F1 (`detailMaps` no `run.map` fallback when closed), F2 (`parseMapIdsFromForm` on create), F3 (poll MapPicker `label` / `emptyHint`) as one-liners — no re-plan.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- none yet

## Stop / escape hatches

- none

## GitHub

- change-sync: #92 events new, planned
