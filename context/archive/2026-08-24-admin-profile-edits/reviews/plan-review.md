<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Admin profile edits Implementation Plan

- **Plan**: context/changes/admin-profile-edits/plan.md
- **Mode**: Deep
- **Date**: 2026-08-24
- **Verdict**: SOUND
- **Findings**: 0 critical 0 warnings 0 observations (re-review after F1–F4 refine)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 9/9 existing paths ✓, 2 new API paths correctly marked (new), 8/8 symbols ✓, brief↔plan ✓

Verified existing paths: `src/lib/services/profile.ts`, `src/lib/services/admin.ts`, `src/pages/api/admin/users/[id]/verify.ts`, `src/pages/api/admin/users/[id]/ban.ts`, `src/pages/admin/users/[id].astro`, `src/pages/admin/index.astro`, `README.md`, `AGENTS.md`, `supabase/migrations/20260820071325_user_profile_identity.sql`.

New (expected missing): `src/pages/api/admin/users/[id]/nickname.ts`, `points.ts`, `points-verified.ts`, `nickname-request.ts`.

Symbols confirmed: `findProfileIdByNickname` (private, `public_profiles` + ILIKE + `nicknameKey`, `src/lib/services/profile.ts:72-91`), `getPendingNicknameRequest` (no ownership filter, throws `ProfileError`, `:143-167`), `getProfileForAdmin` (`id, nickname` only, `src/lib/services/admin.ts:34-54`), `listProfilesForAdmin` (`:20-32`), `setUserVerified` (`:90-105`, only caller `verify.ts`), `parseNickname` / `parseKogPoints` (`profile.ts:48-70`), `AdminError`, `enforce_profile_privileged_columns` (S-10 body, `supabase/migrations/20260820071325_user_profile_identity.sql:102-125`: non-admin distinct-from clear + else-restore), `nickname_change_requests_select_admin` / `update_admin` (`:85-96`), `profiles_update_own` (any own-row columns, `supabase/migrations/20260729134008_run_domain_schema.sql:172-177`), `Banner.astro` (used on `/admin`).

Brief↔plan: surface `/admin/users/{id}`, pending marker on `/admin`, direct-nick close pending, accept uniqueness, separate points vs flag, all-role trigger clear + non-admin flag restore, deny-if-any vs deny-on-missing, isolated pending try, no verify-on-null, editors for every opened player, pending-only UI, no review columns, two phases — match `plan-brief.md` and locked Crew Lead decisions.

Progress↔Phase: one `## Progress` at bottom; `## Phase 1` / `## Phase 2` titles match `### Phase N` in Progress; every Success Criteria bullet has `N.M` (1.1–1.11, 2.1–2.12); no `- [ ]` / `- [x]` outside Progress. Locked rows 1.11 (null-points service), 2.11 (hide Mark verified), 2.12 (pending-load degrade) are present.

No `docs/reference/contract-surfaces.md` (skipped).

## Locked fixes (prior REVISE)

| ID | Locked fix | In refined `plan.md`? |
|----|------------|------------------------|
| F1 | All-role `kog_points` clear + non-admin restore `old.kog_points_verified` when points unchanged | Yes — Critical Details, Phase 1 SQL (restore inside `if not is_admin()`, then all-role distinct-from clear), 1.8 / 1.9 |
| F2 | Deny-on-missing (Deny button) vs deny-if-any (Unverify) | Yes — separate `denyPendingNicknameRequestIfAny`; `denyNicknameChangeRequest` still errors; `setUserVerified(false)` deny-if-any then flip; 1.10 covers no-pending |
| F3 | Isolated pending try on player page; degrade, keep editors | Yes — Critical Details + Phase 2 contract + 2.12 |
| F4 | `setKogPointsVerified(true)` errors on null points; hide Mark verified; Unverify allowed | Yes — service fixed copy, UI hide/disable, 1.11 / 2.11 |

## Codebase verification (riskiest claims)

| Claim | Result |
|-------|--------|
| Trigger clear + restore live only in `if not is_admin()` today; `profiles_update_own` is the only SET-true lock | CONFIRMED (`20260820071325_user_profile_identity.sql:109-121`, `run_domain_schema.sql:172-177`) |
| Replacement SQL keeps restore for non-admins, moves clear to all roles, admins skip restore so Mark verified sticks | CONFIRMED against refined snippet (plan.md:82-98); order is restore-then-clear |
| `getPendingNicknameRequest` throws on PostgREST failure; archive list already degrades inline | CONFIRMED (`profile.ts:154-156`, `[id].astro:29-34`) |
| Null points + `kog_points_verified` true would render “— / Checked in-game” on `/players/{id}` | CONFIRMED (`players/[id].astro:65, 131-133`) |
| `setUserVerified` blast radius is only `/api/admin/users/[id]/verify.ts` | CONFIRMED |
| Ban/verify POST + `AdminError` + `?error=`/`?notice=` + no `window.confirm` | CONFIRMED (`verify.ts`); lessons.md `?error=` copy still followed by new API contract |

No extra callers. New APIs copy the existing admin route pattern; writes stay in `admin.ts`. No pattern proliferation.

## Findings

None. Prior F1–F4 are applied; no new CRITICAL / WARNING / OBSERVATION.

## Triage

Re-review after `/10x-plan` refine. No new findings to triage.

- **Fixed (verified in plan.md):** F1, F2, F3 (Fix A), F4 (Fix A)
- **Skipped / accepted / dismissed:** none
- **Verdict after re-review:** SOUND
