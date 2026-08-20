<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit an active run (S-13)

- **Plan**: context/changes/edit-run/plan.md
- **Scope**: Phase 1–3 of 3 (full plan)
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Accepted / verified (not findings)

- Phase reviews: p1 APPROVED (0), p2 APPROVED (1 LOW F1 applied in p3), p3 APPROVED (0). Full sweep re-checked all three phases together; no new drift.
- Crew Lead `p1-capacity-when`: trigger raises `capacity_below_confirmed` only when `NEW.max_participants IS DISTINCT FROM OLD.max_participants`. Service + client use the same predicate so an S-02 overfilled run can still save title/map/starts_at.
- Plan-review F1: edit prefills `datetime-local` via `startsAtToLocalDatetime` (local `YYYY-MM-DDTHH:mm`); hidden field still posts ISO.
- Plan-review F2: `isRunActive(startsAt, null)` throws `RunError("Start time must keep the run active")` before the 0-row not-found path.
- Owner gate is `getOwnedActiveRunForEdit` / `updateRun` (`organizer_id` + active window), not `getActiveRunById`, and does not import `loadActiveRunForMutation`.
- Error surface copies `apply.ts` (`RunError` → `fail(err.message)`; else `console.error` + fixed copy). Trigger tokens mapped to planned user-facing strings. `lessons.md` `?error=` rule held.
- RLS does not call `is_run_in_active_window` from a policy on `public.runs`. Column grants leave `runs_update_admin` unchanged. DEFINER trigger uses `search_path = ''`, revoke public, no EXECUTE to `authenticated`.
- Out of scope held: no category/visibility, no admin editor, no pending migration, no organizer delete, no notifications, no `min_points` on apply, no Vitest/PATCH/`returnTo`, no `archived_at` stamp.

## Findings

None.

## Verification

### Automated

| Check | Result |
|-------|--------|
| `npx supabase db reset` | Not re-run (destructive). Phase 1 review confirmed migration `20260820124849_runs_update_active_invariants` applied and objects match the file. |
| `npm run db:types` | Not re-run. Phase 1: regenerated `--local` types identical to committed `src/types/database.ts`. |
| `npx astro sync` | Pass (types generated) |
| `npm run lint` | Pass (0 errors; 51 pre-existing `no-console` warnings, including the `console.error` calls lessons.md requires on update paths) |
| `npm run build` | Pass (`astro build` Complete; Cloudflare adapter) |

### Manual

| Progress | Result |
|----------|--------|
| 1.4–1.9 | Marked `[x]` with `8056c74`. Phase 1 review re-ran SQL smokes as `authenticated`. |
| 2.3–2.7 | Marked `[x]` with `fb2fcdb`. YOLO: curl vs local `npm run dev` (crew-decisions). Residual: CSRF/cookie/Origin. |
| 3.4–3.10 | Marked `[x]` with `02c9115`. YOLO: curl/HTTP on local astro :4323. Residual: datetime-local hydration, disabled-select styling, real cookie session. Diff evidence exists for Edit links, 404 shell, banned banner, form edit-mode, and middleware regex. |

## Plan vs diff (commits `8056c74`, `fb2fcdb`, `02c9115`, `8581eae`)

- In plan and in diff: migration SQL, `runs.ts`, `api/runs/[id]/index.ts`, `middleware.ts`, `runs/[id]/edit.astro`, `CreateRunForm.tsx`, `runs/[id].astro`, `dashboard.astro`, `AGENTS.md` — MATCH.
- In plan, not in product diff: `src/types/database.ts` — MATCH (no generated delta).
- In diff, not in plan file list: `src/lib/services/runs.ts` extras in p3 (`getOwnedActiveRunForEdit` + p2 F1) — intended. Context/Progress stamps — implement ritual, not product scope creep.
