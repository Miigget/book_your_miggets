---
change_id: clan-runs
title: Let clan owners create clan-only runs
status: archived
created: 2026-08-31
updated: 2026-08-31
archived_at: 2026-08-31T13:33:03Z
---

## Notes

S-21 clan runs: clan **owner** (not officers — role does not exist) can create a clan-only run on the existing visibility axis; audience is live current clan members; guests/non-members never see it as public; friends-only / invite-only still do not leak (FR-020, FR-028). Also fix Dashboard `"Could not load your runs."` after archived friends-only / invite-only (RLS 42P17 on `run_participants_select_organizer`, not catch-only). Out of slice: S-22 complete, S-23 points, officers UI, `runs.clan_id`, invite-only snapshot for clan. Plan: `context/changes/clan-runs/plan.md`.
