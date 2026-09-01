---
change_id: run-create-limits
mode: YOLO
started: 2026-09-01
updated: 2026-09-01
status: in-progress
---

# Crew decisions — run-create-limits

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-09-01T12:13 | 10x-new | created change.md (S-25 seed) |
| 2026-09-01T12:20 | 10x-plan | complexity LOW (A) |
| 2026-09-01T12:25 | 10x-plan | round-1: schedule A, defense A, grandfather A, year-clock A |
| 2026-09-01T12:28 | 10x-plan | round-2: verify A (lint+build; manual list) |
| 2026-09-01T12:32 | 10x-plan | plan.md + plan-brief.md written; status planned |
| 2026-09-01T12:40 | 10x-plan-review | SOUND; F1 parse-before-grandfather (obvious) |

## Decisions the Crew Lead made (no human)

### Critical

- **q-schedule-edit** — How FR-007 schedule bounds apply on create vs edit. Chose **A: create = future + ≤1 year; edit = isRunActive + ≤1 year (past start allowed)**. Why: forcing future-only on edit would fail Save on in-progress runs whose `starts_at` has elapsed; still close the >1 year hole on edit.
- **q-defense** — How deep S-25 enforcement goes. Chose **A: client + API only, no migration**. Why: roadmap says form-level guards only; CHECK vs `now()` is a footgun; capacity CHECK would force a backfill; same dual layer as title/capacity today.
- **q-existing-64** — Existing rows with `max_participants > 64`. Chose **A: grandfather until capacity is changed; changed value must be 1–64**. Why: no silent clamp, no fight with `capacity_below_confirmed`; fits no-CHECK; create is always 1–64.

### Non-obvious

- **intent-from-roadmap** — New folder had no freeform intent. Chose **seed Notes from S-25 roadmap outcome** instead of only humanizing the slug. Why: change-id is the roadmap Change ID; empty-intent humanize would drop FR-006/FR-007/US-01, form-level-only, and the S-24 5-cap cut.
- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the research signal is weak; create/edit already shipped; S-25 is a bounded form-guard slice, not an unknown surface.
- **q-complexity** — Plan complexity. Chose **LOW (A)**. Why: S-25 tightens shipped create/edit fields on a shared form; no new endpoints, no Advanced, no 5-cap; the [S] questions still cover the real forks.
- **q-year-clock** — How “1 year ahead” is measured. Chose **A: calendar +1 year (`setFullYear`), same `now` as the past check, inclusive upper bound**. Why: matches FR-007 wording; leap-aware; same clock as today’s past guard; minute granularity of `datetime-local` is enough.
- **q-verify** — How to verify without a test runner. Chose **A: lint + build automated; documented manual create/edit cases**. Why: AGENTS.md forbids assuming Vitest until config + script exist; S-25 is form guards, not a test-infra slice. YOLO will skip the click-through and log residual risk.

### Obvious

- kebab-case id `run-create-limits` unique; 1:1 GitHub link (equals roadmap Change ID S-25); next skill `/10x-plan`.
- **parent-link** — change-id is a roadmap Change ID (`S-25`). Chose **1:1 link existing S-25 card**, no `--parent`. Why: gh-change-sync hybrid rule; ignore parent for 1:1.
- **F1** — Plan-review observation: grandfather compare. Chose **parse to integers before compare; helper takes numbers; form/API parse first**. Why: form `maxParticipants` is a string; naive `===` would always fail grandfather. LOW-impact one-liner; SOUND still stands.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- none yet

## Stop / escape hatches

- none

## GitHub

- change-sync: #89 events new, planned, plan_reviewed (1:1 S-25)
