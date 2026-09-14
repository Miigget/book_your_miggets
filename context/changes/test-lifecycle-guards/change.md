---
change_id: test-lifecycle-guards
title: Install Vitest and prove archived or expired-extend is not audience-active
status: impl_reviewed
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Critical-path coverage".
Risks covered: #1 (archived / expired-extend run still counts as audience-active: 5-cap, join, active list).
Test types planned: unit + CI gate (`npm test`).
Risk response intent: Prove that archived_at set, or extended_until in the past, means the run is not audience-active — it does not consume the 5-cap, join is rejected, it is absent from the active list. Edge: extended_until still in the future stays active. Challenge: "listed on /runs" is not the same as audience-active. Oracle from PRD / AGENTS.md, not from current return values. Avoid implementation-mirroring the helper.
After creating the folder, follow the downstream continuation rule (/10x-research next).
