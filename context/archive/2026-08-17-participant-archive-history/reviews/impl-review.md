<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Participant archive history Implementation Plan

- **Plan**: context/changes/participant-archive-history/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-17
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: addb515 (p1), 5f71dc6 (p2), 0c09984 (p3), 349d2bb (epilogue)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

Full-plan sweep after phase reviews 1–3 (all APPROVED, 0 findings). Product diff `addb515^..HEAD` is the eight expected files plus 10x artifacts (`context/changes/participant-archive-history/*`, `roadmap.md`). No extra product paths. Nested helpers (`runFieldsFromRow`, `formatReleasedOn`) allowed.

### End state vs plan

Confirmed participant with a current `run_participants` row on a past-grace (or stamped-`archived_at`) run can open `/runs/history` (newest `starts_at` first) and reuse `/runs/{uuid}` as read-only (map, time, confirmed roster; Archived label; no apply/approve/leave/pending queue). Anyone without a **current** confirmed row — guest, pending/denied, organizer after leave-team — gets HTTP 404 and the same “missing or no longer active” copy. Active list/detail/mutations unchanged.

### Dual defense: RLS + app 404

**Phase 1 RLS** (`supabase/migrations/20260817102052_runs_select_archived_confirmed_participant.sql`):

- `create policy "runs_select_archived_confirmed_participant"` `for select` `to authenticated`
- `USING`: EXISTS confirmed `run_participants` for `(select auth.uid())` **and** S-04 archived predicate `archived_at is not null or starts_at <= (now() - interval '1 hour')`
- Boolean complement of S-04 active window (`archived_at is null AND starts_at > now() - 1 hour`) — De Morgan, no overlap/gap at the 1-hour boundary (`<=` vs `>`)
- No `anon`, `WITH CHECK`, `service_role`, DEFINER RPC, or `archived_at` stamp
- Existing `runs_select_active_*`, `runs_select_own_organizer`, `runs_select_admin` unchanged

Organizer/admin SELECT still returns past-grace rows they created/admin. That is planned; the app must 404 without a confirmed seat.

**Phase 2 choke point** (`src/lib/services/runs.ts`):

- List starts from confirmed ids (`user_id` + `status = 'confirmed'`); empty → `[]` before any `runs` query; then `.in("id", runIds)`; keep `!isRunActive`; sort `starts_at` desc; counts on the archived subset; `mapArchivedRunRow` (never `mapRunRow`)
- Detail: `isUuid` → null; `getOwnParticipation` and `own?.status !== "confirmed"` → null **before** the `runs` fetch; still-active → null. Organizer/admin RLS success is not enough
- Active path still `.is("archived_at", null).gt("starts_at", activeWindowStartsAfter(now))`; `mapRunRow` still drops `lifecyclePhase === "archived"`
- Both detail loaders `isUuid`-guard (plan-review F1 / Progress 2.9)

**Phase 3 UI**:

- Dual-mode `[id].astro`: `getActiveRunById` first; if null **and** `user`, `getArchivedRunForParticipant`; else `pageError = "missing"` HTTP 404. Guests never call the archive loader
- Archived mode omits `RunParticipantActions` and does not fetch pending/denied; `AdminRunControls` only if `isAdmin` and the page loaded (admin without a seat still 404s — no S-09)
- `/runs/history` in `PROTECTED_ROUTES`; `startsWith` does **not** prefix-gate `/runs`
- Signed-in Topbar History + `/runs` “Your past runs”; guests have neither; `/dashboard` untouched stub

### NOT-doing list

No FR-016 profile archive, no S-08 dashboard inventory, no `archived_at` stamp/cron/enum, no guest/anon archived SELECT, no history filters/pagination, no mutation CTAs on archived runs, no pending/denied archive access, no Vitest, no SECURITY DEFINER read RPC, no `service_role` on the Worker.

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 1.1 Migration with confirmed+archived SELECT | PASS — `20260817102052_runs_select_archived_confirmed_participant.sql` |
| 1.2 / 2.3 / 3.3 `npm run lint` | PASS — exit 0; 15 pre-existing `no-console` warnings in unrelated files, 0 errors |
| 1.3 / 2.4 / 3.4 `npm run build` | PASS — `astro build` complete |
| 2.1 Archive loaders exist; used only for archive | PASS — defined in `runs.ts`; callers are `history.astro` and `[id].astro` only |
| 2.2 Active loaders still filter the active window | PASS |
| 2.9 Both detail loaders return null for invalid UUID | PASS — `isUuid` early-return |
| 3.1 `history.astro` exists; middleware lists `/runs/history` | PASS |
| 3.2 Topbar History for signed-in users | PASS — inside `user ?` branch only |
| 3.5 `AGENTS.md` `PROTECTED_ROUTES` includes `/admin` and `/runs/history` | PASS |

### Manual verification

YOLO skipped all Manual Progress rows. Not findings. See Residual risk.

| Check | Progress | This review |
|-------|----------|-------------|
| 1.4 Migration applies on local Supabase | `[x]` — addb515 | Accepted from phase-1 review / crew-decisions |
| 1.5–1.9 PostgREST/SQL RLS matrix | `[ ]` | YOLO skipped. Static: policy SQL is authenticated+confirmed+archived only |
| 2.5–2.8 Loader manuals | `[ ]` | YOLO skipped. Static: confirmed-ids-first list; confirmed+archived detail; active window unchanged |
| 3.6–3.12 UI click-through | `[ ]` | YOLO skipped. Static: middleware redirect, dual-mode 404, hidden mutations, guest-hidden History, stub dashboard |

## Findings

None.

## Residual risk

Progress 1.5–1.9, 2.5–2.8, and 3.6–3.12 remain unchecked (YOLO human-action skip). Static review of the new SELECT policy, confirmed-ids-first list, confirmed-before-fetch detail, dual-mode 404 copy, and NOT-doing boundaries found no over-grant and no S-08 leak. Live PostgREST matrix (anon / pending-denied / confirmed / organizer-left / admin-without-seat) and UI 404 walks were not executed. Postgres `now()` vs Worker `Date` skew at the grace edge is the same S-04 acceptance.

## Proceed

YOLO Done path: report saved; no triage (0 findings). Do not start archive in this invocation.
