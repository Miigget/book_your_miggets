---
change_id: clan-runs
mode: YOLO
started: 2026-08-31
updated: 2026-08-31
status: in-progress
---

# Crew decisions — clan-runs

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-08-31 | 10x-new | created change.md (status new) |
| 2026-08-31 | 10x-research | research.md; change.md → preparing |
| 2026-08-31 | 10x-plan | plan.md + plan-brief.md; status planned |
| 2026-08-31 | 10x-plan-review | SOUND; F1 LOW accepted; status plan_reviewed |
| 2026-08-31 | 10x-implement p1 | enum+RLS+42P17; 1.1–1.7 [x]; 1.8 skipped YOLO |

## Decisions the Crew Lead made (no human)

### Critical
- **scope-dashboard-bug** — Include the Dashboard "Could not load your runs" regression (archived friends-only / invite-only) in this S-21 change? Chose **yes, in-scope**. Why: user asked in the same invocation; dashboard is the organizer hub clan runs will use; the restricted-run SELECT path is the same leak/load surface FR-028 already cares about.
- **plan-clan-id** — Store `runs.clan_id` now? Chose **A: no clan_id; live `is_same_clan(organizer_id, uid)`**. Why: membership is live like friends-only; one clan per player; leave/transfer do not exist; S-23 can add a FK later without freezing the roster.

### Non-obvious
- **research-first** — Hire `/10x-research` before plan? Chose **yes**. Why: new visibility axis plus a dashboard load failure needs a map of run create, RLS/SELECT, invites, and clan membership before S-21 can be planned without guessing.
- **plan-complexity** — Complexity? Chose **B: MEDIUM**. Why: one established S-15 pattern across several layers (enum, DEFINER helper, owner gate, partition, 42P17); not a new access-control architecture.
- **plan-runs-section** — `/runs` presentation of `clan_only`? Chose **A: dedicated Clan section**. Why: never mix non-public into Public; members need a catalog; Friends-bucket would lie.
- **plan-clan-only-picker** — When to show `clan_only` on create? Chose **A: hide unless viewer owns a clan**. Why: no dead option; API/RLS still reject non-owners.
- **plan-error-copy** — Create/edit error strings for `clan_only`? Chose **A: extend unverified copy + dedicated not-owner string**. Why: unverified vs not-owner are different gates; never reuse “verify” for a verified non-owner.
- **plan-edit-visibility** — Edit path for `clan_only`? Chose **A: first-class `updateRun` value like friends_only**. Why: no new RPC; invite_only stays on its snapshot RPC; RLS WITH CHECK is authz.
- **plan-verify-rls** — How to prove dashboard + leak? Chose **A: local SQL smoke + lint/build + manual UI checklist**. Why: only SQL smoke can distinguish a real 42P17 fix from a catch-only paper-over; no Vitest in this slice.

### Obvious (optional, keep short)
- change-id `clan-runs` is roadmap S-21 → gh-change-sync 1:1 link, no `--parent`.
- Officers appointment UI stays out unless the role already exists.
- plan-review F1 (LOW): Phase 1 widens `CreateRunFormVisibility` with `"clan_only"` (type only); option/VISIBILITIES wait for Phase 2.
- Three-phase structure from planner accepted (enum/RLS → form/API → Clan section).

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1.8 Dashboard Incoming/Past UI: skipped (YOLO residual risk). SQL smoke as authenticated organizer succeeded (SQLSTATE 00000); rendered dashboard catch copy was not click-tested.

## Stop / escape hatches

- none

## GitHub

- change-sync: #85 events new, planned, plan_reviewed (link-roadmap S-21 → Backlog)
