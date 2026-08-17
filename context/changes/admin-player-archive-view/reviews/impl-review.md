<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Admin player archive view Implementation Plan

- **Plan**: context/changes/admin-player-archive-view/plan.md
- **Scope**: Phase 1–2 of 2 (full plan)
- **Date**: 2026-08-17
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: aeca0db (p1), 62a1627 (p2)

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

Product files across `aeca0db` + `62a1627`: `src/lib/services/admin.ts`, `src/pages/admin/users/[id].astro` (new), `src/pages/admin/index.astro`, `src/lib/services/runs.ts`, `src/pages/runs/[id].astro`, `README.md`, `AGENTS.md`. Same commits also seeded/updated the change folder, phase-1 review, and roadmap S-09 `in-progress` — expected 10x artifacts, not product-scope extras.

`history.astro` last commit is `0c09984` (S-07) — not in this diff. No `/players/{id}`. No new migration. `PROTECTED_ROUTES` unchanged (`/admin` prefix already covers `/admin/users/{id}`). No roster/organizer links.

Banner next to `AdminRunControls` on archived detail is extra vs the original Phase 2 file list. Crew Lead applied plan-review F1 during implement — expected, not scope creep.

Phase interaction: profile cards to `/runs/{id}` now load for an unseated admin (the planned Phase 1→2 dependency). S-07 guest/member 404 is preserved because the third attempt is `isAdmin`-gated.

Prior phase reviews (`impl-review-phase-1.md`, `impl-review-phase-2.md`) both APPROVED with 0 findings. This full sweep re-read product files, re-ran lint/build, and found no new drift.

### Plan vs actual

| Planned item | Verdict |
|--------------|---------|
| `getProfileForAdmin`: `isUuid` → null; missing row → null; select `id, nickname` only; DB error → `AdminError` + `console.error` | MATCH |
| `/admin/users/{id}`: middleware-gated; null profile → 404 “not found”; nickname `"—"`; monospace id; `← Users` → `/admin` | MATCH |
| Archive list via `listArchivedRunsForParticipant(supabase, profile.id)` only on this admin page | MATCH (other caller remains `history.astro` with `user.id`) |
| Empty: “No past runs” about **this player**; cards copy `/runs/history` facts + link `/runs/{id}`; no filter | MATCH |
| List load failure: log raw; inline friendly string (no PostgREST in body) | MATCH (`Could not load past runs.`) |
| Nickname cells on `/admin` link including `"—"`; id column plain; optional subtitle hint | MATCH |
| README step 4 + AGENTS.md `/admin` prefix sentence | MATCH |
| No ban/verify/role chips on profile; no roster/organizer links; no new RLS/migration | MATCH |
| `getArchivedRunForAdmin`: `!isUuid` → null; `RUN_SELECT` by id; missing → null; `mapArchivedRunRow` (null if still active) | MATCH |
| Do not call `getOwnParticipation`; do not change `getArchivedRunForParticipant` | MATCH (`runs.ts:309-310` still `own?.status !== "confirmed"`) |
| Comment that callers must already be admin (organizer RLS would leak S-08) | MATCH |
| Compute `isAdmin` from `locals.profile` **before** the fetch | MATCH (`[id].astro:31`) |
| Sequence: `getActiveRunById`; if null and `user`, participant loader; if still null and `isAdmin`, admin loader; else `pageError = "missing"` | MATCH |
| 404 copy unchanged (“missing or no longer active”) | MATCH |
| Archived mode omits `RunParticipantActions` and pending/denied fetches | MATCH (`user && !archived`) |
| `AdminRunControls` remains `isAdmin &&` page loaded (including newly visible archived runs) | MATCH |
| Back link: participant-archive hit → `/runs/history` “← Past runs”; admin-only hit → `/admin` “← Admin” | MATCH |
| Invalid UUID still 404, not 500 (`isUuid` on all three loaders; page maps null → missing) | MATCH |
| Plan-review F1: show `serverError` with `Banner` next to `AdminRunControls` on archived detail | MATCH (Crew Lead apply) |

### Safety & patterns

- Authz: profile sits under existing `/admin` prefix (guest → sign-in, non-admin → 404). Loader does not return `role` / `is_verified` / `is_banned`.
- `listArchivedRunsForParticipant` still filters confirmed + `!isRunActive` and sorts `starts_at` DESC. Member clients never call it with another id from this page.
- `getArchivedRunForAdmin` is page-gated, not RLS-gated. Sole call site is `if (!run && isAdmin)` after active + participant miss. A member organizer never reaches it, so `runs_select_own_organizer` cannot populate archived detail (the S-08 leak the plan named).
- Lessons.md (no raw infra in UI): profile list errors use a fixed string; delete `?error=` values are `AdminError.message` or the fixed “Could not delete this run”; Astro slot-escapes `serverError` in `Banner`.
- Cards/layout copied from `src/pages/runs/history.astro`; `getProfileForAdmin` follows `listProfilesForAdmin`; new helper mirrors `getArchivedRunForParticipant` minus the seat check.
- Delete remains admin-only at the API (`profile?.role !== "admin"` → `/`). Confirm dialog unchanged.

## Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 1.1 `src/pages/admin/users/[id].astro` exists | PASS |
| 1.2 `getProfileForAdmin` exists in `src/lib/services/admin.ts` | PASS |
| 1.3 `/admin` nickname cells link to `/admin/users/{id}` | PASS — `src/pages/admin/index.astro:95` |
| 1.4 `npm run lint` | PASS — exit 0; 18 `no-console` warnings (0 errors); planned `console.error` on profile loader/page |
| 1.5 `npm run build` | PASS — `astro build` complete |
| 2.1 `getArchivedRunForAdmin` exists; `getArchivedRunForParticipant` still requires a confirmed seat | PASS — `runs.ts:329-345` new helper; `runs.ts:309-310` still `own?.status !== "confirmed"`; only other call site remains `[id].astro` |
| 2.2 `[id].astro` calls the admin loader only when `isAdmin` | PASS — `if (!run && isAdmin) { run = await getArchivedRunForAdmin(...) }` |
| 2.3 `npm run lint` | PASS (same run as 1.4) |
| 2.4 `npm run build` | PASS (same run as 1.5) |

## Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 1.6 Nickname opens profile; list is that player's confirmed archived runs, newest first | `[ ]` | YOLO skipped (human-action). Code matches the contract. |
| 1.7 Known player, zero archives: empty “no past runs” (not 404) | `[ ]` | YOLO skipped. Empty branch is distinct from `pageError === "missing"`. |
| 1.8 Invalid UUID and unknown id: HTTP 404 | `[ ]` | YOLO skipped. `isUuid` miss / missing row → `pageError = "missing"` + status 404. |
| 1.9 Banned player with archive: profile + list still load | `[ ]` | YOLO skipped. No `is_banned` filter on `getProfileForAdmin`. |
| 1.10 Guest → sign-in; member → 404 | `[ ]` | YOLO skipped. Middleware unchanged; residual risk. |
| 1.11 Member `/runs/history` unchanged | `[ ]` | `history.astro` not in the diff. |
| 1.12 Card click without a seat may 404 until Phase 2 | `[ ]` | Superseded by Phase 2; unseated admin now hits `getArchivedRunForAdmin`. |
| 2.5 Admin who did not play: archived `/runs/{id}` is read-only with Delete run | `[ ]` | YOLO skipped. Static: admin third attempt + `!isArchived` omits mutations; `AdminRunControls` renders. |
| 2.6 Guest and non-confirmed member: archived URL still 404 | `[ ]` | YOLO skipped. Guests skip participant loader; members miss seat then skip admin branch. Residual risk. |
| 2.7 Admin who was confirmed: opens; back link is Past runs | `[ ]` | YOLO skipped. Participant hit sets `archivedSource = "participant"` before admin attempt. |
| 2.8 Admin-only bypass: back link is Admin | `[ ]` | YOLO skipped. Admin hit sets `archivedSource = "admin"` → `/admin`. |
| 2.9 Active detail/mutations and `/runs/history` unchanged | `[ ]` | `history.astro` not in the diff. Active path still `getActiveRunById` first; mutations still `user && !archived`. |
| 2.10 Organizer who left (member): archived URL still 404 | `[ ]` | YOLO skipped. No confirmed seat → participant null; `isAdmin` false → no admin loader. Residual risk. |

Do not REJECT solely for unchecked manuals (YOLO human-action skip). Automated criteria all pass.

## Findings

None.

## Residual risk

Progress 1.6–1.12 and 2.5–2.10 were not exercised in a browser (YOLO human-action skip). Highest residual: guest/member/left-organizer 404 matrix on `/admin/users/{id}` and archived `/runs/{id}` (static gates look correct; not click-tested), and the back-link split (participant vs admin-only). Delete `?error=` Banner is new on archived detail; happy-path delete still redirects to `/runs?notice=`.

## change.md

Status stamped `impl_reviewed` (full plan reviewed; all automated phases done).

## Proceed

YOLO Done path: report saved; no triage. Next stage is archive (only manuals remain).
