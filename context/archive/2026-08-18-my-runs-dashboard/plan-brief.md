# My-runs dashboard — Plan Brief

> Full plan: `context/changes/my-runs-dashboard/plan.md`

## What & Why

Organizer can view all runs they created in one place (FR-005 / S-08). Today `/dashboard` is an auth stub; accept/deny live on `/runs/{id}`; `/runs/history` is confirmed-participant archive only — an organizer who left the team disappears from history while still owning the run.

## Starting Point

RLS `runs_select_own_organizer` already SELECTs every owned run (including archived). App lists do not filter by `organizer_id`. Archived `/runs/{id}` 404s without a confirmed seat (or admin). Topbar already links Dashboard; middleware already gates `/dashboard`.

## Desired End State

Signed-in organizer opens `/dashboard` and sees Active (soonest-first) then Past (newest-first) created runs, with pending counts on active approval-required cards. Cards open `/runs/{id}`. Unseated organizers can still reopen archived created runs; back link is Dashboard. Guests still sign-in-redirect. Inbox, edit, and cancel stay out.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Manage | View + deep-link to `/runs/{id}` | FR-005 is view; accept/deny already on detail | Plan |
| Inventory | Two sections: Active then Past | All created runs; keep S-01/S-07 sort conventions | Plan |
| Pending | Per-card count on active approval-required | Bounded signal, not a cross-run inbox | Plan |
| Archived detail | `getArchivedRunForOrganizer` after participant, before admin | Leave-team must not 404 Past cards | Plan |
| Empty UX | One hero if zero created; else both headings + compact empty line | Discoverable Dashboard + Create CTA | Plan |
| Route | Fill `/dashboard` (already protected) | Reserved by S-07; no new path | S-07 / Plan |
| Filters / pager | None | Same as S-07; MVP organizer volume | Plan |
| RLS / migration | None | Organizer SELECT already exists | Plan |

## Scope

**In scope:** `listRunsForOrganizer`; replace `/dashboard` stub; pending counts on active approval-required cards; `getArchivedRunForOrganizer` + `[id].astro` wiring + Dashboard back link

**Out of scope:** Inbox, edit/cancel/delete, pagination/filters, new migration, `/runs/history` reuse, hiding Dashboard until first create, Vitest

## Architecture / Approach

```text
GET /dashboard            [middleware: auth]
  → listRunsForOrganizer(supabase, user.id)  // .eq organizer_id
  → Active (soonest) + Past (newest) cards → /runs/{id}

GET /runs/{id}
  → getActiveRunById
  → else getArchivedRunForParticipant (confirmed seat)
  → else getArchivedRunForOrganizer (organizer_id === viewer)
  → else getArchivedRunForAdmin if isAdmin
  → else 404
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. List service | `listRunsForOrganizer` + pending counts | Filtering by membership instead of `organizer_id` |
| 2. Dashboard UI | `/dashboard` two-section list | Copying `err.message` into the body; empty-state branching |
| 3. Archived detail | Owner opens unseated archived `/runs/{id}` | Ungated by-id loader leaking via admin RLS |

**Prerequisites:** S-01 (+ S-02/S-04/S-07 patterns); no new schema
**Estimated effort:** ~1–2 sessions across 3 phases

## Open Risks & Assumptions

- Phase 2 Past cards 404 for leave-team organizers until Phase 3
- `getArchivedRunForOrganizer` must check `organizer_id === userId` (admin RLS)
- Seated organizer on an archived run still gets History back link (participant loader wins)
- YOLO may skip manual Progress rows; residual risk is the 404 matrix and empty-state branches

## Success Criteria (Summary)

- Organizer sees all runs they created on `/dashboard` (active + past)
- Pending count appears on active approval-required cards; actions stay on `/runs/{id}`
- Unseated organizer can reopen archived created runs; non-owners still 404
