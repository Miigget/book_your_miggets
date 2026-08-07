# Run archival lifecycle — Plan Brief

> Full plan: `context/changes/run-archival-lifecycle/plan.md`
> Research: `context/changes/run-archival-lifecycle/research.md`

## What & Why

FR-013 / S-04: keep runs on the active list for 1 hour after `starts_at`, mark them in-progress during that grace, then remove them from the guest/member active list while retaining the row forever (not deleting). Past-start runs currently clutter `/runs` forever because nothing derives phase or filters by time.

## Starting Point

Schema already has `starts_at` and nullable `archived_at`; “active” everywhere means `archived_at IS NULL` only. List/detail/mutations never time-filter; no phase DTO or badge. Infra soft-prefers derived-at-read over Cron for MVP.

## Desired End State

Guests see upcoming + in-progress runs only. During grace, list/detail show an in-progress label; after grace the run disappears from `/runs` and guest detail 404s. Apply/approve/leave/withdraw remain open during grace and fail after. S-07/S-09 get a documented time-based archived predicate without a stamped column yet.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Archival strategy | Derived-at-read (no stamp) | Matches infra MVP preference; avoids custom Worker cron entry | Research + Plan |
| Filter surface | App + RLS time window | Closes PostgREST bypass while organizer/admin policies still need app gates | Plan |
| Stamp / cron | Out of scope | Lazy stamp fails guest RLS; cron needs custom Astro entry — defer | Research + Plan |
| Grace mutations | Fully open (incl. withdraw) | Run is still active during grace per FR-013; withdraw shares the active gate | Plan + plan-review |
| Post-grace guest URL | 404 | Matches S-01; archive history is S-07 | Research + Plan |
| List copy | Update list subtitle “upcoming” | Empty state already says “active”; only subtitle is upcoming-only | Plan + plan-review |

## Scope

**In scope:** lifecycle helpers; active list/detail/mutation time filters; phase on DTOs; RLS active-window policies; in-progress UI + copy; foundation doc lock-in; S-07 predicate note

**Out of scope:** writing `archived_at`; Cloudflare/pg_cron; archive history UIs (S-07/S-09); soft-disable joins in grace; DB status enum; dashboard history

## Architecture / Approach

Pure derivation from `starts_at` (+ non-null `archived_at` short-circuit). Service layer (`runs.ts` + `loadActiveRunForMutation`) is the choke point; RLS `runs_select_active_*` mirrors `archived_at IS NULL AND starts_at > now() - 1 hour`. Organizer/admin SELECT unchanged — app filters still required for those roles on active UX.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Helpers + service contract | Grace/phase helpers; active queries + mutation gate | Organizer RLS bypass if app filter omitted |
| 2. RLS active window | Guest/auth SELECT matches FR-013 window | Policy drift vs app predicate |
| 3. UX + docs | In-progress label, copy, foundation/S-07 handoff | Overbuilding Badge/UI |

**Prerequisites:** S-01 shipped (active list/detail exist); local Supabase for Phase 2
**Estimated effort:** ~1–2 sessions across 3 phases

## Open Risks & Assumptions

- Postgres `now()` vs Worker clock may differ by seconds at the grace boundary — acceptable for MVP
- Without stamping `archived_at`, S-07 must use the time predicate (documented in change notes)
- Cron remains a later escape hatch if derived filters prove insufficient at scale

## Success Criteria (Summary)

- Past-grace runs no longer appear on `/runs` or guest detail
- Grace runs show in-progress and still accept eligible mutations
- RLS + docs leave a clear contract for S-07/S-09
