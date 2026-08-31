---
date: 2026-08-31T14:34:46+02:00
researcher: migget
git_commit: 1e4cec79ce24e2565684a6a33f3f593377ab579b
branch: main
repository: book_your_miggets
topic: "S-24 — map shipped archive/active/in-progress lifecycle before planning manual archive, extend ≤ 6h, drop 1-hour auto-archive, and max 5 active organizer runs"
tags: [research, codebase, runs, archival, rls, lifecycle, s-24, fr-002, fr-003, fr-004, fr-008, fr-024]
status: complete
last_updated: 2026-08-31
last_updated_by: migget
---

# Research: S-24 shipped archive / active / in-progress lifecycle map

**Date**: 2026-08-31T14:34:46+02:00
**Researcher**: migget
**Git Commit**: [1e4cec79ce24e2565684a6a33f3f593377ab579b](https://github.com/Miigget/book_your_miggets/commit/1e4cec79ce24e2565684a6a33f3f593377ab579b)
**Branch**: main
**Repository**: book_your_miggets

## Research Question

Map every place the 1-hour auto-archive / in-progress window is encoded. Do not propose the new S-24 design (that is `/10x-plan`). Answer with evidence covering:

1. Current archived vs active vs in-progress predicates (`archived_at` vs `starts_at + interval '1 hour'` vs any other helper). Postgres RLS, SQL functions/views, TypeScript services, UI copy.
2. Who can write `archived_at` today (organizer, admin, nobody, trigger). Any archive button already in the UI.
3. Surfaces that filter by active/archived: public `/runs`, dashboard, history, admin archive, public `/players/{id}` Incoming/Recent, clan pages if they list runs.
4. Organizer create-run cap: is there already a max-N non-archived runs check (app or DB)? If not, where create is gated today.
5. Comment ACL / restricted-run SELECT (`can_view_run`, 404-not-403) interaction with archived state — what must not regress.
6. Predecessor decisions in `context/archive/2026-08-07-run-archival-lifecycle/` and related S-07/S-09 participant archive — preserve vs replace.
7. Any cron/job/worker that auto-archives, or is the window purely derived at read time?

## Summary

The 1-hour window is **purely derived at read time**. Nothing stamps `archived_at` after create. There is no cron, no archive RPC, no archive button, no extend column, and no max-5 organizer cap.

**Canonical predicates (live):**

| Concept | Encoding | Where |
|--------|----------|--------|
| **Active (guest/audience list)** | `archived_at IS NULL AND starts_at > now() - interval '1 hour'` | RLS `runs_select_active_*`, `can_view_run` audience path, `is_run_in_active_window`, `auto_join_run`, app `.is("archived_at", null).gt("starts_at", activeWindowStartsAfter())` |
| **Archived (derived)** | `archived_at IS NOT NULL OR starts_at <= now() - interval '1 hour'` | Negation of the window; app `!isRunActive` |
| **In-progress** | `now ∈ [starts_at, starts_at + RUN_GRACE_MS)` | **App only** (`src/lib/run-lifecycle.ts`). Postgres has no in-progress encoding |
| **Stamped archive** | `runs.archived_at timestamptz null` | Stub column; create always writes `null`; column UPDATE grant omits it |

`authenticated` cannot UPDATE `archived_at` (column grants). Admin RLS can UPDATE other columns but not this one. No trigger writes it. Admin UI is **Delete run** (hard DELETE), not archive.

S-24 blast radius is every copy of `interval '1 hour'` / `RUN_GRACE_MS` listed below. Privilege paths (admin / organizer / confirmed SELECT) already bypass the window and must keep working after the derived rule is removed. S-07’s “organizer-who-left 404s archive” was **superseded by S-08**: live `getArchivedRunForOrganizer` opens archive without a confirmed seat.

## Detailed Findings

### 1. Current archived vs active vs in-progress predicates

#### App source of truth

[`src/lib/run-lifecycle.ts`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/run-lifecycle.ts):

- [`RUN_GRACE_MS = 3_600_000`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/run-lifecycle.ts#L1-L2) — comment still cites FR-013 (v1 1-hour grace).
- [`activeWindowStartsAfter`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/run-lifecycle.ts#L17-L19) — ISO lower bound `now - 1h` for `starts_at` queries.
- [`archiveDeadlineAt`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/run-lifecycle.ts#L22-L24) — `starts_at + 1h`.
- [`getRunLifecyclePhase`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/run-lifecycle.ts#L27-L34) — `t < start` → `upcoming`; `t < start + grace` → `in_progress`; else `archived`. **Does not read `archived_at`.**
- [`isRunActive`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/run-lifecycle.ts#L40-L47) — non-null `archivedAt` → false; else phase ≠ `"archived"`.

**Encoding gap:** [`mapRunRow`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L174-L178) keys only off `starts_at` phase. Stamped `archived_at` is enforced by SQL `.is("archived_at", null)` on active queries and by `isRunActive` on inventory/archive mappers. [`mapArchivedRunRow`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L181-L185) uses `isRunActive` (stamp **or** past grace).

`RUN_SELECT` includes `archived_at` ([`runs.ts:56-81`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L56-L81)).

#### Live Postgres (after all migrations)

Canonical live file: [`supabase/migrations/20260824101006_restricted_run_visibility.sql`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql) (S-15). Earlier S-04/S-07/S-13 policies were dropped or replaced here.

| Name | Kind | Predicate | Permalink |
|------|------|-----------|-----------|
| `runs_select_active_anon` | SELECT → anon | `archived_at is null AND starts_at > now() - 1h AND visibility = 'public'` | [L188-196](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L188-L196) |
| `runs_select_active_authenticated` | SELECT → authenticated | same window + (`public` OR friends_only+`are_friends` OR invite_only+`is_run_invitee`) | [L198-216](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L198-L216) |
| `runs_select_confirmed_participant` | SELECT → authenticated | `is_confirmed_participant(id)` — **no time/archive filter** | [L218-222](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L218-L222) |
| `runs_select_own_organizer` | SELECT (F-01, still live) | `auth.uid() = organizer_id` — unbounded | [schema L204-208](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260729134008_run_domain_schema.sql#L204-L208) |
| `runs_select_admin` | SELECT (F-01, still live) | `is_admin()` — unbounded | [schema L210-214](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260729134008_run_domain_schema.sql#L210-L214) |
| `runs_update_own` | UPDATE USING + WITH CHECK | organizer + not banned + **active window** | [L249-273](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L249-L273) |
| `runs_update_admin` | UPDATE | `is_admin()` — no window | [schema L238-243](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260729134008_run_domain_schema.sql#L238-L243) |
| `run_invites_insert_organizer_active` | INSERT | exists run: organizer + active window | [L59-73](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L59-L73) |
| `run_invites_delete_organizer_active` | DELETE | same | [L75-89](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L75-L89) |
| `can_view_run` | DEFINER | admin/organizer/confirmed → true (bypass window); else `v_in_window := archived_at is null AND starts_at > now()-1h` then visibility | [L115-175](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L115-L175), window at [L151](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L151) |
| `is_run_in_active_window` | DEFINER | exists(window) **AND** `can_view_run` | [L408-423](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L408-L423) |
| `auto_join_run` | DEFINER RPC | `not found OR archived_at is not null OR starts_at <= now()-1h OR not can_view_run` → `'not_active'` | [L351-358](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L351-L358) |
| `list_player_public_runs` | DEFINER RPC | `visibility = 'public'` AND (organizer OR confirmed) — **no window** | [L65-75](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260825131500_player_profile_public_runs.sql#L65-L75) |
| `run_comments_insert_own` | INSERT | confirmed + not banned + `is_run_in_active_window(run_id)` | [comments L107-116](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260820092809_run_comments.sql#L107-L116) |
| `run_comments_select_*` | SELECT | confirmed / admin / organizer — **no archive/time filter** | [comments L89-105](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260820092809_run_comments.sql#L89-L105) |
| `create_invite_only_run` | INVOKER | inserts `archived_at` = null | [L479-502](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L479-L502) |

`join_mode` is orthogonal to visibility and to the archive window.

**No SQL views** encode lifecycle. No `extended_until` / `ends_at` / `grace_until` columns exist (`src/types/database.ts` `runs` Row is `id, organizer_id, starts_at, max_participants, min_points, join_mode, archived_at, created_at, updated_at, title, map_id, map_category, visibility`).

#### App query mirrors of the window

| Helper | Filter | Permalink |
|--------|--------|-----------|
| `listActiveRuns` | `.is("archived_at", null).gt("starts_at", activeWindowStartsAfter(now))` then `mapRunRow` | [L254-299](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L254-L299) |
| `getActiveRunById` | same | [L302-321](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L302-L321) |
| `getOwnedActiveRunForEdit` | by organizer_id then `isRunActive` | [L328-349](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L328-L349) |
| `loadActiveRunForMutation` | `.is("archived_at", null).gt("starts_at", activeWindowStartsAfter())` | [L158-172](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/participants.ts#L158-L172) |
| `requireActiveRun` (comments) | same | [L63-69](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/comments.ts#L63-L69) |
| `updateRun` load | organizer + window | [L966-973](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L966-L973) |
| `listRunsForOrganizer` / `listRunsForParticipant` | fetch then split with `isRunActive` | [L372-377](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L372-L377), [L439-444](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L439-L444) |
| `listPlayerProfileRuns` | `isRunActive` → Incoming; `!isRunActive` → Recent | [L576-588](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L576-L588) |

#### UI copy (no user-facing “1 hour”)

| Copy | Permalink |
|------|-----------|
| “upcoming and in progress” | [`runs/index.astro:83`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/index.astro#L83) |
| “In progress / already started” | [`runs/[id].astro:155-158`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/%5Bid%5D.astro#L155-L158) |
| “Status: Archived” | [`runs/[id].astro:160-163`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/%5Bid%5D.astro#L160-L163) |
| Badge “In progress” | [`ActiveRunCard.astro:24`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/runs/ActiveRunCard.astro#L24), [`DashboardRunCard.astro:30`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/runs/DashboardRunCard.astro#L30), [`RunPreviewCard.astro:39`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/runs/RunPreviewCard.astro#L38-L39) |

“1 hour” / “grace” appear only in code comments and SQL, not UI strings.

#### Predicate drift history (superseded, not live)

1. **F-01** [`20260729134008`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260729134008_run_domain_schema.sql): active = `archived_at is null` only.
2. **S-04** [`20260807104348_run_active_window_select.sql`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260807104348_run_active_window_select.sql): added grace to `runs_select_active_*`.
3. **S-07** [`20260817102052`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260817102052_runs_select_archived_confirmed_participant.sql) then [`20260817125800`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260817125800_is_confirmed_participant_breaks_rls_cycle.sql): confirmed SELECT **and** (`archived_at is not null OR starts_at <= now()-1h`).
4. **S-13** [`20260820124849`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260820124849_runs_update_active_invariants.sql): organizer UPDATE locked to window; **column grants drop `archived_at`**.
5. **S-15** (live): drops `runs_select_archived_confirmed_participant`; confirmed SELECT unbounded; audience ANDed into the 1h window.

### 2. Who can write `archived_at` today

**Nobody in the app.** Evidence:

- **Column grants** ([S-15 L275-285](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L275-L285)): `authenticated` may UPDATE only `title, map_id, map_category, starts_at, max_participants, min_points, join_mode, visibility`. `archived_at` is omitted. First closed in S-13. Applies to organizer **and** admin (both use role `authenticated`).
- **INSERT:** app always writes `archived_at: null` ([`api/runs/index.ts:191`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/api/runs/index.ts#L191)); `create_invite_only_run` forces null.
- **Triggers:** `runs_enforce_update_invariants` stamps `updated_at` and validates join_mode/capacity — never `archived_at`.
- **No archive RPC.** Grep of `src/` finds no `.update({ archived_at`.
- **Admin UI is Delete, not Archive:** [`AdminRunControls.tsx:51-54`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/runs/AdminRunControls.tsx#L51-L54) → `POST /api/admin/runs/{id}/delete`. Organizer active detail shows **Edit** only when not archived ([`[id].astro:168-176`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/%5Bid%5D.astro#L168-L176)).
- Only `service_role` / superuser could stamp the column today; nothing in the repo does.

FR-002 (organizer/admin archive button) is **not implemented**.

### 3. Surfaces that filter by active / archived

#### Public `/runs` (FR-024 preserved surface)

- Loader: `listActiveRuns` with `{ publicOnly: true }` for guests; signed-in without `publicOnly` so RLS can return friends/invite ([`index.astro:30-32`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/index.astro#L30-L32)).
- Partition: Public / Friends / Invited / admin Restricted via [`partitionActiveRuns`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/run-list-sections.ts) — never mix friends_only/invite_only into Public.
- Archived: **nobody** on this list (SQL window + `mapRunRow`).
- Signed-in “Your past runs” links to `/dashboard?tab=past` ([L89-93](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/index.astro#L89-L93)).

Home [`Welcome.astro:12`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/Welcome.astro#L12) also uses `listActiveRuns(..., { publicOnly: true }).slice(0, 6)`.

#### Dashboard Incoming / Past

- [`dashboard.astro`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/dashboard.astro): `listRunsForOrganizer` + `listRunsForParticipant`; tab `past` vs default Incoming ([L10](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/dashboard.astro#L10), [L22-35](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/dashboard.astro#L22-L35)).
- Split is `isRunActive` (stamp or past grace). Joined lists exclude own organized runs so they do not duplicate.
- Who sees archived: signed-in owner (all created, even unseated); confirmed teammate archives.

#### `/runs/history`

Redirect only: [`history.ts`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/history.ts) → `/dashboard?tab=past`. Still in `PROTECTED_ROUTES` ([`middleware.ts:6`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/middleware.ts#L6)).

#### `/runs/{id}` detail

Load order ([`[id].astro:58-69`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/%5Bid%5D.astro#L58-L69)):

1. `getActiveRunById` (window)
2. `getArchivedRunForParticipant` — **requires current confirmed seat** ([`runs.ts:631-650`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L631-L650))
3. `getArchivedRunForOrganizer` — `organizer_id === userId`, **no seat** ([L659-676](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L659-L676))
4. `getArchivedRunForAdmin` if `isAdmin` ([L684-699](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L684-L699))
5. else `pageError = "missing"` → **HTTP 404**, copy “missing or no longer active” ([L103-104](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/%5Bid%5D.astro#L103-L104)). Never 403.

Archived: no apply/approve/leave UI; comments readable for confirmed / archived participant source / organizer / admin; post/like only if confirmed and **not** archived ([L92-112](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/%5Bid%5D.astro#L92-L112)).

#### Admin `/admin/users/{id}`

[`listArchivedRunsForParticipant`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L464-L469) — that player’s **confirmed-seat** archives only ([`admin/users/[id].astro:55`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/admin/users/%5Bid%5D.astro#L55)). Cards reopen `/runs/{id}` via the admin third attempt.

#### Public `/players/{id}` Incoming / Recent

- [`players/[id].astro:67-69`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/players/%5Bid%5D.astro#L67-L69) → `listPlayerProfileRuns`.
- Incoming: `isRunActive`, soonest 3, includes in-progress ([`PLAYER_PROFILE_RUN_PREVIEW_LIMIT = 3`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L472)).
- Recent: `!isRunActive`, latest 3.
- Data: RPC `list_player_public_runs` (public, **includes archived**, no window) + organized rows (Invoker SELECT) + extra confirmed memberships the viewer’s RLS already allows.
- Recent **titles** visible to guests; **href only** if [`canOpenArchivedRunDetail`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/lib/services/runs.ts#L617-L624) (admin OR organizer OR confirmed). Wired in [`PlayerProfileRunSections.astro:48-56`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/components/profile/PlayerProfileRunSections.astro#L45-L56). Incoming cards always link `/runs/{id}`.

#### Clan pages

**No run lists.** `src/pages/clans` / clan services have no `isRunActive` / `listActiveRuns`. S-21 is still planning.

### 4. Organizer create-run cap

**No max-N non-archived check exists** in app or DB. No count of organizer active runs before insert. `create_invite_only_run` has no limit.

Create is gated today by:

| Gate | Where |
|------|--------|
| Auth | `PROTECTED_ROUTES` includes `/runs/new` ([`middleware.ts:6`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/middleware.ts#L6)) |
| Banned | UI on `/runs/new`; RLS `runs_insert_own` + `is_not_banned()` |
| Nickname required / verified lock | `CreateRunForm` + [`api/runs/index.ts:69-85`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/api/runs/index.ts#L69-L85) |
| `starts_at` required, valid, **must be in the future** | [API L131-141](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/api/runs/index.ts#L131-L141) |
| Visibility: unverified → public only; invite-only needs invitees | [L87-95](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/api/runs/index.ts#L87-L95) |
| RLS insert | `organizer_id = auth.uid()` + not banned + verified if non-public ([S-15 L231-247](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/supabase/migrations/20260824101006_restricted_run_visibility.sql#L231-L247)) |

Not gated: max 5 active (FR-008 / S-24); 1-year-ahead bound (S-25).

### 5. Comment ACL / restricted SELECT / 404-not-403 — must not regress

#### `can_view_run` (no TS wrapper)

Privilege first (admin / organizer / confirmed) → `true` even if archived or past grace. Audience path **requires** the 1h window, then `public` / friends / invitee. Anon: public + window only. `join_mode` is not consulted.

`is_run_in_active_window` = window AND `can_view_run` (never the reverse). Used for comment INSERT and likes, not for `runs` SELECT policies.

#### Restricted → 404 like missing

Hidden friends-only / invite-only active runs miss `runs_select_active_*` → empty fetch → same 404 copy as missing/archived. No 403 path. Dual-defense: guests also get `publicOnly: true` on `/runs`.

#### Comment ACL

| Operation | Who | Archived interaction |
|----------|-----|----------------------|
| SELECT | confirmed / admin / organizer | **not** time-gated — archived comments remain readable to those roles |
| INSERT / like | confirmed + `is_run_in_active_window` + app `requireActiveRun` | fails after grace / stamp |
| Page `canReadComments` | confirmed OR archivedSource participant OR organizer OR admin | [`[id].astro:92-93`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/%5Bid%5D.astro#L92-L93) |
| Page `canPostOrLike` | confirmed AND not archived AND not banned | [L112](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/src/pages/runs/%5Bid%5D.astro#L112) |

Must not widen to guests, pending applicants, friends/invitees who are not confirmed.

#### Contracts that must not regress when the 1h derived archive is removed

| Contract | Live evidence |
|----------|----------------|
| Restricted runs 404, never 403 | `[id].astro` missing → 404; AGENTS.md |
| Guest cannot SELECT archived | anon only `runs_select_active_anon` (window + public); no archived loaders without `user` |
| Confirmed participant reopens archive they still sit | `getArchivedRunForParticipant` requires `own.status === "confirmed"` |
| Admin opens archived without a seat | `getArchivedRunForAdmin` after `isAdmin`; `runs_select_admin` |
| **Organizer without a confirmed seat still opens archive** | `getArchivedRunForOrganizer` (S-08). S-07 plan-brief “organizer-who-left 404s” is **not** live |
| Non-seat outsiders (friend/invitee never confirmed) 404 archive | audience path requires window; participant loader null without confirmed |
| Comment read not widened; Recent href only if `canOpenArchivedRunDetail` | AGENTS.md + `PlayerProfileRunSections.astro` |
| Mutations / comment write fail when not active | `loadActiveRunForMutation`, `requireActiveRun`, `auto_join_run` `'not_active'` |
| Opaque `?error=` (lessons.md) | archive mutations must not echo PostgREST |

**Retarget together** if the 1h window is dropped: `can_view_run` L151; `runs_select_active_*`; `is_run_in_active_window`; `auto_join_run`; `runs_update_own`; `run_invites_*_organizer_active`; app `activeWindowStartsAfter` / `isRunActive` / list+detail+mutation+comment+edit gates. Privilege paths (admin / organizer / confirmed) must keep working **without** relying on the audience window.

### 6. Predecessor decisions — preserve vs replace

#### Preserve

| Locked decision | Source |
|-----------------|--------|
| Retain rows forever — do not delete on archive | S-04 plan; S-06/S-30: **delete ≠ archive** (hard DELETE + cascade) |
| Guest active list only — no guest SELECT of archived rows | S-04 `change.md` Notes |
| 404 like missing, never 403 | S-07, S-15, AGENTS.md |
| Mutations fail when not active (“not found or no longer active”) | S-04 Phase 1; `loadActiveRunForMutation` |
| App filters on active UX even when organizer/admin RLS is unbounded | S-04 Critical Details |
| Organizer/admin SELECT stay unbounded | S-04 Phase 2; S-15 |
| Non-null `archived_at` short-circuits `isRunActive` | S-04 `run-lifecycle` contract |
| Create writes `archived_at: null` | create API |
| Confirmed-seat archive for **history membership** (pending/denied/leave-team out of participant Past) | S-07; `listRunsForParticipant` confirmed ids first |
| Same `/runs/{id}` for archived read-only; omit apply/approve/leave | S-07 |
| Admin player archive = target’s confirmed archives + detail bypass | S-09 plan-brief |
| Organizer Past by `organizer_id`; unseated organizer can reopen created archives | S-08 `my-runs-dashboard` (live `getArchivedRunForOrganizer`) |
| Confirmed SELECT unbounded (S-15) so seated viewers keep SELECT after unfriend/invite removal | S-15 live policy |
| Player Incoming/Recent: 3 each; guests public via RPC; Recent link gated | AGENTS.md; PR #80 / `2f80c4c`; no 10x folder |
| Comment ACL = confirmed / archived participant / organizer / admin | S-12 + S-15; AGENTS.md |
| Opaque redirect errors; update stale docs when the lifecycle contract changes; default branch `main` | `context/foundation/lessons.md` |

#### Replace (the 1-hour derived auto-archive)

S-24 / FR-003: the shipped 1-hour auto-archive window is gone. That specifically replaces:

- S-04 choice: derived-at-read, **do not stamp** `archived_at`, no cron
- `RUN_GRACE_MS` / `activeWindowStartsAfter` / `archiveDeadlineAt` as the **archive trigger**
- SQL `starts_at > (now() - interval '1 hour')` on active SELECT, `can_view_run` audience, `is_run_in_active_window`, `auto_join_run`, `runs_update_own`, invite insert/delete
- Documented S-04/S-07 handoff “archived ⇔ stamp OR past grace” as the *time-derived* half
- Out-of-scope “do not write `archived_at`” from S-04/S-07/S-09 — S-24 overturns that prohibition for **manual** archive

S-24 still **preserves** the column and the stamp short-circuit; it **replaces** relying on the clock alone.

#### Ambiguous for `/10x-plan` (not decided here)

- In-progress label today is the same 1h window as auto-archive; FR-003 says in-progress lasts until archive or a timed extension — no shipped extend column
- How `authenticated` may SET `archived_at` (grants currently forbid it)
- Whether `runs_update_own` keeps a time-bounded edit window after auto-archive is gone
- `list_player_public_runs` has no time filter; app split uses `isRunActive` (time half becomes inert if archive is stamp-only)
- 5-run cap vs hard delete vs archive (cap mechanics not shipped)
- S-07 plan “organizer-who-left 404s” vs live S-08 organizer archive loader — **preserve live S-08**, not the S-07 brief

### 7. Cron / job / worker

**Absent. Window is derived at read time.**

| Mechanism | Finding | Evidence |
|-----------|---------|----------|
| `wrangler.jsonc` `triggers.crons` | Absent | [`wrangler.jsonc`](https://github.com/Miigget/book_your_miggets/blob/1e4cec79ce24e2565684a6a33f3f593377ab579b/wrangler.jsonc) — no `triggers` key; `main` is `@astrojs/cloudflare/entrypoints/server` |
| Cloudflare `scheduled` handler | Absent | stock Astro entry, fetch-only |
| `supabase/functions` | Absent | 0 files |
| `pg_cron` | Absent | F-01 comment; no `cron.schedule` in `supabase/` |
| Any job UPDATEing `archived_at` | Absent | no SQL/TS writer |

S-04 explicitly deferred cron (custom Worker entry cost). That decision still matches the live tree.

## Code References

- `src/lib/run-lifecycle.ts:1-47` — `RUN_GRACE_MS`, phase, `isRunActive`, `activeWindowStartsAfter`
- `src/lib/services/runs.ts:174-185` — `mapRunRow` (time-only) vs `mapArchivedRunRow` (`isRunActive`)
- `src/lib/services/runs.ts:254-321` — `listActiveRuns` / `getActiveRunById`
- `src/lib/services/runs.ts:328-349` — `getOwnedActiveRunForEdit`
- `src/lib/services/runs.ts:356-470` — organizer/participant inventory split
- `src/lib/services/runs.ts:516-624` — player Incoming/Recent + `canOpenArchivedRunDetail`
- `src/lib/services/runs.ts:631-699` — archived detail loaders (participant / organizer / admin)
- `src/lib/services/runs.ts:966-973` — `updateRun` active window
- `src/lib/services/participants.ts:158-172` — mutation gate
- `src/lib/services/comments.ts:63-69` — comment write gate
- `src/pages/runs/index.astro:30-32,83` — public list + copy
- `src/pages/runs/[id].astro:58-104,155-176` — 404 chain, in-progress/archived copy, Edit
- `src/pages/dashboard.astro:10-35` — Incoming vs Past
- `src/pages/runs/history.ts:1-3` — redirect
- `src/pages/players/[id].astro:67-69` — Incoming/Recent
- `src/pages/api/runs/index.ts:131-141,191` — future `starts_at`; `archived_at: null`
- `src/components/runs/AdminRunControls.tsx:51-54` — Delete only
- `src/middleware.ts:6` — `/runs/history` still protected
- `wrangler.jsonc:1-15` — no crons
- `supabase/migrations/20260824101006_restricted_run_visibility.sql` — live RLS + `can_view_run` / `auto_join_run` / `is_run_in_active_window` / column grants
- `supabase/migrations/20260825131500_player_profile_public_runs.sql:65-75` — RPC without window
- `supabase/migrations/20260820092809_run_comments.sql:89-116` — comment SELECT unbounded; INSERT windowed
- `supabase/migrations/20260807104348_run_active_window_select.sql` — S-04 original window (superseded shape, same predicate)
- `supabase/migrations/20260817102052_runs_select_archived_confirmed_participant.sql` — S-07 archived conjunct (dropped in S-15)

## Architecture Insights

1. **Two “active” meanings coexist.** Audience/guest “on the public list” is the 1h window. Privilege SELECT (organizer/admin/confirmed) is unbounded; the app then splits with `isRunActive`. S-24 must not collapse those two without re-checking each surface.
2. **Service layer is still the choke point** (`runs.ts` + `loadActiveRunForMutation` + `requireActiveRun`), but **SQL duplicates the window in ~10 places**. App-only filter change would reopen PostgREST bypass for guests (the S-04 reason for RLS).
3. **`in_progress` is UI-only.** Postgres never stores or filters it. Removing the 1h archive trigger also removes the only definition of in-progress unless something else defines the interval (FR-003/FR-004).
4. **Stamp column is ready but locked.** Schema + `isRunActive` short-circuit exist; grants and lack of a writer mean FR-002 cannot land without a grant/RPC/policy change.
5. **S-15 dropped the archived conjunct on confirmed SELECT.** Archive detection for seated users is app-side `!isRunActive`, not RLS. That is why confirmed teammates can still `SELECT` a past-grace row even with `archived_at` null.
6. **`mapRunRow` vs `isRunActive` drift.** Active list is safe because SQL also filters `archived_at`. Inventory/edit/profile splits use `isRunActive`. Any stamp-while-still-in-window path must not rely on `mapRunRow` alone.
7. **Clock skew** (Postgres `now()` vs Worker `Date`) is seconds-level and was accepted in S-04. Irrelevant if auto-archive is dropped; still relevant if any remaining time window (extend ≤ 6h) is derived at read.

## Historical Context (from prior changes)

- `context/archive/2026-08-07-run-archival-lifecycle/` — S-04 locked derived-at-read; archived ⇔ stamp OR `starts_at + 1h`; do not stamp; guest 404; mutations fail after grace. **Time half is what S-24 replaces.**
- `context/archive/2026-08-17-participant-archive-history/` — S-07 confirmed+archived SELECT (later rewritten unbounded in S-15); `/runs/history` later redirected to dashboard Past; read-only detail.
- `context/archive/2026-08-17-admin-player-archive-view/` — S-09 admin bypass; reuse S-07 confirmed archives for the **target** player.
- `context/archive/2026-08-18-my-runs-dashboard/` — S-08 organizer inventory by `organizer_id`; unseated organizer can reopen; `/runs/history` membership-based redirect.
- S-13 `20260820124849_runs_update_active_invariants.sql` — closed `archived_at` writes from `authenticated`.
- S-15 `20260824101006_restricted_run_visibility.sql` — visibility axes ANDed into the window; largest live ACL file.
- Player Incoming/Recent: git `2f80c4c` / PR #80; no 10x change folder.
- `context/foundation/roadmap.md` S-24 / S-30 — blast radius on 1h window; owner delete is not archive.
- `context/foundation/prd-v2.md` FR-002, FR-003, FR-004, FR-008, FR-024 — product target (not current code).
- `context/foundation/prd.md` FR-013 — **stale v1** 1-hour grace (lessons.md: update when the contract changes).

## Related Research

- `context/archive/2026-08-07-run-archival-lifecycle/research.md` — planning-ready FR-013 groundwork (schema stub, cron vs derived).
- No other `research.md` under `context/changes/manual-archive-and-extend/` before this file.

## Open Questions

Not blocking this research (query was unambiguous). For `/10x-plan`, not answered here:

1. After dropping auto-archive, what still derives `in_progress` vs `upcoming` vs `archived` in `getRunLifecyclePhase` / badges (FR-003 “until button or extend elapses”).
2. Writer path for `archived_at` given current column grants (organizer vs admin, RLS WITH CHECK vs SECURITY DEFINER).
3. Whether organizer UPDATE/invite/comment-write stay time-bounded once runs can remain active past 1h.
4. Interaction of max-5 with **derived-archived** (past-grace but `archived_at` null) vs **stamped** vs **hard-deleted** rows — today past-grace already leaves the active list without freeing a stamped slot because there is no cap and no stamp.
5. Whether `list_player_public_runs` stays unfiltered (app split) or should follow whatever new active predicate the plan picks.
