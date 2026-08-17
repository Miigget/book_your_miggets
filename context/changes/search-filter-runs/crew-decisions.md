---
change_id: search-filter-runs
mode: YOLO
started: 2026-08-17
updated: 2026-08-17
status: complete
---

# Crew decisions — search-filter-runs

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-17T10:11 | 10x-new | created change.md (status: new) |
| 2026-08-17T10:20 | 10x-plan | complexity DECISION_REQUEST → Crew Lead: LOW (A) |
| 2026-08-17T10:25 | 10x-plan | round-1: SSR GET, map substring, UTC day, I-qualify + join_mode |
| 2026-08-17T10:28 | 10x-plan | round-2: ignore invalid params + distinct no-match empty |
| 2026-08-17T10:32 | 10x-plan | plan.md + plan-brief.md written; status planned; roadmap S-03 planning |
| 2026-08-17T10:40 | 10x-plan-review | SOUND; F1 LOW apply int4 cap in Phase 1 |
| 2026-08-17T10:55 | 10x-implement p1 | Phase 1 committed 03fa808; manual 1.4–1.7 skipped (YOLO) |
| 2026-08-17T11:05 | 10x-impl-review p1 | APPROVED |
| 2026-08-17T11:15 | 10x-implement p2 | Phase 2 committed 0c0c322; manual 2.4–2.7 skipped (YOLO) |
| 2026-08-17T11:25 | 10x-impl-review p2 | APPROVED |
| 2026-08-17T11:35 | 10x-impl-review | full-plan APPROVED; status impl_reviewed |

## Decisions the Crew Lead made (no human)

### Critical
- **q-requirements** — What “requirements” means on the list (product semantics of FR-007). Chose **A (I-qualify `min_points <= N` + optional `join_mode`)**. Why: guest discovery is “runs I can join”; a floor filter would hide easier runs when a player types their own points; skip capacity as a fourth axis.
- **phase-end-commits** — Ritual git commits after Phase 1 and Phase 2. Chose **COMMIT_OK**. Why: YOLO authorizes phase-end and archive commits; SHAs `03fa808` and `0c0c322`.
- **archive-despite-manuals** — Archive with Manual Progress still unchecked. Chose **continue archiving**. Why: YOLO auto-archive when only manual rows remain; browser click-through was skipped by mode.

### Non-obvious
- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the research signal is weak; S-03 is a scoped add on the existing public list (map/date/requirements), and `/10x-plan` will map the list surface itself.
- **parent-link** — Ad-hoc `--parent` vs 1:1 roadmap. Chose **1:1 link** (`search-filter-runs` = roadmap Change ID S-03). Why: hybrid rule — ignore `--parent` when the id matches.
- **q-complexity** — Plan complexity LOW vs MEDIUM vs thinner. Chose **A (LOW, 5 design questions)**. Why: additive filters on existing SSR `/runs` + `listActiveRuns()`; no schema/RPC/test-runner; FR-007 axes already locked.
- **q-delivery** — How guests apply filters. Chose **A (SSR GET form + shareable query params)**. Why: guest browse is SSR, Discord-shareable URLs, AGENTS.md prefers Astro over a first list island.
- **q-map** — Map search UX. Chose **A (`?map=` substring on `maps.name`)**. Why: FR-007 is search not pick-one; avoids 1k-row select and MapPicker island; map-less runs drop out when query is non-empty.
- **q-date** — Date filter semantics. Chose **A (single UTC calendar day `?date=YYYY-MM-DD`)**. Why: FR-007 says date singular; one native input; CEST vs UTC mismatch accepted as MVP residual (same Worker TZ issue as `formatStart`).
- **q-empty-invalid** — Empty results vs bad query params. Chose **A (distinct no-match empty + ignore invalid params)**. Why: public list must never look broken; `?error=` is reserved; typo-as-unset is acceptable MVP.

### Obvious
- Intent humanized from slug + roadmap S-03 / FR-007; three-axis scope locked.
- Next stage `/10x-plan` (workflow default).
- **F1 (plan-review LOW)** — Cap `min_points` parse at Postgres int4 (`0..=2147483647`). Chose **apply in Phase 1**. Why: out-of-range integer would 400 the public list; same “invalid = unset” lock.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 manual 1.4–1.7 (logged-out URL filters in browser): skipped (YOLO residual risk)
- Phase 2 manual 2.4–2.7 (form click-through): skipped (YOLO residual risk)

## Stop / escape hatches

- none

## GitHub

- change-sync: #4 events new, planned, plan_reviewed, implementing, implemented (link-roadmap S-03, In review)
