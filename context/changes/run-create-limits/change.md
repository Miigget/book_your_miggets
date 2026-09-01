---
change_id: run-create-limits
title: Capacity 64 and schedule bounds
status: implementing
created: 2026-09-01
updated: 2026-09-01
archived_at: null
---

## Notes

S-25 from context/foundation/roadmap.md — organizer can set capacity (default 64, maximum 64) and cannot schedule a run in the past or more than 1 year ahead. PRD refs: FR-006, FR-007, US-01. Prerequisites: shipped run create/edit. Form-level guards only; keep them off the Advanced dump so the 1-minute create guardrail still holds. 5-active lives in S-24 (already shipped) — do not re-do the 5-cap.
