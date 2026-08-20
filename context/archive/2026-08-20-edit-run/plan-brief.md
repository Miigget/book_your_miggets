# Edit an active run — Plan Brief

> Full plan: `context/changes/edit-run/plan.md`

## What & Why

Organizers need to fix an active run they created (title, time, map, min points, capacity, join mode) so the public list and detail stay accurate (FR-021 / US-06 / S-13). Archived runs stay immutable. Join-mode and capacity edits must not desync the S-02/S-05 pending/confirmed machine.

## Starting Point

Create writes the run row; list/detail/dashboard only read it. RLS `runs_update_own` already allows organizer UPDATE with **no** active-window or field lock. Insert auto-seats the organizer as confirmed, so “lock after first confirmation” would freeze join mode at create. No `/edit` page, no app `.update()` on `runs`.

## Desired End State

The owner of an upcoming or in-progress run opens Edit from detail or the dashboard, saves allowed fields on `/runs/{id}/edit`, and guests see the new values. Non-owners, admins-as-editors, and archived (including owner) get the same 404 as a missing run. Capacity cannot fall below the confirmed roster; join mode freezes after any non-organizer apply.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Complexity | MEDIUM | New UPDATE surface on known create/participant patterns | Plan |
| Join-mode lock | After any non-organizer participant row | Organizer seat is not a player apply; pending leftover on an auto_join flip is the desync | Plan |
| `starts_at` | Result must stay active | US-06 includes grace; no self-archive via the clock | Plan |
| Capacity vs pending | Floor = confirmed count only | Matches S-02 soft overfill; no application migration | Plan |
| UX | `/runs/[id]/edit` + Edit on detail and dashboard | Create-page shell; guests never see the form | Plan |
| RLS | Active-window policy + column grants + trigger | Closes archived PATCH and field-lock bypass | Plan |
| Edit ACL | Sign-in guests; 404 everyone else including archived owner | Do not advertise; admin keeps delete | Plan |
| Other fields | Title, map (incl. clear), min_points always editable while active | Apply does not enforce min_points; no roster migration | Plan |
| Locked join UI | Disabled select + helper; server ignores POST | Same layout as create; trigger is backstop | Plan |
| HTTP | POST `/api/runs/[id]` via `[id]/index.ts` | Repo is POST-only; `[id]/` directory already exists | Plan |

## Scope

**In scope:** Active-window UPDATE RLS; join-mode/capacity trigger; `updateRun` + POST; edit page; Edit links; AGENTS protected-route note.

**Out of scope:** S-14 category, S-15 visibility, admin edit, auto-deny pending, organizer delete, notifications, min_points on apply, Vitest, PATCH, `returnTo` on sign-in.

## Architecture / Approach

Form POST (cookie SSR) → `updateRun` validates and patches allowed columns → RLS requires organizer + not banned + still in the 1h window on old and new row → trigger stamps `updated_at` and rejects join_mode flips / capacity under confirmed. Service maps RLS no-ops and trigger tokens to `RunError`; `?error=` never gets raw DB text. Do not call `is_run_in_active_window` from a policy on `runs`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. UPDATE RLS + trigger | Active-window policy, column grants, invariant trigger | RLS no-op looks like success if the app skips a row check |
| 2. Service + POST | `RunError`, `updateRun`, `/api/runs/[id]` | Echoing PostgREST; using public `getActiveRunById` as an owner gate |
| 3. Page + links | `/runs/[id]/edit`, form reuse, middleware, Edit CTAs | Prefix-protecting `/runs` and leaking the form to non-owners |

**Prerequisites:** S-01 shipped. Local Supabase for `db reset` + `db:types`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- HTML `disabled` join-mode select is omitted from POST; server ignore + trigger cover crafted requests.
- Two-tab last-write-wins is accepted (one organizer).
- `runs_update_admin` stays unused; column grants also stop authenticated PATCH of `archived_at` / `organizer_id`.
- YOLO will skip in-browser Progress rows unless a human is present; SQL smokes in Phase 1 still matter.

## Success Criteria (Summary)

- Organizer edits an active run they created; public list and detail show the new values.
- Archived and non-owner `/edit` 404; guests sign in.
- Join mode locks after someone else applies; capacity cannot drop below confirmed.
