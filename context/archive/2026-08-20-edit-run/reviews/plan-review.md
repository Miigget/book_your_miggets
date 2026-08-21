<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Edit an active run (S-13)

- **Plan**: context/changes/edit-run/plan.md
- **Mode**: Deep
- **Date**: 2026-08-20
- **Verdict**: SOUND
- **Findings**: 0 critical 0 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 8/8 existing modify-paths ✓, 14/14 symbols ✓, brief↔plan ✓

Existing paths listed: `src/lib/services/runs.ts`, `src/middleware.ts`, `src/components/runs/CreateRunForm.tsx`, `src/pages/runs/[id].astro`, `src/pages/dashboard.astro`, `AGENTS.md`, `src/types/database.ts`, `supabase/migrations/20260729134008_run_domain_schema.sql`. Referenced-not-modified also exist: `src/pages/api/runs/index.ts`, `src/lib/run-lifecycle.ts`, `src/lib/services/participants.ts`, `src/pages/api/runs/[id]/` (directory with apply/withdraw/leave-team/comments; no `index.ts` yet). New files correctly absent: `src/pages/api/runs/[id]/index.ts`, `src/pages/runs/[id]/edit.astro`, the Phase 1 migration.

Symbols confirmed: `isRunActive` / `activeWindowStartsAfter` (`src/lib/run-lifecycle.ts`), `countConfirmedParticipants` (exported), `loadActiveRunForMutation` (module-private at `participants.ts:158` — plan correctly says do not import), `getActiveRunById` (no `organizer_id` filter — must not be the edit gate), `isJoinMode` / `isUuid` / `listMapsForPicker`, `ParticipantError` / `ProfileError`, `PROTECTED_ROUTES` (`startsWith` on five prefixes; `/api/` is not among them), `runs_update_own` / `runs_update_admin` (`20260729134008_run_domain_schema.sql:225-243`), `is_run_in_active_window` (SELECTs `runs` — must not be called from a policy on `runs`), `seat_organizer_on_run_insert` DEFINER posture, `ServerError`, `listRunsForOrganizer`. `npm run db:types` exists in `package.json`.

Brief↔plan: MEDIUM / 3 phases, join-mode lock after any non-organizer row, starts_at must stay active, capacity floor = confirmed only, `/runs/[id]/edit` + Edit on detail and dashboard, app + RLS active-window + BEFORE UPDATE trigger, guests sign-in / 404 everyone else including admin-as-editor and archived owner, title/map/min_points editable, locked join_mode = disabled select + server ignore, S-14/S-15 out of scope — all match `crew-decisions.md` and do not reopen product scope.

`docs/reference/contract-surfaces.md` absent — contract-surface grep skipped.

Progress↔Phase: one `## Progress` at the bottom; three phase names match; every success-criteria bullet has a Progress `- [ ] N.M` row; phase bodies use plain `-` bullets only.

Codebase verification (deep, no nested sub-agent — claims checked in-repo):

1. **RLS UPDATE hole** — confirmed. `runs_update_own` is organizer + `is_not_banned()` only; no active-window predicate. Table grant is `grant insert, update, delete on table public.runs to authenticated` (`run_domain_schema.sql:149`). No app-layer `.from("runs").update()` exists today (`admin.ts` only deletes). Column-level REVOKE+GRANT will not break an existing app update.
2. **Create clock vs grace edit** — confirmed. `CreateRunForm` rejects `d.getTime() <= Date.now()` (`CreateRunForm.tsx:69-70`); create API repeats that (`api/runs/index.ts:95-97`). Edit must branch to `isRunActive` or grace reschedule is impossible.
3. **Astro file vs directory** — `[id].astro` (file) and `[id]/edit.astro` (directory `[id]`) are different names; Linux allows both. API already uses `src/pages/api/runs/[id]/` as a directory. Plan fallback (`[id]/index.astro`) is sufficient. `POST /api/runs/:id` via `[id]/index.ts` is the right sibling of `apply.ts`.
4. **DEFINER trigger + run_participants** — same posture as `seat_organizer_on_run_insert` (DEFINER, `search_path = ''`, revoke public, no execute to authenticated). Trigger SELECT of `run_participants` will not recurse the way inlining `is_run_in_active_window` on a `runs` policy would.
5. **Dashboard Edit ACL** — `dashboard.astro` loads `listRunsForOrganizer` only (ownership, not participation). Edit on active cards cannot leak onto someone else's run.

Blast radius: `CreateRunForm` has a single caller (`new.astro`). `updateRun` / `RunError` are additive on `runs.ts`. Middleware grows one regex; `/runs` and `/runs/{id}` stay public. Column grants affect PostgREST PATCH of `archived_at` / `organizer_id` for all `authenticated` (including admin JWT) — intended; `runs_update_admin` left unchanged so an admin JWT can still PATCH the six granted columns on any row, with no UI for that (out of scope).

Pattern check: Phase 2 should copy `apply.ts` (`ParticipantError` → `fail(err.message)`, else `console.error` + fixed string), not create’s `fail(insertError.message)` / `fail(\`Could not validate map: ${mapError.message}\`)`. Map lookup belongs in `updateRun` with fixed `RunError` copy (`lessons.md`). Edit island should use `client:load` like `new.astro:59`.

## Findings

### F1 — Edit `starts_at` prefill into `datetime-local` is unspecified

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Shared create/edit form
- **Detail**: Create stores a hidden ISO `starts_at` from a `datetime-local` value built as `YYYY-MM-DDTHH:mm` in local time (`defaultLocalStartsAt` in `CreateRunForm.tsx:20-25`). Edit must prefill the existing `starts_at` timestamptz. Assigning the ISO string (with `Z` or offset) to `datetime-local` leaves the control empty in browsers, so client validation fails or the organizer cannot save a grace-window time without re-picking the clock. The inverse conversion is a few lines next to the existing pad helper.
- **Fix**: In edit mode, convert `starts_at` to local `YYYY-MM-DDTHH:mm` with the same pad helper create already uses; keep posting ISO via the hidden field.
- **Decision**: PENDING

### F2 — WITH CHECK on a self-archiving `starts_at` is an error, not a 0-row no-op

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details / Phase 2
- **Detail**: Postgres RLS UPDATE: `USING` false → 0 rows (silent no-op); `WITH CHECK` false → statement error (`new row violates row-level security policy`). A save that moves `starts_at` out of the active window fails WITH CHECK, it does not come back as empty `maybeSingle()`. The sentence that groups “empty update” with “a starts_at that would archive” is slightly wrong; the Phase 2 contract (validate `isRunActive(newStartsAt, null)` first, then map `error`, then treat zero rows as not-found) is still the right order. Implement against that contract, not the conflated prose.
- **Fix**: Keep error-first handling as Phase 2 already specifies; use a dedicated `RunError` for the `isRunActive` rejection (e.g. “Start time must keep the run active”) rather than the not-found string. No SQL change.
- **Decision**: PENDING
