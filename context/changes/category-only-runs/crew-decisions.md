---
change_id: category-only-runs
mode: YOLO
started: 2026-08-21
updated: 2026-08-21
status: complete
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
| 2026-08-21T10:30 | 10x-plan-review | verdict SOUND; status plan_reviewed |
| 2026-08-21T10:35 | 10x-implement p1 | schema/grants/types; commit 5d4f02c; status implementing |
| 2026-08-21T10:40 | 10x-impl-review p1 | APPROVED (0 findings) |
| 2026-08-21T10:50 | 10x-implement p2 | XOR helper, APIs, DTO; commit d4c1270 |
| 2026-08-21T10:55 | 10x-impl-review p2 | APPROVED (0 findings); #47 In progress |
| 2026-08-21T11:05 | 10x-implement p3 | form + cards; commits 597633e, 4236b6f; status implemented |
| 2026-08-21T11:10 | 10x-impl-review p3 | APPROVED (1 observation: 3.6 skipped) |
| 2026-08-21T11:10 | gh-change-sync | #47 → In review (implemented) |
| 2026-08-21T11:15 | 10x-impl-review full | APPROVED; status impl_reviewed |
| 2026-08-21T11:16 | pre-archive | commit review artifacts so the change folder is clean |

## Decisions the Crew Lead made (no human)

### Critical
- **plan-q1-storage** — How to store catalog difficulty. Chose **text + CHECK of eight seed values (B)**. Why: catalog values without a new enum/taxonomy; PostgREST cannot insert junk; a ninth DIFF is a migration (catalog is already a snapshot).
- **plan-q2-map-xor** — Category when a map is also set. Chose **null category when map_id is set (A)**. Why: one source of truth on the card; does not infer/denormalize from the map.
- **plan-q3-empty-card** — New create/edit writes. Chose **reject when both map and category are empty (A)**. Why: closes the empty-card failure mode on every new write; with q2 that is XOR in storage.
- **plan-q4-legacy** — Existing map-less rows. Chose **leave readable; next active edit must set map or category (A)**. Why: no invented DIFF backfill; CHECK NOT VALID so old rows stay, INSERT/UPDATE must pass.
- **commits** — Phase-end and archive ritual commits. Chose **COMMIT_OK true**. Why: YOLO full-loop includes those commits; never push / `--no-verify` / `--amend`.
- **archive-anyway** — Soft archive warnings (YOLO-skipped in-browser Progress already marked `[x]`). Chose **continue archiving**. Why: full impl-review APPROVED; leftover is residual human-action risk, not incomplete automated work.

### Non-obvious
- **intent-from-roadmap** — Empty CLI intent on a new folder. Chose **roadmap S-14 outcome as Notes** (not a bare slug humanization). Why: user named a roadmap Change ID; the slice outcome + FR-022/US-07 risk note is the real seed.
- **skip-research** — Whether to hire `/10x-research` first. Chose **skip, go to `/10x-plan`**. Why: YOLO default when the research signal is weak; intent is a known S-14 slice on an existing create-run surface, not an unknown codebase map.
- **gh-parent** — Parent-link for GitHub. Chose **1:1 roadmap link, no `--parent`**. Why: change-id `category-only-runs` equals roadmap Change ID S-14 (obvious per taxonomy; logged here because previous crews record it).
- **plan-complexity** — `/10x-plan` complexity. Chose **MEDIUM / 8 questions (A)**. Why: schema + form/API + several cards with real edge cases (map vs category, legacy map-less rows, S-03 filter); not a one-column LOW, not a taxonomy/architecture HIGH.
- **plan-q5-surfaces** — Where category shows. Chose **every surface that already shows the Map row (A)**. Why: dashboard/history/home/admin would keep the empty-card hole if we only did US-07 literally; no new shared module.
- **plan-q6-filter** — S-03 `?map=` vs category-only runs. Chose **include `map_category` in the existing substring (A)**. Why: Stream B is S-03 → S-14; “Insane” should find category-only Insane runs without a new filter axis.
- **plan-q7-form** — How organizer sets category. Chose **dedicated Category select, enabled only when no map (A)**. Why: MapPicker difficulty is a catalog search filter, not the persisted field; XOR is visible.
- **plan-q8-title** — Titles for category-only runs. Chose **leave `resolveRunTitle` unchanged (A)**. Why: US-07 asks for category on the card, not a new naming scheme.
- **review-F1-categories-module** — How MAP_CATEGORIES reaches CreateRunForm. Chose **extract `src/lib/map-categories.ts` (A)**. Why: CreateRunForm only type-imports runs.ts; a value import would pull the runs↔participants cycle into the island. Same pattern as `run-lifecycle.ts`.
- **review-F2-formdata** — FormData for category select. Chose **select has no name; always one hidden `map_category` (A)**. Why: same as `starts_at`; avoids first-wins if both controls are named.

### Obvious
- kebab-case id `category-only-runs` unique; next skill `/10x-plan`.
- SOUND plan-review → implement; each phase APPROVED → next phase / full review; full APPROVED → archive.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 manual SQL (1.4/1.5): skipped as human eyeball; specialist ran via local psql and marked PASS (YOLO residual risk)
- Phase 2 curl/SQL smokes (2.3–2.7): skipped in-browser form click-through (YOLO residual risk)
- Phase 3 UI (3.3–3.5, 3.7–3.9): skipped in-browser cards / `?map=insane` / MapPicker vs Run category (YOLO residual risk)
- Phase 3.6 grandfathered both-null card: skipped; no planted both-null row (p2 saved the plant as category-only Mod). Display ternary still coded (YOLO residual risk)

## Stop / escape hatches

- none

## GitHub

- change-sync: [#47](https://github.com/Miigget/book_your_miggets/issues/47) 1:1 S-14. Events: `new` (Backlog), `implemented` (In review). `planned` / `plan_reviewed` / `implementing` failed mid-loop (`unknown owner type` / rate limit) and were not all retried; Kanban was moved In progress then In review via `kanban-move.sh`. `archived` pending after `/10x-archive`.
