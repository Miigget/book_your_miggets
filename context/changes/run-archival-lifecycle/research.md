---
date: 2026-08-07T11:39:47+02:00
researcher: migget
git_commit: 21c1a52aa39558c7c9091c24261ff3663dc2e414
branch: main
repository: book_your_miggets
topic: "S-04 run-archival-lifecycle — planning-ready codebase research for FR-013"
tags: [research, codebase, runs, archival, fr-013, s-04, cloudflare, supabase]
status: complete
last_updated: 2026-08-07
last_updated_by: migget
---

# Research: S-04 run-archival-lifecycle — planning-ready FR-013 groundwork

**Date**: 2026-08-07T11:39:47+02:00
**Researcher**: migget
**Git Commit**: 21c1a52aa39558c7c9091c24261ff3663dc2e414
**Branch**: main
**Repository**: book_your_miggets

## Research Question

Research everything useful for planning implementation of `run-archival-lifecycle` (roadmap S-04 / FR-013): 1-hour in-progress grace after scheduled start, then archive off the active list (retain, do not delete). Depth: planning-ready. Include architecture, integration points, prior-change history, UI touchpoints, and S-07/S-09 handoff notes (without implementing those UIs).

## Summary

Lifecycle is **stubbed, not implemented**. Schema already has `starts_at timestamptz` and nullable `archived_at`; “active” everywhere means `archived_at IS NULL` (RLS + `listActiveRuns` / `getActiveRunById` / mutation gate). Nothing stamps `archived_at` after create, and nothing derives in-progress from time — past-start runs stay on `/runs` forever.

FR-013 needs two behaviors: (1) label grace as in-progress/already started for `now ∈ [starts_at, starts_at + 1h)`, (2) remove from guest/member active list after grace. Stack docs leave cron vs derived open for `/10x-plan`, with a soft infra preference for **derived-at-read for MVP**. Pure UI derivation without changing list filters does not satisfy “past runs don’t clutter the active list.”

Hot paths: `src/lib/services/runs.ts`, list/detail Astro pages, `loadActiveRunForMutation` in participants, optional wrangler cron + custom Astro Worker entry if write-time archive is chosen. S-07/S-09 need a stable archived predicate and later confirmed-participant SELECT RLS (intentionally incomplete in F-01).

## Detailed Findings

### Product & roadmap invariants

- **FR-013** (`context/foundation/prd.md`): keep visible 1 hour after scheduled start; during grace mark in-progress/already started; then move to archive (retained indefinitely, not deleted).
- **S-04 outcome** (`context/foundation/roadmap.md`): user sees in-progress during grace, then run leaves active list. Prerequisites: S-01 (done). Unlocks S-07; joins S-09 with S-06.
- **Open plan decision** (roadmap risk): cron-driven vs derived at read time — not locked despite infra lean toward derived.
- Suggested community launch floor includes S-04 (`roadmap.md` Open Question 2).

### Schema & RLS (F-01 stub)

Table `public.runs` ([migration](https://github.com/Miigget/book_your_miggets/blob/21c1a52aa39558c7c9091c24261ff3663dc2e414/supabase/migrations/20260729134008_run_domain_schema.sql#L25-L36)):

| Column | Role for S-04 |
|--------|----------------|
| `starts_at timestamptz not null` | Absolute schedule instant (product “scheduled start”) — **not** named `scheduled_at` |
| `archived_at timestamptz null` | Soft archive marker; create always sets `null` |
| No `status` / run lifecycle enum | In-progress must be derived or added later |

Index `runs_archived_at_starts_at_idx (archived_at, starts_at)` already supports active list ordering.

RLS select matrix ([same migration](https://github.com/Miigget/book_your_miggets/blob/21c1a52aa39558c7c9091c24261ff3663dc2e414/supabase/migrations/20260729134008_run_domain_schema.sql#L192-L214)):

| Who | Sees archived rows via RLS? |
|-----|-----------------------------|
| anon / authenticated (default) | No — `archived_at is null` only |
| Organizer (own) | Yes |
| Admin | Yes |
| Confirmed participant (FR-015) | **Not yet** — F-01 left incomplete for S-07 |

**Gap:** App always filters `.is("archived_at", null)`, so even organizers get 404 on detail for archived runs today.

### Data access (integration hot paths)

| Function / path | Behavior today | S-04 relevance |
|-----------------|----------------|----------------|
| `listActiveRuns` ([runs.ts:151-169](https://github.com/Miigget/book_your_miggets/blob/21c1a52aa39558c7c9091c24261ff3663dc2e414/src/lib/services/runs.ts#L151-L169)) | `archived_at IS NULL`, order `starts_at` ASC, **no** time filter, no limit | Must exclude past-grace runs (query and/or stamp) |
| `getActiveRunById` ([runs.ts:171-187](https://github.com/Miigget/book_your_miggets/blob/21c1a52aa39558c7c9091c24261ff3663dc2e414/src/lib/services/runs.ts#L171-L187)) | Same active filter → null → 404 | Grace: still load; archived: 404 for guests (or new archive reader later) |
| `RUN_SELECT` | Does **not** select `archived_at` | May need `starts_at` + derived phase on DTO |
| `POST /api/runs` | Writes `starts_at` ISO UTC + `archived_at: null`; rejects past starts | Unchanged for schedule; future create stays future-only |
| `loadActiveRunForMutation` (`participants.ts`) | Requires `archived_at IS NULL` | Decide: allow apply/approve during grace (yes, still active) vs after archive (no) |

Timezone: create converts local `datetime-local` → `toISOString()`; display uses viewer `toLocaleString`. Grace math must use UTC instants (`starts_at + 1 hour`), not wall-clock TZ columns (none exist).

### UI surfaces

| Surface | Finding |
|---------|---------|
| `/runs` (`src/pages/runs/index.astro`) | Inline cards; shows title, start, capacity, min points, join mode, map — **no** lifecycle badge; copy says “upcoming” but query is not upcoming-only |
| `/runs/[id]` | Details DL + `RunParticipantActions` island; no status; full apply/approve while page loads |
| `/dashboard` | Auth shell only — no run lists (S-08 later) |
| Badge pattern | No shadcn `Badge`; closest = colored spans in `RunParticipantActions` (pending/denied/confirmed) |
| Date helpers | Duplicated local `formatStart` on list + detail; no shared util / relative-time lib |

**Direct URL today:**

- `archived_at` set → 404 “missing or no longer active”
- `starts_at` past, `archived_at` null → full list + detail + mutations (FR-013 gap)

### Archival strategy options (evidence)

| Option | How | Pros | Cons / costs |
|--------|-----|------|----------------|
| **A. Derived at read** | Phase from `now` vs `starts_at` / `+1h`; filter active list by time (app and/or RLS) | No cron; exact timing; matches infra risk mitigation (`infrastructure.md` prefers derived for MVP) | Must redefine “active” beyond `archived_at IS NULL`; if `archived_at` stays null forever, S-07 needs a clear archived predicate (time and/or column) |
| **B. Cron writes `archived_at`** | Periodic UPDATE past grace | Keeps current RLS/index semantics | Needs `triggers.crons` + **custom Astro Worker entry** (stock `@astrojs/cloudflare` entry is fetch-only); cron granularity lag; Free plan cron CPU/count limits; no `service_role` on Worker — writer must fit RLS or SECURITY DEFINER |
| **C. Hybrid** | Derive in-progress UX always; stamp `archived_at` when past grace (cron or lazy write-on-read) | Matches two-phase UX + stable column for S-07/S-09 RLS | Two sources of truth until stamp; more code |

**Cloudflare Cron (if B/C):** declare `triggers.crons` in `wrangler.jsonc` (currently absent); export `scheduled` from a custom Worker `main` that also re-exports Astro `fetch`. Docs: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/), [Astro Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/).

**Supabase pg_cron:** viable inside Postgres without Worker entry change; unused today; adds ops outside Wrangler. Only note if plan prefers DB-side stamping.

Deploy: tag `v*` runs `db push` then Worker deploy — migrations and wrangler cron both ship on release tag, not on merge.

### Prior decisions (history)

- F-01 plan: stub `archived_at` only; **do not** implement FR-013 grace; leave write-time vs derived to S-04.
- S-01/S-02 plans: preserve active = `archived_at IS NULL`; reject mutations on archived; archive UX out of scope.
- `infrastructure.md` pre-mortem: never implementing Cron → stale active list; mitigation prefer derived for MVP.
- `tech-stack.md` / bootstrap: FR-013 via cron **or** derived (bootstrap still has stale Pages/merge-deploy wording — lesson: update stale docs when touched).

### S-07 / S-09 handoff (out of implementation scope)

What S-04 should leave ready:

1. Stable definition of “archived” that matches guest “off active list” (written `archived_at` and/or documented time rule).
2. Do not open guest SELECT of archived rows (S-01: guests stay on active only).
3. Expect a later migration for confirmed-participant SELECT on archived runs (`run_participants.status = 'confirmed'`) — F-01 brief called this incomplete.
4. Admin already SELECT-all; S-09 is profile-scoped UX, not inventing admin read from zero.
5. Keep mutation “non-active → not found” coherent: grace still active; post-grace not.

Extension points: new `listArchived*` / `getRunById` beside active helpers; reuse detail layout with actions hidden; dashboard/profile for history later.

## Code References

- `supabase/migrations/20260729134008_run_domain_schema.sql:25-36` — `runs` table with `starts_at` / `archived_at`
- `supabase/migrations/20260729134008_run_domain_schema.sql:48` — `(archived_at, starts_at)` index
- `supabase/migrations/20260729134008_run_domain_schema.sql:192-214` — active vs organizer/admin SELECT policies
- `src/lib/services/runs.ts:151-187` — `listActiveRuns` / `getActiveRunById`
- `src/pages/runs/index.astro` — public active list UI
- `src/pages/runs/[id].astro` — detail + 404 for non-active
- `src/pages/api/runs/index.ts` — create with `archived_at: null`, future `starts_at` only
- `src/lib/services/participants.ts` — `loadActiveRunForMutation` archived gate
- `src/components/runs/RunParticipantActions.tsx` — apply/approve UI (status-colored spans)
- `wrangler.jsonc` — no `triggers.crons` today
- `context/foundation/prd.md` — FR-013, FR-015, FR-016
- `context/foundation/roadmap.md` — S-04 / Stream C
- `context/foundation/infrastructure.md` — derived vs Cron preference
- `context/foundation/tech-stack.md:29-31` — FR-013 not first-class on starter

## Architecture Insights

1. **“Active” is column-keyed today**, not time-keyed — any plan must either write `archived_at` or change filters/RLS to time predicates (or both).
2. **Grace UX is pure `starts_at` math** either way; list removal is the harder contract decision.
3. **Service layer is the right choke point** (`runs.ts` + participants gate) before Astro pages grow divergent filters.
4. **Cron on Astro Workers is non-trivial** (custom entrypoint) — cost should weigh against derived/hybrid for MVP traffic.
5. **DTO gap:** list/detail types have no lifecycle phase; plan should add a derived `upcoming | in_progress | archived` (or similar) for UI without requiring a DB enum.
6. **No shared date util** — good place to centralize grace constants (`GRACE_MS = 3600000`) and format helpers when implementing.

## Historical Context (from prior changes)

- `context/archive/2026-07-29-run-domain_schema/plan.md` — stub only; FR-013 deferred; RLS matrix for organizer/admin archived read
- `context/archive/2026-07-29-create-and-list-runs/plan.md` — preserve `archived_at IS NULL` active semantics; guests 404 archived
- `context/archive/2026-07-31-apply-and-approve-participants/plan.md` — reject apply when archived
- `context/deployment/deploy-plan.md` §9.1 (cited in infra research) — derived first; Cron/Queues if insufficient

## Related Research

No prior `research.md` for this change-id. No other archival research artifacts under `context/changes/**` or `context/archive/**`.

## Open Questions

For `/10x-plan` (not decided here):

1. **A vs B vs C** — derived-only, cron write, or hybrid? (Soft prior: A/hybrid for MVP.)
2. If derived-only: do we update RLS to time-based active predicates, or only app-layer filters (RLS still allows past-start rows with null `archived_at`)?
3. If writing `archived_at`: Cloudflare Cron (custom entry) vs Supabase `pg_cron` vs lazy write-on-read?
4. During grace: keep apply/approve/leave fully open (recommended by “still active”) or soft-disable late joins?
5. After archive: guest direct URL stays 404 (current) until S-07 — confirm acceptable for S-04.
6. Should list empty-state / copy stop saying “upcoming” once past-start-in-grace runs appear?
7. Touch `bootstrap-verification.md` stale deploy wording when documenting the chosen path (lessons.md: update stale docs).
