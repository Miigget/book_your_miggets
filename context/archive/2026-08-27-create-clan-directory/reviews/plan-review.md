<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Create clan directory — Implementation Plan

- **Plan**: context/changes/create-clan-directory/plan.md
- **Mode**: Deep
- **Date**: 2026-08-27
- **Verdict**: SOUND
- **Findings**: 0 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

Grounding: 8/8 existing modify-targets ✓ (`src/types/database.ts`, `src/middleware.ts`, `src/components/Topbar.astro`, `src/components/Footer.astro`, `src/components/Welcome.astro`, `src/lib/safe-return-to.ts`, `AGENTS.md`, `context/foundation/roadmap.md`), 8/8 new paths expected-absent ✓ (`src/lib/storage.ts`, `src/lib/services/clans.ts`, `src/pages/api/clans/index.ts`, `src/pages/clans/new.astro`, `src/components/clans/CreateClanForm.tsx`, `src/pages/clans/index.astro`, `src/components/clans/ClanCard.astro`, `src/pages/clans/[id].astro`), 9/9 symbols ✓ (`requireVerifiedViewer`, `PROTECTED_ROUTES`, `clans_insert_verified_owner`, `safeAuthReturnTo`, `ensureOwnProfile`, `getOwnProfile`, `clans_tag_lower_btrim_uidx`, `seat_owner_on_clan_insert`, `ServerError`), brief↔plan ✓.

Code verification (explore): picture-at-INSERT + no UPDATE grant matches F-02 (`clans.Insert.id?`, `points?`, grants INSERT+DELETE only); omit-`points` is safe (DEFAULT 0; do not send `null`). `clan_members` embeds `public_profiles` via `clan_members_user_id_fkey`. Storage is greenfield. `/clans/new` prefix matches `/runs/new` and does not lock `/clans` or `/clans/{uuid}`. PostgREST has no `constraint` field (see F1). `requireVerifiedViewer` is module-private — copy pattern, do not import. Roadmap `## Baseline` Data line already lists F-02 clan tables — Phase 3 rewrite is a no-op if still current.

Progress↔Phase: one `## Progress`; Phase 1–3 headings match; 1.1–1.6 / 2.1–2.10 / 3.1–3.9 cover every success-criteria bullet; phase bodies use plain `-` only.

## Findings

### F1 — 23505 distinction is not a `constraint` field

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Clan service contract (`createClan` 23505 mapping)
- **Detail**: Plan says distinguish tag vs second-clan unique violations “from constraint name in the error object”. supabase-js `PostgrestError` is `code` / `message` / `details` / `hint` only — there is no `constraint` property. Existing unique checks (`friends.ts:40-41`, `profile.ts:44-45`) only test `error.code === "23505"`. The house pattern that *does* read names is `mapRunMapCategoryConstraintError` (`src/lib/services/runs.ts:879-884`), which concatenates message/details/hint and `includes(...)`. F-02 smoke logged `23505 clans_tag_lower_btrim_uidx` for tag clash and `23505 clan_members_pkey` for a second clan (trigger abort, not P0001). An implementer looking for `error.constraint` will find nothing and may ship a generic “Could not create clan” for both cases, failing 2.6 / 2.9.
- **Fix**: In the Phase 2 contract, parse `message`/`details`/`hint` like `mapRunMapCategoryConstraintError`: blob includes `clans_tag_lower_btrim_uidx` → “That clan tag is already taken.”; blob includes `clan_members_pkey` → “You already belong to a clan.” Log the raw error; never put `error.message` in `?error=`.
- **Decision**: FIXED (Fix A)

### F2 — Picture MIME/size error string missing from ClanError list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Clan service suggested strings vs success criterion 2.10
- **Detail**: Suggested `ClanError` strings cover verified-only, already-member, tag taken, nickname, and generic create/load. Criterion 2.10 requires a user-facing picture error with no clan row for oversized or wrong MIME. Without a fixed string, the implementer invents copy or (worse) forwards Storage’s error into `?error=` (lessons.md).
- **Fix**: Add a fixed string, e.g. “Picture must be a JPEG, PNG, or WebP under 1 MB.” Reject in-process before `storage.upload`; map bucket-limit failures to the same string.
- **Decision**: FIXED (Fix A)

### F3 — Verified-without-nickname copy is the create-run locked path, not “set a nickname”

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Create API nickname gate
- **Detail**: Clan create is verified-only. The only no-nickname case is therefore a verified profile with `nickname` null. Create-run maps that to “Verified nicknames are locked. Request a change on your profile.” (`src/pages/api/runs/index.ts:69-71`), because verified members cannot set a nickname inline. Plan’s “Set a nickname before creating a clan” is the *unverified* create-run string and would send them to a `/profile` edit that is locked.
- **Fix**: If `isVerified && !nickname`, use the locked-request copy; do not add a nickname field on `CreateClanForm`.
- **Decision**: FIXED (Fix A)

## Triage

- **Fixed:** F1 (Fix A), F2 (Fix A), F3 (Fix A)
- **Skipped / Accepted / Dismissed:** none
- **Verdict after fixes:** SOUND
