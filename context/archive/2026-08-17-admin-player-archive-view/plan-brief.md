# Admin player archive view — Plan Brief

> Full plan: `context/changes/admin-player-archive-view/plan.md`

## What & Why

Admins need to open a player's profile and see that player's confirmed archived runs (FR-016 / S-09). S-07 already built participant history but 404s anyone without a current confirmed seat — including admins who are moderating someone else's past runs.

## Starting Point

`listArchivedRunsForParticipant(supabase, userId)` already filters confirmed ids then archived; admin RLS can read another player's rows. `/runs/[id]` does not call an admin bypass. There is no profile URL; `/admin` nicknames are plain text. `/admin` middleware prefix already 404s non-admins.

## Desired End State

Admin clicks a nickname on `/admin`, sees `/admin/users/{id}` (nickname, id, that player's archive), and reopens `/runs/{id}` read-only even without a seat. Members/guests still 404. Ban/verify stay on the users table.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Profile access | Admin-only `/admin/users/{id}` | Inherits S-06 404 prefix; no public social profile | Plan |
| Entry | Nickname link on `/admin` only | Discoverable without roster links that 404 for members | Plan |
| Archived detail | Same `/runs/{id}`, admin bypass after participant loader | Canonical URL; FR-016 is useless if cards 404 | Plan |
| History membership | S-07 confirmed + archived for the **target** player | “Full” = all of their confirmed archives, not pending/denied or S-08 | Plan |
| Missing vs empty | 404 if no profile/invalid UUID; empty copy if profile exists | Matches run-detail 404 vs `/runs/history` empty | Plan |
| Banned player | Profile + archive still shown | Moderation needs past runs after a ban | Plan |
| Profile chrome | Nickname + id + list only | No duplicate S-06 ban/verify | Plan |
| Delete on bypass | Keep `AdminRunControls` if page loaded | FR-010 is not active-only | Plan |
| Filters / pager | None; `starts_at` DESC | Same as S-07; one player's list | Plan |
| RLS / migration | None | Admin SELECT already exists | Plan |

## Scope

**In scope:** `getProfileForAdmin`; `/admin/users/{id}`; `/admin` nickname links; `getArchivedRunForAdmin` + `[id].astro` admin third attempt; README/AGENTS.md one-liners

**Out of scope:** Public profiles, roster links, S-08, pending/denied, new RLS, filters, ban/verify on the profile, changing member `/runs/history`

## Architecture / Approach

```text
GET /admin/users/{id}     [middleware: auth + isAdmin]
  → getProfileForAdmin (404 if missing)
  → listArchivedRunsForParticipant(supabase, playerId)
  → cards → /runs/{id}

GET /runs/{id}
  → getActiveRunById
  → else getArchivedRunForParticipant (confirmed seat)
  → else getArchivedRunForAdmin if isAdmin
  → else 404
  → archived: no mutations; AdminRunControls if isAdmin
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Profile + list | `/admin/users/{id}` + nickname links | Calling the list helper from a non-admin surface; confusing empty vs 404 |
| 2. Detail bypass | Admin opens archived `/runs/{id}` without a seat | Ungated admin loader leaking archived detail to organizers (S-08) |

**Prerequisites:** S-04 + S-06 + S-07 shipped; SQL-promoted admin account for verification
**Estimated effort:** ~1–2 sessions across 2 phases

## Open Risks & Assumptions

- `getArchivedRunForAdmin` must be called only when `isAdmin`; organizer RLS would otherwise return created archived runs
- Phase 1 card clicks 404 until Phase 2
- YOLO may skip manual Progress rows; residual risk is the 404 matrix (guest/member vs admin) and back-link split

## Success Criteria (Summary)

- Admin can open any player's profile from `/admin` and see that player's confirmed archived runs
- Admin can reopen those runs at `/runs/{id}` without having played; guests/members still 404
- Ban/verify and member history are unchanged
