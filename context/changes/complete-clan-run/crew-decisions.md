---
change_id: complete-clan-run
mode: YOLO
started: 2026-09-01
updated: 2026-09-01
status: in-progress
---

# Crew decisions — complete-clan-run

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-09-01 | 10x-new | created change.md (S-22, owner marks clan-only run completed) |
| 2026-09-01 | 10x-plan | DECISION_REQUEST complexity + complete-vs-archive + eligibility + admin queue |
| 2026-09-01 | 10x-plan | DECISION_REQUEST round-2 freeze + chip + UX + phases |
| 2026-09-01 | 10x-plan | wrote plan.md + plan-brief.md (status planned) |
| 2026-09-01 | 10x-plan-review | verdict REVISE — F1–F4 LOW; Crew Lead FIX all |
| 2026-09-01 | 10x-plan | REVISE pass applied F1–F4 to plan.md |
| 2026-09-01 | 10x-plan-review | re-review SOUND; leftover F1 FIXED (no userOwnsClan pre-check); F2 observation ACCEPTED |
| 2026-09-01 | 10x-implement | Phase 1 SQL contract (`completed_at`, `complete_clan_run`, roster freeze) |

## Decisions the Crew Lead made (no human)

### Critical

- **q2-complete-vs-archive** — How should “completed” relate to S-24 `archive_run`? Chose **A: distinct `completed_at`; do not call `archive_run`**. Why: US-02 needs comment writes after complete for `/teamrank` + screenshots; archive already stops comments; S-23 needs a filterable stamp; 5-cap stays occupied until Archive.

- **q4-admin-queue** — Does S-22 include an admin verify queue? Chose **A: stamp only; no admin list or verify UI**. Why: FR-021 is owner Complete; junk-in-queue and verified-finish belong to S-23; wiring verify early risks points-on-complete.

- **q5-freeze** — After Complete, which mutations stay open? Chose **A: freeze join / leave / decide / edit / extend; Archive still allowed**. Why: S-23 needs a stable roster/map; comments stay writable; Archive still frees the 5-cap; do not touch `archived_at`.

### Non-obvious

- **skip-research** — Whether to map the codebase before planning. Chose **skip research, go `/10x-plan`**. Why: YOLO default when research signal is not explicit; S-21 archive + PRD FR-021 already bound the slice; plan nested explore can ground archive vs complete.

- **parent-link** — change-id `complete-clan-run` equals roadmap Change ID S-22. Chose **1:1 link existing roadmap card** (`--parent` ignored). Why: gh-change-sync hybrid rule.

- **q1-complexity** — Plan complexity. Chose **A: MEDIUM**. Why: new DEFINER stamp + owner UI beside Archive, not a new lifecycle axis and not a copy of `archive_run`.

- **q3-eligibility** — When may the owner complete? Chose **A: in-progress only** (audience-active, now ≥ starts_at, clan_only, not already completed). Why: complete is a session-finish signal; upcoming Complete is extra junk; Archive-then-Complete is out of this slice.

- **q6-chip-audience** — Who sees Completed? Chose **A: anyone who can already view the run** (detail + Clan/dashboard cards). Why: members need to know to post proof; guests still 404.

- **q7-complete-ux** — Complete button UX. Chose **A: confirm dialog like Archive**, copy says not archive and not points. Why: one-shot `completed_at` has no undo; must not look like Archive; 5-cap reminder stays on the Archive control.

- **q8-phases** — Phase split. Chose **A: SQL → API → UI** (three phases like S-24). Why: implement can ship the stamp before UI; freeze lives with the SQL increment.

### Obvious

- Intent seed from roadmap S-22 / archived S-21: owner-only (no officer UI), points stay locked until S-23.
- Plan against `prd-v2.md` FR-021 (not v1 organizer-edit FR-021).
- **F1** — Split Progress: other-clan-owner is `3.6`, admin is `3.7` (keep the leak check).
- **F2** — Add Phase 1 authenticated smokes: apply INSERT / leave DELETE / organizer UPDATE fail on a completed clan-only run.
- **F3** — Archived wins over Completed (`lifecyclePhase !== "archived"`).
- **F4** — `runRowFromPublicRpc` stubs `completed_at: null`; do not change `list_player_public_runs`.
- **SOUND-F1** — Delete `userOwnsClan` pre-check on POST complete; match `archive.ts` (auth + RPC only). Why: pre-check leaks restricted runs (404-like vs honest owner string).
- **SOUND-F2** — Observation ACCEPTED: Phase 3 must split Edit from Archive on `[id].astro`; do not put `!completedAt` on the shared wrapper.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1.5 Studio/SQL-editor replay: skipped (YOLO residual risk). Automated authenticated smokes 1.1–1.4 passed (18/18) against local Supabase; Studio click-through not required this phase.

## Stop / escape hatches

- none

## GitHub

- change-sync: #86 events new, planned, plan_reviewed (link-roadmap S-22 → Backlog)
