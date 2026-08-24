<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Restricted run visibility Implementation Plan

- **Plan**: context/changes/restricted-run-visibility/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-24
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: e24401c (phase 3) + 5b4eafb (epilogue Progress / change.md)

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

## Evidence (phase 3)

### Plan vs diff (e24401c, epilogue 5b4eafb)

- **In plan and in diff**: `src/lib/run-list-sections.ts` (new), `src/pages/runs/index.astro`, `src/components/Welcome.astro`, `src/lib/services/runs.ts` (`publicOnly` + `formatVisibility`), `src/components/runs/ActiveRunCard.astro`, `src/pages/runs/[id].astro`, `src/pages/dashboard.astro`, `AGENTS.md`. All MATCH.
- **In diff but not in phase 3 Changes Required**: `plan.md` Progress SHA write-back; `reviews/impl-review-phase-2.md`; epilogue `change.md` `implemented`. Benign process artifacts. `formatVisibility` is the join-mode twin needed by the card/detail/dashboard contract, not new product surface.
- **In plan but not in diff**: none. No visibility URL filter, no 403, no comment-ACL widening, no `PROTECTED_ROUTES` prefix on `/runs`, no Friends/Invited on landing, no `publicOnly` on signed-in `/runs`, no `getActiveRunById` app-side audience filter.

### Contract checks

- `partitionActiveRuns` Public is `visibility === "public"` only. Friends is `friends_only` AND (organizer OR `public_friendships` live friend OR confirmed). Invited is `invite_only` AND (organizer OR `run_invites` OR confirmed). Restricted is leftover non-public when `isAdmin`. `continue` after Friends/Invited so a friend-admin is Friends-only (no duplicate). Non-admin leftovers are dropped (dual defense if RLS ever leaked).
- Guest `/runs`: `listActiveRuns(..., { publicOnly: true })` + `emptyRunListViewerFacts()` (not admin). Signed-in `/runs`: `listActiveRuns(supabase, filters)` with no third arg. Welcome always `{ publicOnly: true }` then `.slice(0, 6)`. Only callers of `listActiveRuns` are Welcome and `/runs`.
- Viewer facts load in one batch (`public_friendships`, `run_invites` for the viewer, confirmed `run_participants` for listed ids) — not per card. `isAdmin` from `Astro.locals.profile?.role === "admin"`. Empty Friends / Invited / Restricted headings omitted; page empty states unchanged (`No active runs yet` / `No runs match these filters`). Chrome is dashboard `flex flex-col gap-10` + `h2`. Headings Public / Friends / Invited / Restricted; Restricted subtitle "Guests cannot see these."
- Detail 404 copy unchanged (`Run not found` / `This run is missing or no longer active.`); `Astro.response.status = 404` on missing; no 403 on the page. `canReadComments` still confirmed / archived participant / organizer / admin (diff only added the Visibility `<dl>` line). `getActiveRunById` stays unfiltered. `<title>` still uses `displayTitle` only when `run` loaded.
- Cards/detail/dashboard show visibility with the same `<dl>` tone as join mode / "In progress". `PROTECTED_ROUTES` still has no `/runs` prefix.
- AGENTS.md hard-rule bullet: 404 not 403; `/runs` publicly routable; Public vs Friends vs Invited vs admin Restricted; do not mix restricted into Public; do not widen comment read ACL.

### Automated verification

- **3.1** PASS — `partitionActiveRuns` never puts `friends_only` / `invite_only` into `publicRuns`; `/runs` renders those arrays under Public / Friends / Invited / Restricted.
- **3.2** PASS — `Welcome.astro:13` always `publicOnly: true`; guest `/runs` `index.astro:32` always does; signed-in `index.astro:31` never does.
- **3.3** PASS — `[id].astro:140-141` 404 copy unchanged; `canReadComments` at `:92-93` is not "anyone who can view".
- **3.4** PASS — `src/middleware.ts:6-7` still `/dashboard`, `/runs/new`, `/admin`, `/runs/history`, `/profile` plus edit regex; `/runs` list and `/runs/{id}` stay open.
- **3.5** PASS — `npm run lint` exit 0 (0 errors; pre-existing `no-console` warnings only, plus the new `console.error` in `loadRunListViewerFacts` matching service logging).
- **3.6** PASS — `npm run build` Complete.

### Manual verification

Progress rows **3.7–3.15** remain `- [ ]`. YOLO skipped UI click-through; unchecked is pending, not rubber-stamping. Not treated as Success Criteria FAIL.

### Phase 1 / 2 interaction

Phase 3 only presents rows RLS already returns (plus `publicOnly` dual defense on guest/landing). Partition does not widen SELECT. Comment read ACL and mutation 404 copy are untouched (`comments.ts` / `participants.ts` not in the diff). Carrying `visibility` on list DTOs (Phase 2) is what cards/sections consume. No policy/helper cycle introduced.
