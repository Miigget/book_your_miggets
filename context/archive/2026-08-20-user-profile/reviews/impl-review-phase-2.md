<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Own profile, public profile, and clickable nicknames

- **Plan**: context/changes/user-profile/plan.md
- **Scope**: Phase 2 of 3 (re-review after F1)
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 1 observation
- **Commits**: 54c0f06 (p2), 4eaef03 (F1)

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

Re-review of Phase 2 after F1. Prior report (same file) was **NEEDS ATTENTION** because `findProfileIdByNickname` queried `profiles` and `profiles_select_own` hid other members' nicks. Commit `4eaef03` retargets that lookup to `public_profiles`.

`change.md` stays `implementing` (phase-scoped review; full-plan `impl_reviewed` is after all phases). Do not start Phase 3 from this review.

### F1 confirmation

| Check | Evidence | Result |
|-------|----------|--------|
| Queries `public_profiles` | `src/lib/services/profile.ts:75` `.from("public_profiles")` | MATCH |
| Null-nick filter | `profile.ts:77` `.not("nickname", "is", null)` | MATCH |
| Escaped ILIKE + `nicknameKey` | `profile.ts:78`, `86–88` | MATCH |
| `setOwnNickname` still calls it | `profile.ts:176` | MATCH |
| `submitNicknameChangeRequest` still calls it | `profile.ts:231` | MATCH |
| `getOwnProfile` still uses `profiles` | `profile.ts:95` | MATCH |
| `getPublicProfile` still uses `public_profiles` | `profile.ts:122` | MATCH |
| View is guest-safe | migration `security_invoker = false`; GRANT SELECT to `anon, authenticated` | MATCH |

Writes still go to `profiles`. Uniqueness now sees other nicks despite own-row RLS. Unverified UPDATE still has `23505` backstop. Verified request path now rejects taken nicks in-app.

### Plan vs actual (Phase 2)

| Planned item | Verdict |
|--------------|---------|
| `src/lib/services/profile.ts` choke point: `ProfileError`, parse rules, own/public reads, pending request, request replace, uniqueness | MATCH — F1 DRIFT resolved in `4eaef03` |
| Nickname API: verified lock, non-leak errors, `ensureOwnProfile` → “Could not prepare your profile”, `safeRunReturnTo` | MATCH |
| Nickname-request API: verified-only, current-nick reject, replace pending, uniqueness via `findProfileIdByNickname` | MATCH |
| Points API: integer ≥ 0 or empty → null; does not set the verified flag | MATCH |
| Email API: `updateUser({ email })`, absolute `emailRedirectTo`, pending vs applied notice, fixed copy | MATCH |
| Password API: current + new + confirm; `signInWithPassword` with session `user.email`; wrong current copy | MATCH |
| Create-run: verified null nick → profile-request message; nickname/ensureOwnProfile non-leak | MATCH |
| `/profile` in `PROTECTED_ROUTES`; Layout + PageChrome; Banner for `?error=`/`?notice=` | MATCH |
| OwnProfileForm: unverified save vs verified request; email/password/points; reuse auth controls | MATCH |
| Middleware SELECT adds `nickname`; `locals.profile` includes `nickname: string \| null` | MATCH |
| Topbar: nick or “Set nickname” → `/profile`; never `user.email` | MATCH |
| Inline first-nickname: verified empty → `/profile` link; unverified keeps POST `/api/profile/nickname` | MATCH |
| AGENTS.md `/profile` gate + `/players/{id}` public; README Profile section | MATCH |
| `runs/[id].astro`, `runs/new.astro` | EXTRA (benign) — `isVerified` wiring only |
| Friends / admin editors / labels / public page / Auth flag edits / `src/types.ts` | Not shipped |

### Safety & patterns

- New profile APIs follow `apply.ts` + `lessons.md`: `ProfileError.message` or fixed copy in `?error=`; raw Auth/PostgREST logged via `console.error`.
- Verified nick lock is in `setOwnNickname` with the Phase 1 trigger as backstop.
- Password re-auth uses session `user.email`. `emailRedirectTo` is origin + `/profile`.
- Banned POST `/api/profile/*` still hits the existing middleware gate. `/profile` is prefix-gated.
- `setOwnKogPoints` updates `kog_points` only; trigger clears the verified flag for non-admins.
- Nickname uniqueness via `public_profiles` (`security_invoker = false`) is fail-closed on `maybeSingle()` errors.
- Leftover create-run map/insert `error.message` interpolation is pre-existing and Crew-Lead skipped (F2).

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 2.1 `src/pages/profile.astro` exists; `/profile` is in `PROTECTED_ROUTES` | PASS |
| 2.2 Profile API routes exist (`nickname-request`, `points`, `email`, `password`) | PASS — all four files present plus extended `nickname.ts` |
| 2.3 Topbar does not render `user.email` (grep) | PASS — no `user.email` in `Topbar.astro` |
| 2.4 `npm run lint` | PASS — exit 0; 0 errors; `no-console` warnings include new `console.error` calls required by `lessons.md` |
| 2.5 `npm run build` | PASS — `astro build` complete |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 2.6 Guest `/profile` → sign-in; signed-in member sees session email | `[ ]` | Pending — YOLO skipped (human-action) |
| 2.7 Unverified: set nickname; top bar updates; unique collision “already taken” | `[ ]` | Pending — live nick UPDATE still has `23505`; request-path uniqueness now uses `public_profiles` |
| 2.8 Verified: no self-save; second request replaces pending; direct nickname POST rejected | `[ ]` | Pending — code path matches; not UI-smoked |
| 2.9 Email pending vs applied notice; page shows session email | `[ ]` | Pending |
| 2.10 Password wrong-current copy; new password works | `[ ]` | Pending |
| 2.11 Points save; form cannot flip the public flag | `[ ]` | Pending — form has no flag control; API updates `kog_points` only |
| 2.12 Banned POST `/api/profile/*` hits banned gate | `[ ]` | Pending — middleware unchanged and still covers `/api/` except `/api/auth/` |
| 2.13 http://localhost:4321/profile | `[ ]` | Pending |

Progress rows 2.6–2.13 are still unchecked — not rubber-stamped.

## Findings

### F1 — Nickname uniqueness lookup is blinded by own-row RLS

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/profile.ts:72-90
- **Detail**: Prior review: `findProfileIdByNickname` queried `profiles`; `profiles_select_own` hid other members' nicks, so verified `submitNicknameChangeRequest` could store a taken nick for S-16. Re-review: `4eaef03` points the lookup at `public_profiles`, filters null nicks, keeps escaped ILIKE + `nicknameKey`, and guards `data.id`. Both `setOwnNickname` and `submitNicknameChangeRequest` still call it. `getOwnProfile` still reads `profiles`; `getPublicProfile` still reads `public_profiles`.
- **Fix**: Point `findProfileIdByNickname` at `public_profiles` (same `id, nickname` select, keep escaped `ILIKE` + `nicknameKey` confirm). Do not query `profiles` for cross-user nick uniqueness.
- **Decision**: FIXED — `4eaef03` (`public_profiles` + null filter + `data.id` guard)

### F2 — Create-run still interpolates PostgREST text outside the nickname path

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/runs/index.ts:80,129; src/pages/runs/new.astro:28
- **Detail**: Phase 2 fixed the contracted nickname / `ensureOwnProfile` leaks (`Could not save nickname`, `Could not prepare your profile`). Map validation still does `fail(\`Could not validate map: ${mapError.message}\`)` and run insert still does `fail(insertError.message)`. `runs/new.astro` still sets `loadError = err instanceof Error ? err.message`. Unchanged after F1; not worse; not CRITICAL.
- **Fix**: Log `mapError` / `insertError` / load failures and redirect or render fixed copy (“Could not validate map”, “Could not create run”, “Could not load create form”).
- **Decision**: SKIPPED — Crew Lead; observation, pre-existing, out of S-10 nickname contract

## Residual risk

Manual 2.6–2.13 were not executed (YOLO human-action skip). Hosted Auth email confirmation vs local autocconfirm is still an implementer note (plan-review F5); copy covers both. Create-run map/insert `?error=` leaks remain pre-existing (F2 SKIPPED). Verified request uniqueness is now in-app via `public_profiles`; not SQL-smoked end-to-end.

## Proceed

YOLO Done path: report saved; no interactive triage. `change.md` stays `implementing`. Phase 2 APPROVED. Next: Phase 3 (public profile + clickable nicknames). Do not start Phase 3 from this specialist.
