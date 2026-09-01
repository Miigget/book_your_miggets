---
change_id: team-size-scope
mode: YOLO
started: 2026-09-01
updated: 2026-09-01
status: complete
---

# Crew decisions — team-size-scope

Mode: **YOLO**. Crew Lead answered specialist questions; the human was asked only when the mode requires it.

## Timeline

| When | Stage | What |
|------|-------|------|
| 2026-09-01T15:29Z | 10x-new | created change.md (title: Team-size bands under Advanced settings) |
| 2026-09-01T15:30Z | gh-change-sync | #90 new → Backlog (link-roadmap S-26) |
| 2026-09-01T15:35Z | 10x-research | research.md; change.md status preparing |
| 2026-09-01T15:45Z | 10x-plan | round-1 — complexity A, unset A, freeze A, rpc A |
| 2026-09-01T15:50Z | 10x-plan | round-2 — accept A, labels A, cta A |
| 2026-09-01T15:55Z | 10x-plan | plan.md + plan-brief.md; status planned |
| 2026-09-01T16:05Z | 10x-plan-review | REVISE — F1 MEDIUM, F2/F3 LOW; hire re-plan |
| 2026-09-01T16:15Z | 10x-plan | refined plan — F1/F2/F3 ⭐ applied |
| 2026-09-01T16:20Z | 10x-plan-review | SOUND (plan-review-2.md) |
| 2026-09-01T16:40Z | 10x-implement p1 | schema/RPC/grants; commit 7d31915 |
| 2026-09-01T16:50Z | 10x-impl-review p1 | APPROVED (0 findings) |
| 2026-09-01T17:05Z | 10x-implement p2 | apply overlay + APIs; commit c7f2d21 |
| 2026-09-01T17:15Z | 10x-impl-review p2 | APPROVED (0 findings) |
| 2026-09-01T17:30Z | 10x-implement p3 | Advanced UI + CTA + AGENTS; commit dce78d4 |
| 2026-09-01T17:40Z | 10x-impl-review p3 | APPROVED (0 findings) |
| 2026-09-01T17:50Z | 10x-impl-review | full APPROVED; change.md impl_reviewed |
| 2026-09-01T17:55Z | 10x-archive | YOLO archive despite open Manual Progress rows |

## Decisions the Crew Lead made (no human)

### Critical
- **q-unset** — How to store “no team-size band”. Chose **A: NULL = unset**. Why: existing runs need a no-op backfill; empty Advanced field omits the write; CHECK (NULL OR 1 ≤ min ≤ max).
- **q-freeze** — Freeze the min-band after first outsider apply? Chose **A: freeze with join_mode (any non-organizer row)**. Why: same desync class as flipping join_mode with leftover pending; reuse the existing lock trigger rather than a second floor rule.
- **q-accept** — Accept when a band is set. Chose **A: keep S-02 soft overfill**. Why: roadmap double-confirm is the auto-join last-slot race (already covered by band_full + FOR UPDATE); hardening Accept is a new locked writer and out of S-26.
- **archive-manuals** — Archive while Manual Progress rows remain. Chose **archive (YOLO auto-archive)**. Why: automated 1.1–1.3 / 2.1–2.2 / 3.1–3.3 passed; three phase reviews + full impl-review APPROVED; manuals are human-action gates already logged as residual risk.

### Non-obvious
- **intent-seed** — Empty user intent with a roadmap Change ID. Chose **seed Notes from S-26 outcome** (prd-v2 FR-005/025/026) rather than humanizing the slug alone. Why: slug maps 1:1 to roadmap; inventing a different product sentence would drift from the locked slice.
- **research-vs-plan** — Whether to map the codebase before planning. Chose **hire /10x-research**. Why: bands must sit on existing join_mode, auto_join_run, apply/accept, create/edit, and Advanced settings — unknown surface across several modules; skipping would make plan invent the join path.
- **q-complexity** — Plan complexity. Chose **A: MEDIUM**. Why: schema+GRANT+RPC+form+invite on known seams; HIGH would pad settled PRD/research; LOW would skip freeze/RPC/unset.
- **q-rpc** — How auto_join_run signals band-full ≠ max-full. Chose **A: new outcome `band_full`**. Why: keep FOR UPDATE; apply falls through to pending; overloading `full` or an unlocked pre-count reintroduces a false full-stop.
- **q-labels** — Detail/card copy for a hybrid band. Chose **A: keep formatJoinMode(join_mode) + a team-size line when min is set**. Why: overlay, not a third mode; default-form select stays two-valued.
- **q-cta** — Join CTA when a band is set. Chose **A: Join while under the band; Apply after; full only at max**. Why: CTA matches the fill rule; band-full must not reuse the max-full disable.
- **f1-overlay-apply** — Plan-review F1 (MEDIUM). Chose **⭐ Fix: replace applyToRun’s confirmed-only post-check**. Why: `autoJoinRun` is void; the confirmed require lives in applyToRun after RPC; wrapping only the helper would never pending-insert on `band_full`.
- **f2-invite-drop** — Plan-review F2 (LOW). Chose **⭐ Fix: copy live RPC bodies + re-GRANT EXECUTE**. Why: DROP loses grants; create live body is `20260831131219` (5-cap), not the earlier setter-era copy; keep `updated_at` on the freeze trigger.
- **f3-rpc-stub** — Plan-review F3 (LOW). Chose **⭐ Fix: `auto_join_min: null` in `runRowFromPublicRpc`**. Why: RunRow gains a required field; public Incoming RPC does not return the column.

### Obvious (optional, keep short)
- change-id `team-size-scope` = roadmap S-26 → gh-change-sync 1:1, no `--parent`.

## Decisions escalated to the human

- none (YOLO)

## Human-action gates

- Phase 1 SQL last-slot / GRANT / invite EXECUTE (1.4–1.7): skipped (YOLO residual risk)
- Phase 2 apply/API click-through (2.3–2.7): skipped (YOLO residual risk)
- Phase 3 UI/visual (3.4–3.8): skipped (YOLO residual risk)

## Stop / escape hatches

- none

## GitHub

- change-sync: #90 events new, planned, plan_reviewed, implementing, implemented, archived (link-roadmap S-26)
