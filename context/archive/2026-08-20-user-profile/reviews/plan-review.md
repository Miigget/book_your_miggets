<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Own profile, public profile, and clickable nicknames

- **Plan**: context/changes/user-profile/plan.md
- **Mode**: Deep
- **Date**: 2026-08-20
- **Verdict**: SOUND
- **Findings**: 0 critical 4 warnings 2 observations (after triage: 4 fixed, 2 accepted)

The plan matches locked Crew Lead decisions, PRD S-10 / FR-017 / FR-018 / FR-023, and the codebase. Schema → own/chrome → public+links is sound. Recreating `public_profiles` with `security_invoker = false`, extending `enforce_profile_privileged_columns`, and splitting nested-anchor cards are all confirmed against the repo. Triage applied F1–F4 into `plan.md` (dashboard organizer link, `lower()` uniqueness, session email for password re-auth, `ensureOwnProfile` fixed copy). F5–F6 remain implementer notes.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 19/19 paths ✓, 10/10 symbols ✓, brief↔plan ✓

Verified existing paths: `src/pages/api/profile/nickname.ts`, `src/pages/api/runs/index.ts`, `src/middleware.ts`, `src/env.d.ts`, `src/components/Topbar.astro`, `src/components/runs/RunParticipantActions.tsx`, `src/components/runs/CreateRunForm.tsx`, `src/pages/runs/[id].astro`, `src/pages/runs/index.astro`, `src/pages/runs/history.astro`, `src/components/Welcome.astro`, `src/pages/admin/users/[id].astro`, `src/types/database.ts`, `src/lib/services/runs.ts`, both cited migrations, `supabase/config.toml`, `AGENTS.md`, `README.md`.

Symbols confirmed: `public_profiles` (`security_invoker = false`, `id, nickname` only), `enforce_profile_privileged_columns`, `profiles_update_own`, `PROTECTED_ROUTES`, `organizerId` on `RunListItem`, `ensureOwnProfile`, `safeRunReturnTo`, `AdminError` / `ParticipantError`, `isUuid`, Topbar `{user.email}`.

Brief↔plan: public URL, request table + replace-pending, points + flag, email `updateUser`, trigger+API nick lock, current-password then `updateUser`, topbar → `/profile`, three phases, out-of-scope S-11/S-16/S-17 — all match `plan-brief.md` and `crew-decisions.md`. Progress section matches phases and success-criteria bullets. No `docs/reference/contract-surfaces.md` (skipped).

## Findings

### F1 — Dashboard omitted from nickname-link call sites

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Nickname links / card split
- **Detail**: Phase 3 said “dashboard only if it renders another player's nick”. `src/pages/dashboard.astro` wraps cards in `<a href={/runs/{id}}>` and shows only `displayTitle` — no organizer nickname line. `resolveRunTitle` (`src/lib/services/runs.ts:89-107`) embeds the nick in the title string (`"{map} run by {nick}"` / `"{nick} run"`). The implementer would skip dashboard under the hedge. `/dashboard` is a primary signed-in list; after S-10 it still had no clickable identity, unlike `/runs` and history. Do not try to parse names out of `displayTitle`.
- **Fix**: Add dashboard to the Phase 3 call-site list. Same card split as index/history: title stays the run link; add an organizer `NicknameLink` sibling. Explicitly out of scope: linking substrings inside `displayTitle`.
- **Decision**: FIXED — dashboard added to nested-anchor list, Phase 3 files/call sites, Desired End State, success criterion 3.8, and plan-brief architecture. Do not parse `displayTitle`.

### F2 — Nickname-request uniqueness is not specified as case-insensitive

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Nickname-request API
- **Detail**: Live nicknames use `profiles_nickname_lower_uidx` on `lower(nickname)` (`supabase/migrations/20260729163802_maps_catalog_and_run_title.sql:48-50`). The plan’s “uniqueness check against `profiles`” and “reject if requested nick equals current” did not say `lower()`. Requesting `Foo` while `foo` exists would pass the app check; S-16 apply would hit `23505`. There is no cross-table unique constraint (correct — app must enforce).
- **Fix**: Compare with `lower(trim(requested))`. Reject if that equals the current nick; uniqueness lookup against `profiles` uses the same `lower()` comparison as the index.
- **Decision**: FIXED — Phase 2 service + nickname-request contract now require `lower(trim())` vs current nick and vs `profiles_nickname_lower_uidx`.

### F3 — Password re-auth does not name the email source

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Password API
- **Detail**: Contract was `signInWithPassword` with the current password then `updateUser({ password })`. `signInWithPassword` needs an email. Own-profile also has an email-change field. If the implementer binds the wrong input, wrong-current-password copy misfires or the check runs against a pending address. Locked decision (current password then `updateUser`) stays; this is only which email to pass. Do not switch to Auth project flags.
- **Fix**: Contract: `signInWithPassword({ email: session user.email, password: current })` then `updateUser({ password: new })`. Never read the email-change field for this step.
- **Decision**: FIXED — Phase 2 password contract now names session `user.email` and forbids the email-change field.

### F4 — `ensureOwnProfile` catch still leaks infrastructure errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Nickname + create-run APIs; Critical Details (Errors)
- **Detail**: `lessons.md` forbids raw Auth/PostgREST/`Error.message` in `?error=`. The plan fixed the non-23505 interpolation in `src/pages/api/profile/nickname.ts:43-44` and `src/pages/api/runs/index.ts:52-55`. Both files still `fail(err.message)` around `ensureOwnProfile`, and `ensureOwnProfile` throws ``Failed to ensure profile: ${error.message}`` (`src/lib/services/runs.ts:476-479`). Same lesson, same files, still a leak.
- **Fix**: Map that catch to fixed copy “Could not prepare your profile”; `console.error` the raw error. Do not change `ensureOwnProfile`’s throw for other callers unless they already swallow `Error.message` into redirects.
- **Decision**: FIXED — Critical Details Errors + Phase 2 API/create-run contract now require fixed “Could not prepare your profile” on the `ensureOwnProfile` catch.

### F5 — `emailRedirectTo: "/profile"` is not a valid GoTrue URL

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Email API
- **Detail**: Plan says optional `emailRedirectTo` to `/profile`. Context7 `/supabase/supabase` examples use an absolute origin (`${window.location.origin}/…`). Local `supabase/config.toml` `site_url` is `http://127.0.0.1:3000` while the app is `:4321`; changing Auth/SMTP flags is out of scope. Pending-vs-applied notice already covers local autocconfirm vs hosted confirm. A relative path may be ignored or rejected hosted.
- **Fix**: If set, use `new URL("/profile", context.url.origin).href`. Otherwise omit and rely on the pending/applied notice. Do not edit `config.toml`.
- **Decision**: ACCEPTED — implementer note in `plan-brief.md` Open Risks; Phase 2 email contract unchanged.

### F6 — Banned public profile is promised but not in Phase 3 manual checks

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State vs Phase 3 Manual Verification
- **Detail**: End state: “Banned players still have a public profile.” The view does not (and must not) filter `is_banned`, so this falls out of the schema. Phase 3 manual list never opens `/players/{uuid}` for a banned user, so a mistaken `WHERE NOT is_banned` on the view would still pass written checks.
- **Fix**: Add one Phase 3 manual bullet: guest can open a banned player’s `/players/{uuid}` (nick visible, no ban/email).
- **Decision**: ACCEPTED — implementer note in `plan-brief.md` Open Risks; no new Progress row.

## Triage

```
═══════════════════════════════════════════════════════════
  TRIAGE COMPLETE
═══════════════════════════════════════════════════════════

  Fixed:     F1, F2, F3, F4   (4)
  Skipped:                    (0)
  Accepted:  F5, F6           (2)
  Dismissed:                  (0)

  ► Verdict after fixes: SOUND
═══════════════════════════════════════════════════════════
```

## Codebase verification (deep)

Riskiest claims vs repo (explore sub-agent + spot-check):

| Claim | Verdict |
|-------|---------|
| `public_profiles` is `id, nickname`, `security_invoker = false`; anon cannot SELECT `profiles`; extra view columns do not break current embeds | CONFIRMED |
| Trigger locks only `role` / `is_verified` / `is_banned`; `profiles_update_own` allows nickname UPDATE today | CONFIRMED |
| Nested whole-card `<a>` on index, history, Welcome, admin archive cards; `[id].astro` strips pending/denied `userId` | CONFIRMED |
| Middleware `locals.profile` is `{ role, isBanned }`; banned POST gate already covers `/api/profile/*`; Auth flags as cited | CONFIRMED |
| Dual `NicknameLink.astro` + `.tsx` is new (no existing paired primitive); `ProfileError` matches `AdminError` / `ParticipantError` | CONFIRMED (not a finding — island vs SSR lists justify both files) |

Blast radius the plan already names or hedges: dashboard (F1, now in plan), `displayTitle` nick embedding (do not parse), `dev-quick-login.ts` nickname write (dev-only; trigger will no-op verified nicks). Admin index nick → `/admin/users/{id}` confirmed (`src/pages/admin/index.astro:82-87`).
