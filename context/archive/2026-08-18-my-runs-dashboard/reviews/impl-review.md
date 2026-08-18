<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: My-runs dashboard Implementation Plan

- **Plan**: context/changes/my-runs-dashboard/plan.md
- **Scope**: Phase 1–3 of 3 (full plan)
- **Date**: 2026-08-18
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: 38a3ac9 (p1), d00e53b (p2), 113597c (p3), 2b21e40 (epilogue)

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

Product files across `38a3ac9` + `d00e53b` + `113597c`: `src/lib/services/runs.ts`, `src/pages/dashboard.astro`, `src/pages/runs/[id].astro`. Epilogue `2b21e40` stamped Progress SHAs and set `change.md` to `implemented`. Same commits also seeded/updated the change folder (plan, brief, plan-review, crew-decisions) — expected 10x artifacts, not product scope creep.

Not in the product diff (and must stay that way): `src/pages/runs/history.astro`, `src/pages/runs/index.astro`, `src/middleware.ts`, `src/components/Topbar.astro`, `getArchivedRunForParticipant` body, any `supabase/migrations/*`. No new route. No Vitest.

Phase interaction: Phase 2 Past cards deep-link to `/runs/{id}`; Phase 3 organizer loader makes unseated archived cards open instead of 404 (the planned mid-loop window is closed). Seated organizers still hit the participant loader first (History back link). Cross-phase assumptions from p1/p2 hold.

Prior phase reviews (`impl-review-phase-1.md`, `impl-review-phase-2.md`, `impl-review-phase-3.md`) all APPROVED with 0 findings. This full sweep re-read product files, re-ran lint/build, and found no new drift.

### Plan vs actual

| Planned item | Verdict |
|--------------|---------|
| `listRunsForOrganizer(supabase, userId)` → `{ active: OrganizerRunListItem[]; archived: ArchivedRunListItem[] }` | MATCH (`runs.ts:291-339`) |
| `OrganizerRunListItem` = `RunListItem` + `pendingCount` | MATCH (`runs.ts:46-48`) |
| Query `RUN_SELECT` + `.eq("organizer_id", userId)` — not from `run_participants` | MATCH (`runs.ts:296`) |
| Split with `isRunActive`; active `starts_at` ASC, archived DESC | MATCH (`runs.ts:307-312`) |
| `confirmedCountsForRuns` on both subsets; pending head-count only for active `approval_required` | MATCH (`runs.ts:314-324`) |
| Map active with `mapRunRow` (drop unexpected archived), archived with `mapArchivedRunRow` | MATCH |
| Empty ownership → `{ active: [], archived: [] }`; DB error → throw | MATCH |
| Leak-guard comments: history stays membership-based; organizer inventory is a dedicated loader | MATCH (comments only on participant/admin helpers) |
| `/dashboard`: Layout + cosmic + Topbar; SSR `listRunsForOrganizer(supabase, user.id)` | MATCH |
| Title “Your runs”; Active then Past sections | MATCH |
| Zero rows: one hero empty + `/runs/new` CTA; else both headings + compact “None right now” | MATCH |
| Load failure: `console.error` raw; friendly “Could not load your runs.” (not `err.message`) | MATCH (`dashboard.astro:21-23`) |
| Card facts (title, time, filled, min points, join, map); in-progress / archived labels | MATCH |
| Pending `dl` row on active `approval_required` (including 0); omitted on auto-join and archived | MATCH |
| Cards link `/runs/{id}`; no filter; no accept/deny; stub sign-out removed | MATCH |
| No extra `/runs` Dashboard CTA; Topbar + `PROTECTED_ROUTES` unchanged | MATCH |
| `getArchivedRunForOrganizer`: `!isUuid` → null; by-id `RUN_SELECT`; missing → null | MATCH (`runs.ts:418-432`) |
| **`organizer_id !== userId` → null** (do not rely on RLS) | MATCH (`runs.ts:433`) — CRITICAL |
| `mapArchivedRunRow`; no `getOwnParticipation`; participant helper body unchanged | MATCH |
| Comment: signed-in viewer required; check mandatory because admin RLS | MATCH (`runs.ts:412-416`) |
| Sole call site: `[id].astro` after participant, before admin, only if `user` | MATCH (`[id].astro:51-62`) |
| `archivedSource` includes `"organizer"`; back link Dashboard vs History vs Admin | MATCH (`[id].astro:99-102`) |
| Archived mode omits `RunParticipantActions` and pending/denied fetches | MATCH (`[id].astro:67-79`, `252-269`) |
| `AdminRunControls` unchanged (`isAdmin` && page loaded) | MATCH |
| Invalid UUID 404 not 500; active back link stays `/runs` | MATCH |
| Do not call organizer loader from `/runs/history` | MATCH (`history.astro` still `listArchivedRunsForParticipant` only) |

### Safety & patterns

- **Authz (CRITICAL):** `getArchivedRunForOrganizer` fetches by id (admin RLS can return any row) then returns null unless `data.organizer_id === userId`. Guests skip both archived user loaders. Unrelated members miss participant (no confirmed seat) then miss organizer (id mismatch) → 404 unless admin. Admin-only bypass stays last.
- **List leak guard:** `listRunsForOrganizer` filters `.eq("organizer_id", userId)` and does not start from membership. Leave-team cannot hide created runs. `listArchivedRunsForParticipant` still starts from confirmed `run_participants` — `/runs/history` and admin player profile stay participant-only.
- No `service_role`, no new policy, no migration. Pending SELECT uses existing `run_participants_select_organizer`. Auto-join ids are omitted from `pendingCountsForRuns`.
- Lessons.md: dashboard logs raw and shows a fixed string. Does **not** copy `history.astro`’s `err.message` echo.
- XSS: Astro interpolates card fields (no `set:html`).
- N+1 head-count copies `confirmedCountsForRuns` as planned; no pagination (locked).
- Pattern: dashboard chrome matches history; organizer loader mirrors `getArchivedRunForAdmin` plus the ownership check the admin helper omits. Loader order is the S-09 sequence with one inserted attempt.
- Scope “NOT doing”: no inbox, no organizer edit/cancel/delete UI, no filters, no history reuse, no hide-Dashboard-until-first-create.

## Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 1.1 `listRunsForOrganizer` exists and filters by `organizer_id` (not confirmed membership) | PASS — `runs.ts:291-296`; no `run_participants` membership query |
| 1.2 Pending counts queried only for active `approval_required` runs | PASS — `pendingIds` from `activeRows` + `join_mode === "approval_required"` |
| 1.3 `listArchivedRunsForParticipant` / `getArchivedRunForParticipant` unchanged | PASS — comment-only on those helpers; bodies still membership-gated |
| 1.4 / 2.3 / 3.4 `npm run lint` | PASS — exit 0; 19 `no-console` warnings (0 errors); one planned warning at `dashboard.astro:22` |
| 1.5 / 2.4 / 3.5 `npm run build` | PASS — `astro build` complete |
| 2.1 `dashboard.astro` calls `listRunsForOrganizer`; stub welcome/sign-out gone | PASS — `dashboard.astro:20`; no sign-out form |
| 2.2 Topbar still links `/dashboard`; middleware still lists `/dashboard` | PASS — `Topbar.astro:23`; `middleware.ts:4` |
| 3.1 `getArchivedRunForOrganizer` returns null when `organizer_id` does not match | PASS — `runs.ts:433` |
| 3.2 `[id].astro` calls it only when `user` is set, after participant, before admin | PASS — `[id].astro:51-62` |
| 3.3 `getArchivedRunForParticipant` still returns null without a confirmed seat | PASS — `runs.ts:397-398` |

## Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 1.6 Function returns viewer’s created active + archived, including leave-team, not join-only | `[ ]` | YOLO skipped (human-action). Query is ownership-only. Residual risk, not a finding. |
| 1.7 Auto-join `pendingCount === 0`; approval-required pending increments | `[ ]` | YOLO skipped. `pendingIds` excludes auto-join; `?? 0` fills the rest. Residual risk. |
| 2.5 Guest `/dashboard` → `/auth/signin` | `[ ]` | YOLO skipped. Middleware still redirects unauthenticated `PROTECTED_ROUTES`. Residual risk. |
| 2.6 Zero created runs: one empty + Create CTA; Topbar Dashboard still visible | `[ ]` | YOLO skipped. `hasCreatedRuns` hero branch; Topbar unchanged. Residual risk. |
| 2.7 Mixed lifecycles: Active soonest-first, Past newest-first; labels | `[ ]` | YOLO skipped. Sort in loader; labels in markup. Residual risk. |
| 2.8 Only-active or only-past: both headings; compact empty line | `[ ]` | YOLO skipped. Both `<section>`s render whenever `hasCreatedRuns`. Residual risk. |
| 2.9 Approval-required shows pending; auto-join does not | `[ ]` | YOLO skipped. Markup gates pending on `joinMode === "approval_required"`. Residual risk. |
| 2.10 Active card opens `/runs/{id}` (approve/leave unchanged) | `[ ]` | YOLO skipped. `href={`/runs/${run.id}`}`; detail mutations still `!isArchived`. Residual risk. |
| 2.11 Unseated archived card may 404 until Phase 3 | `[ ]` | Superseded by Phase 3; organizer loader now resolves those cards. |
| 2.12 `/runs/history` still only confirmed-participant archives | `[ ]` | YOLO skipped. `history.astro` / `listArchivedRunsForParticipant` not in the product diff. Residual risk. |
| 2.13 Banned user can still GET the dashboard | `[ ]` | YOLO skipped. Ban gate remains POST `/api` only. Residual risk. |
| 3.6 Unseated organizer (leave-then-archive): Past card opens read-only; back link Dashboard | `[ ]` | YOLO skipped. `archivedSource === "organizer"` → `/dashboard`; actions gated on `!isArchived`. Residual risk. |
| 3.7 Seated organizer: opens; back link Past runs | `[ ]` | YOLO skipped. Participant loader runs first; source stays `"participant"`. Residual risk. |
| 3.8 Guest and unrelated member: archived URL still 404 | `[ ]` | YOLO skipped. Guests skip user loaders; unrelated fail seat + `organizer_id`. Residual risk. |
| 3.9 Admin who did not organize and did not play: admin bypass; back link Admin | `[ ]` | YOLO skipped. Organizer loader null on id mismatch; admin last. Residual risk. |
| 3.10 Active detail/mutations unchanged | `[ ]` | YOLO skipped. Active path still `getActiveRunById`; `RunParticipantActions` still `!isArchived`. Residual risk. |
| 3.11 `/runs/history` unchanged (leave-team organizer still absent) | `[ ]` | YOLO skipped. History still membership-based. Residual risk. |

Do not REJECT solely for unchecked manuals (YOLO human-action skip). Automated criteria all pass.

## Findings

None.

## Residual risk

Progress 1.6–1.7, 2.5–2.13, and 3.6–3.11 were not exercised against a running app (YOLO human-action skip). Highest residual: leave-then-archive 404/back-link matrix (unseated organizer Dashboard vs seated History vs guest/unrelated 404 vs admin-only Admin) and empty-state vs two-section branching. Static gates match the plan; not session-tested.

## change.md

Status stamped `impl_reviewed` (full plan reviewed; all automated phases done).

## Proceed

YOLO Done path: report saved; no triage. Next stage is archive (only manuals remain).
