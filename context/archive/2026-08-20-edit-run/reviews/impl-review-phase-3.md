<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit an active run (S-13)

- **Plan**: context/changes/edit-run/plan.md
- **Scope**: Phase 3 of 3
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

- Plan-review **F1** applied: edit prefills `datetime-local` via `startsAtToLocalDatetime` → local `YYYY-MM-DDTHH:mm` using the shared pad helper; hidden `starts_at` still posts ISO.
- Phase 2 impl-review **F1** / `p1-capacity-when` applied in `updateRun`: select includes `max_participants`; capacity `RunError` only when posted value is distinct from stored **and** below confirmed. Client validation in `CreateRunForm` uses the same predicate. Always-on `> 0` integer check kept.
- Create behavior unchanged: `action="/api/runs"`, nickname gates (`needsNickname` / `verifiedNeedsRequest` only when `!isEdit`), future-only `starts_at`, submit “Create run”.
- Owner gate is `getOwnedActiveRunForEdit` (`organizer_id` + `isRunActive`), not `getActiveRunById`. Missing / non-owner / archived → same 404 shell and status as `runs/[id].astro`.
- Middleware: `PROTECTED_ROUTES` prefixes unchanged; `/^\/runs\/[^/]+\/edit\/?$/` extra; guests → `/auth/signin`; `/runs` not prefix-protected.
- Locked join mode: `disabled` select, `name` omitted, helper copy; server ignore from Phase 2 remains the backstop.
- Edit links: detail `isOrganizer && !isArchived`; dashboard **active** cards only; text-link styling (not a new button system).
- `AGENTS.md` lists `/runs/{id}/edit` next to `PROTECTED_ROUTES` and restates not to prefix-protect `/runs`.
- Extra `src/lib/services/runs.ts` in the Phase 3 diff is the intended p2 F1 patch plus the owner loader (plan forbade `getActiveRunById` as the gate). Not product scope creep.

## Findings

None.

## Verification

### Automated

| Check | Result |
|-------|--------|
| `npx astro sync` | Pass (types generated) |
| `npm run lint` | Pass (0 errors; 51 pre-existing `no-console` warnings; none new on Phase 3 UI files) |
| `npm run build` | Pass (`astro build` Complete; Cloudflare adapter) |

### Manual

| Progress | Result |
|----------|--------|
| 3.4–3.10 | Marked `[x]` with `02c9115`. Not re-run in-browser (YOLO). `crew-decisions.md` records curl/HTTP verification on local astro dev :4323. Residual risk: datetime-local hydration, disabled-select styling, real cookie session — same class as the implement stage. Diff evidence exists for Edit links, 404 shell, banned banner, form edit-mode, and middleware regex. |

## Plan vs diff (commits `02c9115` + epilogue `8581eae`)

- In plan and in diff: `src/middleware.ts`, `src/pages/runs/[id]/edit.astro`, `src/components/runs/CreateRunForm.tsx`, `src/pages/runs/[id].astro`, `src/pages/dashboard.astro`, `AGENTS.md` — MATCH.
- In plan, not in product diff: none.
- In diff, not in plan file list: `src/lib/services/runs.ts` — intended carry-over (p2 F1 + owner loader). Context Progress/`change.md` stamps in `8581eae` are implement ritual, not product scope creep.
