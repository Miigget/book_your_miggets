<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Clan-only runs Implementation Plan

- **Plan**: `context/changes/clan-runs/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-31
- **Verdict**: SOUND
- **Findings**: 0 critical 1 warning 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

Grounding: 16/16 existing paths ✓, 2/2 new migrations expected-absent ✓, 18/18 symbols ✓, brief↔plan ✓. `docs/reference/contract-surfaces.md` absent — check skipped.

Existing paths listed: `src/lib/services/runs.ts`, `src/lib/services/clans.ts`, `src/pages/api/runs/index.ts`, `src/pages/api/runs/[id]/index.ts`, `src/components/runs/CreateRunForm.tsx`, `src/pages/runs/new.astro`, `src/pages/runs/[id]/edit.astro`, `src/lib/run-list-sections.ts`, `src/pages/runs/index.astro`, `src/middleware.ts`, `src/pages/dashboard.astro`, `src/types/database.ts`, `AGENTS.md`, `supabase/migrations/20260824101006_restricted_run_visibility.sql`, `supabase/migrations/20260729134008_run_domain_schema.sql`, `supabase/migrations/20260820092809_run_comments.sql`.

New files (not on disk, as expected): `supabase/migrations/*_run_visibility_add_clan_only.sql`, `supabase/migrations/*_clan_only_run_rls.sql`.

Symbols confirmed: `formatVisibility` exhaustive switch (`src/lib/services/runs.ts:133-145`); `VISIBILITIES` non-exhaustive `satisfies` (`:748-752`); `isVisibility` / `RESTRICTED_VISIBILITY_UNVERIFIED` (`:754-759`); `updateRun` rejects only `invite_only` (`:1120-1122`); `setRunVisibilityAndInvites` also requires `invite_only` (`:1187-1188`); `create_invite_only_run` hardcodes `'invite_only'` (`20260824101006:501`); `set_run_visibility_and_invites` is SECURITY INVOKER (`:533`); `run_participants_select_organizer` still INVOKER-`EXISTS` into `runs` (`20260729134008:275-286`); `is_run_organizer` STABLE DEFINER unused on that policy (`20260820092809:7-20`, comment policies only); `can_view_run` never used FROM `runs` policies; `runs_select_active_authenticated` public/friends/invite OR (`20260824101006:198-216`); `runs_insert_own` / `runs_update_own` verified conjunct for non-public (`:231-273`); `are_friends` uses `a is distinct from b` (`20260821130000:238`); `getClanMembershipForUser` is `clan_members` not `clans.owner_id` (`clans.ts:221-235`); `ClanError` / `CLAN_LOAD_FAILED` exist; `CreateRunFormVisibility` is the 3-value union (`CreateRunForm.tsx:16`); `edit.astro` assigns `run.visibility` (`RunDetail` = `Enums<"run_visibility">`) into that union (`edit.astro:138`); `partitionActiveRuns` first-matching buckets, public-only → Public (`run-list-sections.ts:84-108`); `PROTECTED_ROUTES` does not prefix-protect `/runs` (`middleware.ts:6-7`); `canReadComments` is confirmed / archived participant / organizer / admin (`[id].astro:92-93`); guest `/runs` and `Welcome.astro` pass `publicOnly`; `major_version = 17` (`supabase/config.toml`); `clans.owner_id` indexed not UNIQUE; `clan_members.user_id` PK.

Brief↔plan: same-entity `clan_only`, live `is_same_clan`, no `runs.clan_id`, owner-only create, Clan section, hide picker unless `ownsClan`, two error strings, `updateRun` not invite RPC, `is_run_organizer` dashboard fix, two enum migrations — all match crew-decisions.md.

Progress↔Phase: one `## Progress`; Phase 1/2/3 names match; every success-criteria bullet has a `N.M` checkbox (1.1–1.8, 2.1–2.10, 3.1–3.14); phase bodies have no `- [ ]`.

Deep verification (inline, no nested agent — specialist under Crew Lead): riskiest claims hold. (1) Organizer participant COUNT still uses INVOKER `EXISTS` into `runs`; rewriting to `is_run_organizer` matches the comment-policy cycle break. 42P17 is still hypothesized (research + plan SQL smoke as `authenticated`, not superuser). (2) Owner WITH CHECK on `clans.owner_id = organizer_id` is additive to the verified conjunct; friends-only/invite-only writers stay valid for verified non-owners. (3) `can_view_run` clan branch after the `v_uid is null` guard keeps anon off `is_same_clan`; `is_run_in_active_window` already calls `can_view_run` one-way (`20260824101006:408-422`). (4) Partition blast radius is only `src/pages/runs/index.astro` (must add `clanRuns` to destructure, `hasAnyRuns`, and the sections array). `formatVisibility` callers are `DashboardRunCard`, `ActiveRunCard`, `runs/[id].astro` — one case covers them. `listPlayerProfileRuns` extras follow SELECT ACL (existing friends-only pattern); `list_player_public_runs` stays public-only. No new pattern: `is_same_clan` copies `are_friends` minus `a is distinct from b`.

Lessons.md priors: `?error=` stays intentional copy (plan names `CLAN_ONLY_OWNER_REQUIRED` / updated unverified string; create insert already maps then `"Could not create this run"`). Manual URLs are already in phase notes.

## Findings

### F1 — Phase 1 `db:types` breaks `edit.astro` until `CreateRunFormVisibility` includes `clan_only`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Generated types and card label; Phase 2 currently owns the form union
- **Detail**: Plan correctly lands `formatVisibility`’s `clan_only` case with `npm run db:types` so the exhaustive switch typechecks, and defers `VISIBILITIES` so `isVisibility` still rejects accidental POSTs. It does not mention `CreateRunFormVisibility` (`"public" | "friends_only" | "invite_only"` at `CreateRunForm.tsx:16`). After types regen, `RunDetail.visibility` is `Enums<"run_visibility">` including `clan_only`. `src/pages/runs/[id]/edit.astro:138` assigns `visibility: run.visibility` into `CreateRunFormEditValues.visibility`. That is a type error; Phase 1 success criteria `npm run lint` / `npm run build` fail. `VISIBILITIES`’s `satisfies readonly Enums<"run_visibility">[]` is non-exhaustive and stays valid — the break is the form union, not `isVisibility`.
- **Fix**: In Phase 1, also widen `CreateRunFormVisibility` (and thus `CreateRunFormEditValues.visibility`) with `"clan_only"`. Do **not** add the `<option>`, `ownsClan` prop, or `VISIBILITIES` entry until Phase 2. Accidental POSTs still fail `isVisibility` until the owner gate exists.
- **Decision**: PENDING
