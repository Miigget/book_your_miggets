# Participant archive history — Plan Brief

> Full plan: `context/changes/participant-archive-history/plan.md`

## What & Why

Confirmed participants need to reopen runs after the FR-013 1-hour grace takes them off the public list (FR-015 / US-01 / S-07). Today those URLs 404 for everyone because F-01 never granted confirmed-participant SELECT on archived `runs`, and app loaders only query the active window.

## Starting Point

S-02 stores `pending | confirmed | denied`; leave-team **deletes** the organizer’s confirmed row. S-04 archives by `starts_at + 1h` (no `archived_at` stamp). Organizer/admin RLS can still read past-grace rows; members cannot. `/dashboard` is empty (S-08). `/runs` is the S-03 filtered active list.

## Desired End State

A signed-in confirmed player opens `/runs/history`, sees their archived runs newest-first, and can reuse `/runs/{id}` as read-only (roster/map/time, no apply/approve/leave). Anyone without a current confirmed row — including organizer-who-left — gets the same 404 as guests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Who can see archive | Current `confirmed` row only | FR-015; pending/denied/withdrawn out; leave-team deletes the row | Change / Plan |
| S-08 / S-09 | Out | Organizer inventory and admin-any-player profile are later slices | Change |
| Entry | `/runs/history` + Topbar History; dashboard untouched | Avoid occupying the S-08 stub | Plan |
| Revisit | List + read-only detail | US-01 “visible archive”; mutations already dead after grace | Plan |
| URL | Same `/runs/{id}` | Canonical link; 404 if not confirmed | Plan |
| RLS | SELECT policy EXISTS confirmed **and** archived predicate | S-04 handoff; no DEFINER read RPC | Plan |
| History query | Confirmed ids first, then keep archived | Organizer RLS would leak created-but-unseated runs | Plan |
| Filters / pager | None; `starts_at` DESC | Personal list, MVP volume; S-03 is for discovering others’ active runs | Plan |
| Discovery | Also “Your past runs” on signed-in `/runs` | Explains why yesterday’s run left the active list | Plan |
| Verify | lint/build + SQL/PostgREST matrix + UI | Same as S-04; no new test runner | Plan |
| Invalid `/runs/{id}` | Both loaders `isUuid` → null (404) | Unguarded `getActiveRunById` 500s before the archive path | Plan review F1 |

## Scope

**In scope:** RLS policy; list/detail services; `/runs/history`; dual-mode `[id].astro`; Topbar + `/runs` link; `AGENTS.md` `PROTECTED_ROUTES` (including stale `/admin`)

**Out of scope:** S-08 dashboard, S-09 profiles, stamping `archived_at`, guest archive, filters/pagination, mutation UI on archived runs, Vitest

## Architecture / Approach

```text
run_participants (viewer, confirmed)
  → run ids
  → runs (RLS: active OR organizer/admin OR new archived+confirmed)
  → service keeps !isRunActive
  → /runs/history

GET /runs/{id}
  → isUuid? else 404
  → getActiveRunById
  → else getArchivedRunForParticipant (confirmed + archived) or 404
  → archived: no RunParticipantActions
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. RLS | Confirmed+archived SELECT policy + matrix | Policy too wide (guest/pending) or too narrow (confirmed still 404) |
| 2. Services | List/detail loaders from confirmed ids | Listing every archived row organizer RLS can see (S-08 leak) |
| 3. UI + nav | History page, dual-mode detail, links, AGENTS.md | Dual-mode `[id]` leaving mutation CTAs on archived runs |

**Prerequisites:** S-02 + S-04 shipped; local Supabase for Phase 1
**Estimated effort:** ~2 sessions across 3 phases

## Open Risks & Assumptions

- Organizer/admin policies still SELECT archived rows; **app** must 404 without a confirmed row
- `mapRunRow` currently returns null for archived — archive path must not reuse it unchanged
- Postgres `now()` vs Worker clock: seconds-level skew at the grace edge, accepted since S-04
- YOLO may skip manual Progress rows; residual risk is the RLS matrix and UI click-through

## Success Criteria (Summary)

- Confirmed participant can list and reopen archived runs they are still confirmed on
- Guest, pending/denied, and organizer-who-left cannot
- Active list/detail/mutations unchanged
