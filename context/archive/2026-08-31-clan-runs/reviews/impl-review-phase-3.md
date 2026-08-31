<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan-only runs Implementation Plan

- **Plan**: `context/changes/clan-runs/plan.md`
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

## Git scope

Phase 1 committed as `9547b93`. Phase 2 committed as `138405f`. Reviewed staged/unstaged p3 vs Phase 3 file list (`git diff --cached` + working tree). No p3 commit yet. Ignored: `77e5541` (comment-screenshots on this branch), `context/changes/comment-screenshots/`, `manual-archive-and-extend/`, `shape-notes`, `health-check`, `prd-v2`, `stack-assessment`. Ritual docs (`plan.md` Progress 3.1–3.6 `[x]`, unstaged `crew-decisions.md` p3 manual skip) are expected implement stamps, not product scope.

| Path | Plan | Diff | Verdict |
|------|------|------|---------|
| `src/lib/run-list-sections.ts` | yes | staged | MATCH — `clanRuns`; `viewerClanId` + `organizerClanByUserId`; `inClanSection` is `clan_only` and organizer **or** same clan **or** confirmed; `partitionActiveRuns` order public → friends → invited → clan → admin leftover Restricted; Public still `visibility === "public"` only |
| `src/pages/runs/index.astro` | yes | staged | MATCH — signed-in `listActiveRuns` without `publicOnly`; guests `publicOnly: true`; `hasAnyRuns` includes `clanRuns`; sections Public / Friends / Invited / **Clan** / Restricted (`"Guests cannot see these."` on Restricted only) |
| `src/middleware.ts` | yes (no-op) | untouched | MATCH — `PROTECTED_ROUTES` still `/dashboard`, `/runs/new`, `/admin`, `/runs/history`, `/profile`, `/clans/new` plus edit regex; `/runs` list and `/runs/{id}` not prefix-protected |
| `AGENTS.md` | yes | staged | MATCH — restricted 404 names friends-only / invite-only / **clan-only**; signed-in sections include **Clan**; never mix `clan_only` into Public; clan-only create is owner only (not officers) |

`loadRunListViewerFacts` 4th arg changed from `runIds: readonly string[]` to `runs: readonly RunListItem[]` so clan-only organizer ids can be derived. Sole caller is `src/pages/runs/index.astro` (updated). Intent MATCH, not extra surface.

Landing (`src/components/Welcome.astro` via `src/pages/index.astro`) still `listActiveRuns(..., { publicOnly: true })`. Unchanged; satisfies 3.2.

## Automated verification (re-run this review)

| ID | Check | Result |
|----|--------|--------|
| 3.1 | `partitionActiveRuns` never puts `clan_only` in `publicRuns`; members/organizer/confirmed in `clanRuns`; admin leftovers in Restricted | PASS (code path) — Public is `visibility === "public"` only. `inClanSection` gates Clan. Leftover non-public + `facts.isAdmin` → Restricted. First matching bucket wins (Clan before Restricted). No test runner; YOLO |
| 3.2 | Guest `/runs` and landing still `publicOnly`; signed-in `/runs` does not | PASS — `index.astro` ternary; `Welcome.astro` always `{ publicOnly: true }` |
| 3.3 | `PROTECTED_ROUTES` still does not prefix-protect `/runs` | PASS — `/runs` is not a prefix; `/runs/new` and `/runs/history` stay gated |
| 3.4 | AGENTS.md names Clan section and clan-only 404 | PASS |
| 3.5 | `npm run lint` | PASS (0 errors; 170 pre-existing `no-console` / `class:list` warnings) |
| 3.6 | `npm run build` | PASS |

## Manual verification

- [ ] 3.7–3.14 catalog / 404 / comments / dashboard click-through — correctly left unchecked. YOLO residual risk (crew-decisions: skipped).

## Contract checks

- Same-clan facts: one `clan_members` `maybeSingle` for the viewer and one `in (clan_only organizer ids)` — not an extra `public_friendships` round. Guests call `emptyRunListViewerFacts()` and never hit those queries. `clan_members_select_authenticated` / `_anon` are already `USING (true)` (world SELECT as planned).
- `inClanSection` does not treat friendship or invite snapshots as clan membership. Confirmed non-members (if RLS still returns the row) land in Clan, not Public.
- Friend-admin who is also a clan member: `clan_only` hits `inClanSection` before Restricted — no duplicate.
- Comment ACL untouched (`canReadComments` still confirmed / archived participant / organizer / admin). Unseated clan members can open detail via Phase 1 RLS but do not gain comments in this phase.
- Phase 1/2 assumptions held: `formatVisibility` `clan_only` case unchanged; owner gate / `VISIBILITIES` / create-edit APIs untouched; migrations / generated types untouched; `list_player_public_runs` not opened.

## Change.md

Not stamped `impl_reviewed` — phase review only; full review after the last phase commit. Status stays `implementing`.
