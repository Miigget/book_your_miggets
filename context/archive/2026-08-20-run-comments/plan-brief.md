# Run comments and likes — Plan Brief

> Full plan: `context/changes/run-comments/plan.md`

## What & Why

Confirmed participants need an in-app thread on the run they were accepted to (FR-020 / US-05 / S-12), including likes. This replaces parked Discord-bot comment sync. Reading is tighter than the PRD guest-on-public-run default: confirmed roster, admins, and unseated organizers only, so a public `/runs/[id]` cannot leak team chat to guests.

## Starting Point

Run detail is public Astro SSR plus form-POST islands for apply/approve and admin delete-run. `run_participants.status = 'confirmed'` is the roster; `runs.organizer_id` can exist without a seat (`leaveTeamAsOrganizer`). Helpers `is_confirmed_participant`, `is_admin`, `is_not_banned` already exist. No comment tables or APIs.

## Desired End State

On an active run, a confirmed participant sees Comments, posts plain text (max 1000 chars), and toggles a like (count + filled/empty). Guests and pending/denied applicants do not see the section. After archive the thread remains for the same readers; compose and like stop. Authors cannot edit/delete; admins can hard-delete a comment.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Read ACL | Confirmed + admin + unseated organizer SELECT | Owner seed rejected guest read; organizer already moderates the run | Plan |
| Post / like | Confirmed + active window only | S-12 spam rule; same gate as apply/leave | Plan |
| Archived | Read yes; write no | History/debrief without a forever write path | Plan |
| Author mutate | Append-only | No UPDATE RLS or edited-at in v1 | Plan |
| Admin | Hard-delete comment, cascade likes | Ban is not enough; deleting the run is too blunt | Plan |
| Likes UI | Count + my toggle; no liker list | Ban-style `value` true/false; extra roster UI is out of S-12 | Plan |
| Body | Plain text, trim, 1–1000, pre-wrap | No markdown XSS surface in this stack | Plan |
| Thread | Flat `created_at` asc | Not a forum; no `parent_id` | Plan |
| Author left | Keep rows; freeze writes | Leave-team must not erase coordination notes | Plan |
| Phases | Schema → API → island | Matches apply-and-approve | Plan |
| Error query param | `?commentError=` for comment/like/admin-comment-delete | Avoids duplicate banners with apply `?error=` on the same page | Plan review F2 |

## Scope

**In scope:** Tables + RLS; list/post/like/admin-delete; comments island on `/runs/[id]`; like counts.

**Out of scope:** Guest read; author edit/delete; threading; markdown; liker lists; pagination; Discord sync; non-participant comments; JSON/realtime; Vitest.

## Architecture / Approach

Cookie SSR + form POST (no `fetch`). RLS is the authority: no `anon` grants; writes use `is_confirmed_participant` + `is_run_in_active_window`; organizer read via new `is_run_organizer` definer helper (do not inline `run_participants` — RLS cycle). Likes denormalize `run_id` for policies. Page omits the section when `canRead` is false. `CommentError` + `?commentError=` for comment/like/admin-comment-delete; apply/leave/decide and admin delete-run keep `?error=` (`lessons.md`). `comments.ts` duplicates the active-window query via `activeWindowStartsAfter()` — do not import private `loadActiveRunForMutation`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema and RLS | Tables, CHECKs, helpers, authenticated-only policies, `db:types` | Recursion if policies query `run_participants` inline |
| 2. Service and API | `comments.ts`; POST create/like; admin delete | Zero-row RLS vs thrown errors; idempotent like unique |
| 3. Run page comments UI | SSR gate + `RunComments` island | Public page leaking a teaser; archived `own` not loaded |

**Prerequisites:** S-02 shipped. Local Supabase for `db reset` + `npm run db:types`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Unseated organizer SELECT is a deliberate widening of the owner’s “participants + admins” seed so the person who still runs accept/deny can read the thread.
- Confirmed non-organizers still cannot leave the team; only organizer leave-team is tested for “author left, comments remain.”
- Banned-POST middleware still appends `?error=` (“Your account is banned”) and shows on `RunParticipantActions`, not the comments island.

## Success Criteria (Summary)

- Confirmed players comment and like on active runs; guests never see the section.
- Admins and unseated organizers can read; only admins can delete a comment.
- Archived threads remain readable and become write-locked.
