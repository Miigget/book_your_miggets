---
change_id: clan-domain-schema
mode: YOLO
started: 2026-08-27
updated: 2026-08-27
status: in-progress
---

# Crew decisions — clan-domain-schema

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-27T13:21Z | 10x-new | created change.md (status: new) |
| 2026-08-27T13:25Z | 10x-plan | DECISION_REQUEST complexity → Crew Lead A (MEDIUM) |
| 2026-08-27T13:28Z | 10x-plan | DECISION_REQUEST round-1 q2–q5 → Crew Lead all A |
| 2026-08-27T13:32Z | 10x-plan | DECISION_REQUEST round-2 q6–q9 → Crew Lead all A |
| 2026-08-27T13:36Z | 10x-plan | wrote plan.md + plan-brief.md; change.md → planned |
| 2026-08-27T13:40Z | 10x-plan-review | verdict REVISE; F1 CRITICAL LOW — ON CONFLICT swallows second-clan PK |
| 2026-08-27T13:41Z | 10x-plan | Crew Lead: apply F1 ⭐ (drop ON CONFLICT); skip optional UNIQUE(owner_id) |
| 2026-08-27T13:42Z | 10x-plan | F1 applied in plan.md + plan-brief.md |
| 2026-08-27T13:45Z | 10x-plan-review | re-review SOUND; F1 FIXED |
| 2026-08-27T13:46Z | git | branch feature/clan-domain-schema from main |
| 2026-08-27T13:50Z | 10x-implement p1 | migration + commit 8f0aa32; change.md → implementing |
| 2026-08-27T13:53Z | 10x-impl-review p1 | APPROVED 0 findings |
| 2026-08-27T13:46Z | 10x-implement | Phase 1: authored `20260827114633_clan_domain_schema.sql`; change.md → implementing |
| 2026-08-27T13:57Z | 10x-implement p2 | db reset, db:types, lint, build, RLS smoke via psql |

## Decisions the Crew Lead made (no human)

### Critical
- **q2-cardinality** — How many clans can one player belong to? Chose **A / UNIQUE membership.user_id**. Why: S-19 “the clan” and S-23 points need a single home; multi-clan would leave ranking/attribution unspecified.
- **q3-owner** — How to encode owner-as-first-member without officers? Chose **A / clans.owner_id + trigger-seated membership, no role enum**. Why: copies `seat_organizer_on_run_insert`; a role enum in F-02 is the officer footgun the roadmap forbids.
- **q4-columns** — Which clan columns in F-02 vs S-18? Chose **A / name + tag + points default 0; defer picture**. Why: guest directory/details need human-readable rows; picture is S-18 upload blast radius.
- **q5-uniqueness** — Tag/name uniqueness? Chose **A / case-insensitive unique tag; name required not unique**. Why: tags are the clash surface; matches `player_labels` `lower(name)` unique-index pattern.
- **q7-membership-select** — How open is guest SELECT on membership? Chose **A / world-readable (USING true)**. Why: FR-017 requires members on clan details; UUID roster cannot leak restricted runs.
- **q8-write-surface** — What writes in F-02? Chose **A / member INSERT on clans only; freeze points; no client membership writes; admin DELETE cascade OK**. Why: smallest write surface; S-18/S-19/S-23 own later mutations; leave-without-transfer would break owner-as-first-member.
- **f1-on-conflict** — Plan-review F1: seating `ON CONFLICT DO NOTHING` lets a second clan commit. Chose **⭐ drop ON CONFLICT so membership PK aborts the outer INSERT**. Why: run-domain `ON CONFLICT` is per-(run,user); F-02 PK is global `user_id`. Skipped optional `UNIQUE(owner_id)` — membership PK already encodes one clan per player.

### Non-obvious
- **intent-from-roadmap** — New folder had no freeform intent. Chose **seed Notes from F-02 roadmap outcome** instead of only humanizing the slug. Why: change-id is the roadmap Change ID; empty-intent humanize would drop FR-014/FR-028 scope and the explicit S-21…S-23 cut.
- **skip-research** — Whether to hire `/10x-research` before plan. Chose **skip**. Why: YOLO default when the research signal is weak; `/10x-plan` can ground in archived `run-domain-schema` + existing RLS without a separate map stage.
- **parent-link** — change-id is a roadmap Change ID (`F-02`). Chose **1:1 link existing F-02 card**, no `--parent`. Why: gh-change-sync hybrid rule; ignore parent for 1:1.
- **q1-complexity** — Plan complexity. Chose **A / MEDIUM (7–10 questions)**. Why: two tables + guest/member/admin RLS + owner-as-first-member + leak constraint; HIGH would reopen S-21; LOW would skip uniqueness/cardinality that is expensive to undo.
- **q6-insert-path** — How does a verified member insert a clan? Chose **A / direct INSERT on clans under RLS; trigger seats membership**. Why: public-run create pattern; invite-only RPC existed only because it wrote child rows the trigger could not.
- **q9-helpers** — New DEFINER helpers now? Chose **A / no new helpers; only the seating trigger is DEFINER**. Why: unused `is_clan_owner()` is over-modeling; verified gate already inlines `public_profiles.is_verified` on friends.

### Obvious
- Default next step `/10x-plan` (no bug/frame signal).
- Title from F-02: "Clan-domain schema and RLS contract".

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 SQL review (1.3/1.4): self-reviewed by implement specialist (YOLO; not a UI gate). Residual: Phase 2 `db reset` is the apply proof.
- Phase 2 RLS smoke (2.5/2.6): executed by specialist via local psql JWT impersonation + `\d`/pg_trigger (YOLO; not skipped). Residual: Studio UI click-through not used.

## Stop / escape hatches

- none

## GitHub

- change-sync: pending `--event new`
