---
change_id: verified-finish-clan-points
title: Let admins mark verified-finish and award clan points
status: impl_reviewed
created: 2026-09-01
updated: 2026-09-01
archived_at: null
---

## Notes

S-23 from context/foundation/roadmap.md. Admin can mark a completed clan run as verified-finish after checking in-game /teamrank that declared participants finished; only then are clan points (from map points) added and the public ranking updated. PRD refs FR-019, FR-022, FR-023, FR-018, FR-030, US-02. Prerequisites: S-22 complete-clan-run (archived 2026-09-01), S-20 comment-screenshots, shipped admin role. Out of slice: scraping /teamrank (parked — admin still checks in-game by hand). Ranking from S-18 stays honest zeros until this lands. Do not invent officer UI. Do not award points on Complete (S-22 already froze that). Risk from roadmap: last mile of US-02; this slice is a manual admin mark plus the screenshot thread from S-20, not a game client.
