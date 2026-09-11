# Owner deletes a run (S-30) — Plan Brief

> Full plan: `context/changes/owner-delete-run/plan.md`

## What & Why

FR-012: the run owner can hard-delete the run (was admin-only). US-01 treats delete as a session tool alongside archive. Delete is not archive (S-24); restricting the owner to audience-active runs keeps shipped S-07 participant history intact.

## Starting Point

Admin delete already hard-deletes via cookie-client `.from("runs").delete()` and `runs_delete_admin`. Organizers have Archive/Complete/Extend on run detail when the run is not archived; they cannot DELETE at RLS. Child tables already cascade.

## Desired End State

The organizer of an upcoming, in-progress, or completed run can confirm Delete on run detail, land on `/runs` with “Run deleted,” and the row (plus participants/comments/maps/invites/poll) is gone. Archived runs stay for participant Recent. Admin delete is unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Who is owner | `runs.organizer_id` only | Not clan owner, not officers | Crew |
| Route | `POST /api/runs/{id}/delete` | Organizer mutation; admin path stays | Crew |
| Mechanism | New organizer DELETE RLS + same PostgREST delete; no RPC | GRANT DELETE exists; only policy was admin | Crew / Plan |
| After Complete | Delete still allowed | Freeze is join/leave/decide/kick/withdraw/edit/extend only | Crew |
| When | Audience-active only (not archived / elapsed extend) | Archive keeps S-07 history; matches organizer chrome | Plan (q-when B) |
| UI | `OrganizerRunLifecycleControls` destructive + confirm | One surface next to Archive; no Dashboard cards | Plan (q-ui A) |
| Success URL | `/runs?notice=Run deleted` | Reuses existing Banner; Dashboard has no notice | Plan (q-redirect A) |

## Scope

**In scope:** `runs_delete_organizer` policy; `deleteRunAsOrganizer`; organizer POST route; Delete on organizer chrome; `AGENTS.md` freeze/delete note

**Out of scope:** Admin route/UI changes; officer/clan-owner delete; Dashboard delete; archived owner-delete; RPC; Storage screenshot cleanup; test runner

## Architecture / Approach

RLS-first: add `runs_delete_organizer` using `organizer_id`, `is_not_banned()`, and `is_run_active_row` (not `is_run_roster_open_row`, so Complete does not freeze delete). App checks owner + `isRunActive`, then the same `.delete().select("id")` as admin. Native form POST + `window.confirm`. Parent page already omits organizer chrome when `lifecyclePhase === "archived"`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Organizer hard-delete | Policy + API + Delete button + AGENTS.md | Using `is_run_roster_open_row` would block delete after Complete |

**Prerequisites:** Shipped admin delete (S-06); local Supabase.
**Estimated effort:** One short session, single phase.

## Open Risks & Assumptions

- Comment-screenshot Storage objects are not removed on run DELETE (same as admin); leftover keys may remain in `comment-screenshots`.
- Elapsed extend without `archived_at` is already `lifecyclePhase === "archived"` in the UI, so Delete is hidden; RLS matches.
- YOLO skips per-phase impl-review; residual: SQL smoke must prove archived organizer DELETE is 0 rows.

## Success Criteria (Summary)

- Organizer can permanently delete an audience-active run they own (including completed) and see “Run deleted” on `/runs`.
- Archived participant history is not erased by this control; deleted active runs do not leave dead Recent links.
- Admin delete and non-owner access are unchanged.
