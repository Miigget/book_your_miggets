---
change_id: category-only-runs
mode: YOLO
started: 2026-08-21
updated: 2026-08-21
status: in-progress
---

# Crew decisions — category-only-runs

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-21T10:17 | 10x-new | created change.md (status: new) |
| 2026-08-21T10:20 | 10x-plan | complexity = MEDIUM (8 questions) |
| 2026-08-21T10:22 | 10x-plan | round-1: CHECK eight values; XOR map/category; no backfill |
| 2026-08-21T10:24 | 10x-plan | round-2: all Map-row surfaces; ?map= matches category; dedicated select; titles unchanged |
| 2026-08-21T10:26 | 10x-plan | plan.md + plan-brief.md written; status planned |
| 2026-08-21T10:28 | 10x-plan-review | F1 extract map-categories.ts; F2 hidden map_category only |

## Decisions the Crew Lead made (no human)

### Critical
- **plan-q1-storage** — How to store catalog difficulty. Chose **text + CHECK of eight seed values (B)**. Why: catalog values without a new enum/taxonomy; PostgREST cannot insert junk; a ninth DIFF is a migration (catalog is already a snapshot).
- **plan-q2-map-xor** — Category when a map is also set. Chose **null category when map_id is set (A)**. Why: one source of truth on the card; does not infer/denormalize from the map.
- **plan-q3-empty-card** — New create/edit writes. Chose **reject when both map and category are empty (A)**. Why: closes the empty-card failure mode on every new write; with q2 that is XOR in storage.
- **plan-q4-legacy** — Existing map-less rows. Chose **leave readable; next active edit must set map or category (A)**. Why: no invented DIFF backfill; CHECK NOT VALID so old rows stay, INSERT/UPDATE must pass.
- **plan-q5-surfaces** — Where category shows. Chose **every surface that already shows the Map row (A)**. Why: dashboard/history/home/admin would keep the empty-card hole if we only did US-07 literally; no new shared module.
- **plan-q6-filter** — S-03 `?map=` vs category-only runs. Chose **include `map_category` in the existing substring (A)**. Why: Stream B is S-03 → S-14; “Insane” should find category-only Insane runs without a new filter axis.
- **plan-q7-form** — How organizer sets category. Chose **dedicated Category select, enabled only when no map (A)**. Why: MapPicker difficulty is a catalog search filter, not the persisted field; XOR is visible.
- **plan-q8-title** — Titles for category-only runs. Chose **leave `resolveRunTitle` unchanged (A)**. Why: US-07 asks for category on the card, not a new naming scheme.
- **review-F1-categories-module** — How MAP_CATEGORIES reaches CreateRunForm. Chose **extract `src/lib/map-categories.ts` (A)**. Why: CreateRunForm only type-imports runs.ts; a value import would pull the runs↔participants cycle into the island. Same pattern as `run-lifecycle.ts`.
- **review-F2-formdata** — FormData for category select. Chose **select has no name; always one hidden `map_category` (A)**. Why: same as `starts_at`; avoids first-wins if both controls are named.

### Non-obvious
- **intent-from-roadmap** — Empty CLI intent on a new folder. Chose **roadmap S-14 outcome as Notes** (not a bare slug humanization). Why: user named a roadmap Change ID; the slice outcome + FR-022/US-07 risk note is the real seed.
- **skip-research** — Whether to hire `/10x-research` first. Chose **skip, go to `/10x-plan`**. Why: YOLO default when the research signal is weak; intent is a known S-14 slice on an existing create-run surface, not an unknown codebase map.
- **gh-parent** — Parent-link for GitHub. Chose **1:1 roadmap link, no `--parent`**. Why: change-id `category-only-runs` equals roadmap Change ID S-14 (obvious per taxonomy; logged here because previous crews record it).
- **plan-complexity** — `/10x-plan` complexity. Chose **MEDIUM / 8 questions (A)**. Why: schema + form/API + several cards with real edge cases (map vs category, legacy map-less rows, S-03 filter); not a one-column LOW, not a taxonomy/architecture HIGH.

### Obvious
- kebab-case id `category-only-runs` unique; next skill `/10x-plan`.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- none yet

## Stop / escape hatches

- none

## GitHub

- change-sync: #47 events new (1:1 S-14, Backlog)
