---
change_id: verified-finish-clan-points
mode: YOLO
started: 2026-09-01
updated: 2026-09-01
status: in-progress
---

# Crew decisions — verified-finish-clan-points

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-09-01 | 10x-new | created change.md (status: new); sync #87 Backlog |
| 2026-09-01 | 10x-research | research.md; status preparing |
| 2026-09-01 | 10x-plan | DECISION_REQUEST complexity + 3 [S] |
| 2026-09-01 | 10x-plan | DECISION_REQUEST round-2 (unverify, roster, chip) |
| 2026-09-01 | 10x-plan | plan.md + plan-brief.md; status planned |
| 2026-09-01 | 10x-plan-review | SOUND; F1/F2 LOW patched in plan; status plan_reviewed |
| 2026-09-01 | 10x-implement p1 | SQL contract; commit b05ae82; status implementing |
| 2026-09-01 | 10x-impl-review p1 | APPROVED |
| 2026-09-01 | 10x-implement p2 | App API; commit f798410 |
| 2026-09-01 | 10x-impl-review p2 | APPROVED |
| 2026-09-01 | 10x-implement p3 | Admin control, Verified-finish chip, AGENTS.md |

## Decisions the Crew Lead made (no human)

### Critical
- **q-verify-after-archive** — When may admin mark verified-finish if the organizer archived first? Chose **B: whenever `completed_at` is set, including archived**. Why: FR-022 requires completed, not audience-active; Archive already frees the 5-cap and signed screenshot URLs still work for admin; rejecting archived would let organizers strand points.
- **q-null-map** — What if `map_id` is null on a completed clan run? Chose **A: reject with `no_map` (do not stamp, do not award)**. Why: FR-019 awards map points; a successful verify with 0 or a badge-without-award is easy to misread as a writer failure, and map cannot be edited after Complete.
- **q-unverify** — Can admin revoke verified-finish / subtract points? Chose **A: no undo — one-shot stamp; `already_verified` does not add again**. Why: same contract as Complete; smallest S-23; no negative-points writer; mistaken over-award is accepted residual risk until a later admin tool.

### Non-obvious
- **intent-from-roadmap** — New folder had no freeform intent. Chose **seed Notes from S-23 roadmap outcome** instead of only humanizing the slug. Why: change-id is the roadmap Change ID; empty-intent humanize would drop FR-019/022/023/018/030/US-02 scope, the S-22/S-20 prereqs, and the parked `/teamrank` scrape.
- **research-before-plan** — Whether to hire `/10x-research`. Chose **yes**. Why: last mile of US-02 spans Complete freeze (S-22), ranking zeros (S-18), admin surfaces, map points, and the S-20 screenshot thread — a clear codebase-map signal, not the default plan-first skip.
- **q-complexity** — Plan complexity. Chose **A: MEDIUM**. Why: new DEFINER writer + trigger bypass + admin HTTP/UI, but patterns are known; HIGH would re-ask research; LOW would skip archive/map-less contract questions.
- **q-screenshot-gate** — Require screenshot comments in SQL before verify? Chose **A: no SQL gate — admin judgment only**. Why: PRD source of truth is in-game `/teamrank`; SQL cannot tell a `/teamrank` shot from a meme; empty thread is accepted residual risk.
- **q-empty-roster** — Verify with zero confirmed participants? Chose **A: allow — admin judgment only**. Why: Complete does not require a roster; organizer is often unseated (S-08) and cannot seat after freeze; a SQL `no_participants` gate would permanently block legitimate owner finishes.
- **q-verified-chip** — What do viewers see on the run after verify? Chose **A: Verified-finish chip on `/runs/{id}` for anyone who can view, including archived**. Why: participants need an in-place reason ranking moved; guests still 404 on `clan_only`; ranking list already sorts by points.

### Obvious
- kebab-case / uniqueness of `verified-finish-clan-points`
- gh-change-sync 1:1 link (change-id equals roadmap S-23 Change ID; no `--parent`)
- Branch `feature/verified-finish-clan-points` from up-to-date `main` before phase commits (AGENTS.md trunk)
- Plan-review F1/F2 LOW already patched in plan.md — proceed SOUND without re-plan
- Phase-end commits: YOLO `COMMIT_OK`; unrelated dirty stay unstaged; `Refs: #87`

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1.5 SQL-editor replay: skipped (YOLO residual risk; automated smoke ran against local Postgres)
- Phase 2.4–2.6 cookie-session HTTP: skipped (YOLO residual risk)
- Phase 3.2–3.8 browser path: skipped (YOLO residual risk)

## Stop / escape hatches

- none

## GitHub

- change-sync: #87 events new → Backlog (link-roadmap S-23); planned → Backlog; plan_reviewed pending
