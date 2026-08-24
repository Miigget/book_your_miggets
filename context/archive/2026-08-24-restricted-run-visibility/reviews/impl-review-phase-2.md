<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Restricted run visibility Implementation Plan

- **Plan**: context/changes/restricted-run-visibility/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-08-24
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 6e4bdbc (plus uncommitted plan.md Progress SHA write-back)

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

## Evidence (phase 2)

### Plan vs diff (6e4bdbc)

- **In plan and in diff**: `src/lib/services/runs.ts`, `src/pages/api/runs/index.ts`, `src/pages/api/runs/[id]/index.ts`, `src/components/runs/CreateRunForm.tsx`, `src/pages/runs/new.astro`, `src/pages/runs/[id]/edit.astro`. All MATCH.
- **In diff but not in phase 2 Changes Required**: `plan.md` Progress checkboxes; `reviews/impl-review-phase-1.md`. Benign process artifacts. Extra service helpers (`parseInviteeIds`, `listPublicNicknamesByIds`, `createInviteOnlyRun`, `setRunVisibilityAndInvites`, shared `RESTRICTED_VISIBILITY_UNVERIFIED`) implement the contract, not new product surface.
- **In plan but not in diff**: none. No `sync_run_invites`, no `updateRun` then RPC, no Phase 3 list/landing/`publicOnly`/`AGENTS.md` work, no comment-ACL widening.

Uncommitted working tree also has plan.md Progress SHA suffixes (`— 6e4bdbc`) plus `crew-decisions.md` / `roadmap.md` process writes. Not treated as drift.

### Contract checks

- `visibility` is on `RUN_SELECT` / `RunRow` / `RunListItem` / `RunDetail`. `VISIBILITIES` + `isVisibility` sit beside `isJoinMode`. `UpdateRunInput` always patches `visibility`; `updateRun` refuses `invite_only` and does not gate visibility on `joinModeLocked`.
- Invite-only create calls `create_invite_only_run` only. Invite-only edit calls `set_run_visibility_and_invites` instead of `updateRun` (same prepared patch columns; `p_join_mode` omitted when locked). Public/friends-only keep `.insert()` / `updateRun` with no invite-sync statement.
- `invite_list_empty` / `invitee_not_friend` (plus `invitee_is_organizer` / `run_not_found`) map to `RunError`. New invitees must be current friends; snapshot ids may remain. App-level check uses `public_friendships`; RPC still enforces `are_friends` for newcomers.
- Create and edit APIs parse `visibility` (default `public`) and `invitee_ids` via `parseInviteeIds` / `FormData.getAll`. Unverified + non-public → same `RESTRICTED_VISIBILITY_UNVERIFIED` (`"Verify your account to create friends-only or invite-only runs"`). Invite-only with `<1` id fails before the DB. `?error=` uses `RunError.message` or fixed copy; raw PostgREST is `console.error` only (lessons.md).
- `CreateRunForm`: `friends` prop; visibility `<select>` next to join mode; invitee `invitee_ids` checkboxes when invite-only; unverified create posts hidden `visibility=public` (select omitted); client validate invite-only ≥1; visibility not locked after seats. Edit page passes `isVerified={false}` for the nickname gate and still shows the visibility control (`canChooseVisibility = isEdit || isVerified`).
- `new.astro` loads `listPublicFriends` only when verified. `edit.astro` loads friends, `run.visibility`, `listRunInviteeIds`, then `public_profiles` nicknames for leftover snapshot ids (`listPublicNicknamesByIds`, same `id, nickname` select as `listPublicFriends`) and merges into `friends`. Leftovers render as nickname or "Unknown player", not raw UUIDs.
- Known expected (not flagged): leftover `run_invites` after switching away from invite-only; Phase 3 still owns list sections / landing `publicOnly` / card badges.

### Automated verification

- **2.1** PASS — create `src/pages/api/runs/index.ts:86-90` and edit `src/pages/api/runs/[id]/index.ts:63-67` share `RESTRICTED_VISIBILITY_UNVERIFIED`; both parse `visibility` + `parseInviteeIds`.
- **2.2** PASS — form posts `name="visibility"` (or hidden `public` when unverified create) and `name="invitee_ids"` when invite-only; unverified create cannot choose restricted in the UI.
- **2.3** PASS — `updateRun` always includes `visibility` in the patch; invite-only edit goes to `setRunVisibilityAndInvites` only (`[id]/index.ts:85-89`). No `sync_run_invites`.
- **2.4** PASS — `npm run lint` exit 0 (0 errors; pre-existing `no-console` warnings only, including new `console.error` on mapped write failures).
- **2.5** PASS — `npm run build` Complete.
- **2.15** PASS — `edit.astro:60-63` leftover ids → `listPublicNicknamesByIds` → merged `friends` prop.

### Manual verification

Progress rows **2.6–2.14** and **2.16** remain `- [ ]`. YOLO skipped UI click-through; unchecked is pending, not rubber-stamping. Not treated as Success Criteria FAIL.

### Phase 1 interaction

Phase 2 only consumes the Phase 1 INVOKER RPCs and `runs_update_own` verified WITH CHECK. No policy/helper cycle introduced. Carrying `visibility` on list DTOs does not yet section `/runs` (Phase 3).
