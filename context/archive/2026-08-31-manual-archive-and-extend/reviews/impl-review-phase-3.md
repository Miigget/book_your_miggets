<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual archive, extend, and active-run cap

- **Plan**: `context/changes/manual-archive-and-extend/plan.md`
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-31
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

## Findings

None.

## Review notes (not findings)

Known adaptations, accepted by crew / this review invocation — do not reopen as drift:

- Progress **3.5–3.12** Manual UI: left unchecked; skipped as YOLO human-action (residual risk: Archive/Extend click-through, admin Archive vs Delete, guest POST → sign-in, archived restricted 404, `/runs/new` cap banner, player Incoming/Recent hrefs, and home preview were not exercised in a browser). Automated lint/build + file/contract spot-reads substitute for the code half only.
- `CreateRunForm.tsx` is named “only if needed for a banner slot.” Cap UX lives in `new.astro` (hide form + same 5-active string). Not missing work.
- Extra prop `timeZone` on `OrganizerRunLifecycleControls` is implied by “show a scheduled leave-active time” (`formatStart`). Not scope creep.
- `prd.md` **FR-013** and US-06 still mention the v1 1-hour grace. Phase 3 contract was Guardrails + US-01 **Then** only; plan said do not rewrite v1 FRs. Residual stale-doc risk for agents that read FR-013 first; `prd-v2.md` remains the v2 source.
- `change.md` left **`implementing`**. This is a phase review (full-plan review is a separate invocation). The generic skill stamp `impl_reviewed` belongs on the full-plan review after all phases.

### Git vs plan (Phase 3)

Commit `5079165` (plus dirty `plan.md` Progress SHA write-back / `crew-decisions.md`).

| Planned | In diff | Verdict |
|---------|---------|---------|
| `src/pages/api/runs/[id]/archive.ts` (new) | POST; invalid UUID / no session / `archiveRun` / `RunError` → `runFail`; infra → log + “Could not archive this run”; JSON `{ ok, redirect }` to `/runs/{id}` | MATCH |
| `src/pages/api/runs/[id]/extend.ts` (new) | Same HTTP shell; `hours` in `{1,2,3,6}` else fixed string; `extendRun`; infra → “Could not extend this run” | MATCH |
| `src/pages/api/admin/runs/[id]/archive.ts` (new) | Copies `delete.ts` admin gate (JSON 403 / redirect `/`); `archiveRun`; success stays on `/runs/{id}`; Delete untouched | MATCH |
| `src/components/runs/OrganizerRunLifecycleControls.tsx` (new) | Archive + extend 1/2/3/6; confirm copy; `fetchFormJson` + `ServerError`; extend only `in_progress` && `extendedUntil == null`; scheduled-leave line; `cn()`; no `"use client"` | MATCH |
| `src/pages/runs/[id].astro` | Organizer island beside Edit when `isOrganizer && !isArchived`; `showArchive={!isArchived}` on Admin; `?error=` Banner for organizer **or** admin (not admin-archived-only); no apply/leave on archived | MATCH |
| `src/components/runs/AdminRunControls.tsx` | Optional `showArchive`; “Archive run”; POST `/api/admin/runs/{id}/archive`; Delete unchanged | MATCH |
| `src/pages/runs/new.astro` | Count via `countAudienceActiveRunsForOrganizer`; `>= 5` hides form and shows `ACTIVE_RUN_CAP_MESSAGE`; `PROTECTED_ROUTES` unchanged | MATCH |
| `AGENTS.md` | Archive/extend POST paths, 5-cap, no GRANT UPDATE, S-08, 404-not-403, `/runs` public | MATCH |
| `context/foundation/prd.md` | Guardrails + US-01 Then: manual archive / extend ≤ 6h / 5-cap; no 1-hour auto-archive | MATCH |

Unplanned product code: none besides the implied `timeZone` prop and skipping map/friend load when already at cap. Extra paths (`plan.md` Progress, `crew-decisions.md`) are 10x workflow artifacts.

Phase 2 files (`run-lifecycle.ts`, services, create API) unchanged in this commit — HTTP/UI sits on those RPCs and the 5-cap string. `Welcome.astro` still `listActiveRuns(..., { publicOnly: true })`. Player Incoming/Recent still split in `listPlayerProfileRuns` with Recent href gated by `canOpenArchivedRunDetail`.

### Contract checklist (plan vs code)

- Organizer/admin archive and organizer extend are cookie-session POST only (`export const POST`). Invalid UUID → `commentInvalidRun`. No session → `commentUnauthorized` (JSON 401 + `signIn`; HTML redirect to sign-in).
- Middleware banned POST gate still applies to all `/api/*` except `/api/auth/` — no exemption for `/api/runs/{id}/archive`, `/extend`, or `/api/admin/runs/{id}/archive`.
- `RunError.message` goes through `runFail` (opaque `?error=`). Other errors `console.error` + fixed strings. Matches lessons.md (no PostgREST in redirects).
- Extend hours validated at the HTTP boundary **and** in SQL/`extendRun`. Same fixed invalid-hours copy as the service.
- Admin archive is not an extend path. Non-admin JSON 403 / redirect `/` matches Delete. RPC still `not_found` for non-owner non-admin.
- Organizer island: Archive always (when shown); Extend only in-progress and not yet extended; confirm mentions Dashboard → Past (archive) and leave-in-N-hours (extend); 401 → `signIn`.
- Admin island: “Archive run” above Delete; confirm does not say “delete”; destructive Delete copy unchanged.
- Admin who is also organizer may see Archive twice — accepted.
- `/runs/new` at cap: same string as create API; form not rendered; create POST still has Phase 2 dual-defense if raced.
- `PROTECTED_ROUTES` is still `["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile", "/clans/new"]` plus `/runs/{id}/edit`. No `/runs` prefix.
- Audience-active / 5-cap / DEFINER-only stamp columns documented in AGENTS.md Hard Rules.

### Automated verification (re-run this review)

| Item | Result |
|------|--------|
| 3.1 `npm run lint` | PASS (exit 0; 0 errors; existing warnings only, including expected `console.error` on the new archive/extend routes) |
| 3.2 `npm run build` | PASS |
| 3.3 AGENTS.md archive/extend POST + 5-cap; `PROTECTED_ROUTES` does not prefix-protect `/runs` | PASS — Hard Rules paragraph; middleware L6 unchanged |
| 3.4 `prd.md` Guardrails / US-01 Then no longer claim a 1-hour auto-archive | PASS |
| 3.5–3.12 Manual | pending / YOLO skip |

## Lessons (priors)

- Opaque `?error=`: archive/extend/admin-archive use `runFail(err.message)` only for `RunError`; infrastructure paths log and use fixed copy.
- Stale-docs: AGENTS.md + Guardrails/US-01 Then updated in this change. FR-013 left on purpose (v1 FR freeze).
- Dual-defense 5-cap: UI hide + API pre-check + SQL trigger unchanged from Phase 2.
- Pattern: new routes mirror `src/pages/api/admin/runs/[id]/delete.ts`; island mirrors `AdminRunControls` (`fetchFormJson`, confirm, `ServerError`).
