---
change_id: clan-domain-schema
title: Clan-domain schema and RLS contract
status: implementing
created: 2026-08-27
updated: 2026-08-27
archived_at: null
---

## Notes

Foundation F-02: smallest clan tables (clan, membership with owner as the first member, points defaulting to 0) plus per-role RLS so a verified member can insert a clan, a guest can read the public directory/details, and friends-only / invite-only runs still cannot leak through clan rows. Do not pre-build clan runs, officers, or points rules — those stay in S-21…S-23. Roadmap outcome from context/foundation/roadmap.md F-02 / Change ID clan-domain-schema. PRD refs: Access Control Changes, FR-014, FR-028.
