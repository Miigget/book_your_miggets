<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clan-only runs Implementation Plan

- **Plan**: `context/changes/clan-runs/plan.md`
- **Scope**: Phase 2 of 3
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

Phase 1 committed as `9547b93`. Reviewed `git diff HEAD` vs Phase 2 file list. Unrelated dirty ignored (`shape-notes.md`, `comment-screenshots/`, `manual-archive-and-extend/`, `health-check.md`, `prd-v2.md`, `stack-assessment.md`, S-20/S-24 roadmap flips). Ritual docs (`plan.md` Progress 2.1–2.5 `[x]`, `crew-decisions.md` p2 line) are expected implement stamps, not product scope.

| Path | Plan | Diff | Verdict |
|------|------|------|---------|
| `src/lib/services/runs.ts` | yes | modified | MATCH — `VISIBILITIES` + `clan_only`; updated `RESTRICTED_VISIBILITY_UNVERIFIED`; `CLAN_ONLY_OWNER_REQUIRED`; `updateRun` still throws only on `invite_only` |
| `src/lib/services/clans.ts` | yes | modified | MATCH — `userOwnsClan` SELECT `clans.id` where `owner_id = userId` `maybeSingle`; `ClanError`/`CLAN_LOAD_FAILED`; not `getClanMembershipForUser` |
| `src/pages/api/runs/index.ts` | yes | modified | MATCH — unverified gate then owner gate; `clan_only` uses `.insert({ … visibility })`; invite RPC only for `invite_only`; no `insertError.message` in `?error=` |
| `src/pages/api/runs/[id]/index.ts` | yes | modified | MATCH — same gates; `invite_only` → `setRunVisibilityAndInvites`; else including `clan_only` → `updateRun` |
| `src/components/runs/CreateRunForm.tsx` | yes | modified | MATCH — `ownsClan?: boolean` default false; option iff `ownsClan \|\| edit?.visibility === "clan_only"`; clan hint; `showInvitePicker` still `invite_only` only; unverified hidden `visibility=public` |
| `src/pages/runs/new.astro` | yes | modified | MATCH — verified path `Promise.all` friends + `userOwnsClan`; no extra `public_friendships` for the owner fact |
| `src/pages/runs/[id]/edit.astro` | yes | modified | MATCH — `userOwnsClan` in existing `Promise.all`; `ownsClan` passed; `isVerified={false}` unchanged; `edit.visibility` is the run’s current value |

Phase 3 files (`run-list-sections.ts`, `src/pages/runs/index.astro`, `AGENTS.md`, `middleware.ts`) are untouched.

## Automated verification (re-run this review)

| ID | Check | Result |
|----|--------|--------|
| 2.1 | `isVisibility("clan_only")` true; invite-only create/edit still RPC-only | PASS — `VISIBILITIES` includes `clan_only`; create RPC only inside `visibilityRaw === "invite_only"`; edit RPC only inside that same branch |
| 2.2 | Create/edit API unverified vs non-owner vs owner gates | PASS (code path) — unverified non-public → `RESTRICTED_VISIBILITY_UNVERIFIED` before owner check; verified non-owner `clan_only` → `CLAN_ONLY_OWNER_REQUIRED`; owner insert/`updateRun` after gates. No live HTTP POST (no test runner; YOLO) |
| 2.3 | CreateRunForm hides clan_only unless `ownsClan` or edit visibility is `clan_only`; no invitee fieldset | PASS — `showClanOnlyOption`; `showInvitePicker` is `invite_only` only |
| 2.4 | `npm run lint` | PASS (0 errors; 170 pre-existing `no-console` / `class:list` warnings) |
| 2.5 | `npm run build` | PASS |

## Manual verification

- [ ] 2.6–2.10 create/edit/404 click-through — correctly left unchecked. YOLO residual risk (crew-decisions: skipped).

## Contract checks

- Gate order: `isVisibility` → unverified non-public → `clan_only` owner → invitee-list. Unverified + `clan_only` never returns the owner string.
- `userOwnsClan` mirrors `getClanMembershipForUser` (`isUuid` early false, `maybeSingle`, log + `ClanError(CLAN_LOAD_FAILED)`). Reads `clans`, not `clan_members`. `clans_select_authenticated` is `USING (true)` so the owner lookup is not RLS-blocked.
- Create `clan_only` shares the friends-only `.insert({ visibility: visibilityRaw })` branch. Edit `clan_only` shares `updateRun`. `updateRun` still throws on `invite_only` only.
- Infrastructure errors: `ClanError` → generic `"Could not create this run"` / `"Could not save this run"` after `console.error`; insert still maps constraint errors then generic fail. No PostgREST `Error.message` in `?error=`.
- Unverified create still posts hidden `visibility=public`. Clan-only option is not a dead control for non-owners on create.
- Transitional catalog (Phase 3): `partitionActiveRuns` still keys Public on `visibility === "public"` only, so clan-only never lands in Public. Non-admin members/organizer will not see a Clan bucket until Phase 3; admin leftovers already fall through to Restricted. Planned, not drift.
- Phase 1 assumptions held: `formatVisibility` `clan_only` case unchanged; migrations / generated types untouched; `VISIBILITIES` now includes `clan_only` in the same diff as the owner gate (the Phase 1 deferral).
