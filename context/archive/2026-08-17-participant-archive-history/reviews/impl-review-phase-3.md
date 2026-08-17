<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Participant archive history Implementation Plan

- **Plan**: context/changes/participant-archive-history/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-17
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 0c09984 (product); 349d2bb (epilogue Progress / change.md)

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

Phase 3 product change is commit 0c09984: `src/pages/runs/history.astro` (new), dual-mode `src/pages/runs/[id].astro`, Topbar History, signed-in “Your past runs” on `/runs`, middleware `/runs/history`, and `AGENTS.md` `PROTECTED_ROUTES`. Epilogue 349d2bb only stamped Progress SHAs and `change.md` `implemented` — expected 10x artifacts, not product scope creep. `src/pages/dashboard.astro` was not touched (still the auth stub). Nested `formatReleasedOn` on `[id].astro` pre-existed; allowed.

### Planned contracts vs code

- **History list**: static `src/pages/runs/history.astro` SSR-calls `listArchivedRunsForParticipant(supabase, user.id)`. Middleware `PROTECTED_ROUTES` includes `/runs/history` (unauthenticated → `/auth/signin`). Does **not** prefix-gate `/runs`. `!supabase` → config copy; `!user` → “Authentication required.”; load errors inline (same red box as `/runs`, no new `?error=` protocol). Cards reuse `/runs` facts (title, time, filled, min points, join, map, organizer) plus **Archived** instead of In progress. Empty copy is “No past runs”, not “No active runs yet”. No GET filter form.
- **Dual-mode detail**: `getActiveRunById` first; if null **and** `user`, `getArchivedRunForParticipant(supabase, id, user.id)`; else `pageError = "missing"` HTTP 404 with unchanged “missing or no longer active” copy. Guests never call the archive loader. Invalid UUID: both loaders `isUuid` → null (Phase 2) → 404, not 500. Archived mode: details + map + confirmed roster; `RunParticipantActions` omitted (`!isArchived`); pending/denied **not fetched** (`user && !archived`); Archived status line; back link `href="/runs/history"` (active keeps `← Active runs`). `AdminRunControls` only if `isAdmin` and the page loaded — admin without a confirmed seat still 404s (no S-09 bypass).
- **Discovery**: signed-in Topbar “History” with Runs / New run / Dashboard. `/runs` signed-in text link “Your past runs” near the header; Create CTA unchanged. Guest Topbar and `/runs` have no history link.
- **Docs**: `AGENTS.md` Hard Rules now lists `/dashboard`, `/runs/new`, `/admin`, `/runs/history`. Unrelated sections untouched.

### Authz (Phase 2 loaders used as the choke point)

Organizer/admin RLS can still SELECT archived rows. Dual-mode does not treat that as enough: archive path only runs through `getArchivedRunForParticipant`, which returns null without a current confirmed row (leave-team deletes the seat). Active path still uses `getActiveRunById` (active window). Guest archived URL → 404. Matches the known Phase 3 gates.

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 3.1 `history.astro` exists; middleware lists `/runs/history` | PASS |
| 3.2 Topbar History link for signed-in users | PASS — inside `user ?` branch only |
| 3.3 `npm run lint` | PASS — exit 0; 15 pre-existing `no-console` warnings in unrelated files, 0 errors |
| 3.4 `npm run build` | PASS — `astro build` complete |
| 3.5 `AGENTS.md` `PROTECTED_ROUTES` includes `/admin` and `/runs/history` | PASS |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 3.6 Guest `/runs/history` → sign-in | `[ ]` | YOLO skipped (human-action). Residual risk, not a finding. Static: middleware `startsWith("/runs/history")` redirects when `!user`. |
| 3.7 Confirmed: list + read-only `/runs/{id}`; Archived visible | `[ ]` | YOLO skipped. Static: history uses archive list loader; archived mode omits mutations and pending fetch; Archived label on cards and detail. |
| 3.8 Guest or non-confirmed: past-grace 404 | `[ ]` | YOLO skipped. Static: guests skip archive loader; non-confirmed → `getArchivedRunForParticipant` null. |
| 3.9 Organizer who left: 404 and absent from history | `[ ]` | YOLO skipped. Static: leave-team deletes confirmed row → empty ids / detail null. |
| 3.10 Signed-in `/runs` “Your past runs”; guests do not | `[ ]` | YOLO skipped. Static: `{user && (…Your past runs…)}`; guest Topbar has no History. |
| 3.11 Active detail/mutations unchanged | `[ ]` | YOLO skipped. Static: active path still `getActiveRunById` first; `RunParticipantActions` still rendered when `!isArchived`. |
| 3.12 `/dashboard` still the auth stub | `[ ]` | YOLO skipped. Static: `dashboard.astro` unchanged (welcome + sign out only). |

## Findings

None.

## Residual risk

Progress 3.6–3.12 remain unchecked (YOLO). Static review of dual-mode 404-without-confirmed, hidden mutation CTAs / pending queue, guest-hidden History / “Your past runs”, and untouched `/dashboard` found no contract break. Postgres `now()` vs Worker `Date` skew at the grace edge is the same S-04 acceptance. Phase 1 RLS matrix (1.5–1.9) and Phase 2 loader manuals (2.5–2.8) also remain unchecked.

## Proceed

YOLO Done path: report saved; no triage. Do not start full-plan review or archive in this invocation.
