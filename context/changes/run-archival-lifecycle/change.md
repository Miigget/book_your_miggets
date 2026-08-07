---
change_id: run-archival-lifecycle
title: Run archival lifecycle
status: implementing
created: 2026-08-07
updated: 2026-08-07
archived_at: null
---

## Notes

S-07 / S-09 handoff (derived MVP — no `archived_at` stamp in S-04):

- **Archived predicate:** `archived_at IS NOT NULL OR starts_at + interval '1 hour' <= now()`
- **Active (guest list):** `archived_at IS NULL AND starts_at > now() - interval '1 hour'`
- Do not open guest SELECT of archived rows here; confirmed-participant SELECT on archived runs remains S-07
- Admin already SELECT-all; S-09 is profile-scoped UX
- Guest active list stays time-window only (app services + `runs_select_active_*` RLS)
