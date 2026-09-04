---
change_id: multi-map-runs
title: Attach multiple maps to one run for a single session
status: archived
created: 2026-09-04
updated: 2026-09-04
archived_at: 2026-09-04T14:10:11Z
---

## Notes

Organizer can attach multiple maps to one run for a single session; the active list and detail show that set. Roadmap S-27 / FR-009 (prd-v2). Keep independent of S-28 map poll. Category-only runs still need a coherent card when some maps are unset. Plan refined 2026-09-04 after plan-review REVISE: F1 `run_is_public` SELECT, F2 setter NULL skip, F3 create insert in `src/pages/api/runs/index.ts`. Second plan-review 2026-09-04: SOUND (F1–F3 confirmed in phases/SC). Full-plan impl-review 2026-09-04: APPROVED (0 findings). Progress 3.10 remains YOLO residual (Verify/Complete unchanged).
