<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Own profile, public profile, and clickable nicknames

- **Plan**: context/changes/user-profile/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commits**: 8ba2189 (p1), 54c0f06 (p2), 4eaef03 (p2 F1), c03c802 (p3)
- **Prior phase reviews**: p1 APPROVED, p2 APPROVED after F1, p3 APPROVED

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

Full sweep after all three phases. Product work is in the four commits above. Uncommitted `context/` files (phase review reports, Progress stamps, crew-decisions, roadmap) are 10x artifacts, not product scope creep.

Phase reviews were re-checked, not rubber-stamped: drift agent + safety agent + automated re-run this turn. Phase 2 F1 (uniqueness via `public_profiles`) is still in place. Phase 3 did not break Phase 2 chrome/gates. Cross-phase contract holds: schema → own profile → public page + links.

### Plan vs actual

| Planned item | Verdict |
|--------------|---------|
| Migration `*_user_profile_identity.sql`: `kog_points`, flag, view, enum, request table, RLS, trigger | MATCH — `supabase/migrations/20260820071325_user_profile_identity.sql` |
| `public_profiles` five identity columns; `security_invoker = false`; GRANT SELECT anon/authenticated | MATCH — no email/role/ban |
| Trigger: verified nick lock; non-admin `kog_points` change clears verified flag | MATCH |
| Generated `src/types/database.ts` (no hand-edit) | MATCH — table, enum, view fields present |
| `profile.ts` choke point; uniqueness on `public_profiles` + `lower()` (p2 F1) | MATCH — `findProfileIdByNickname` still `.from("public_profiles")` |
| Own-profile APIs: verified lock, request replace, points, email, password; fixed `?error=` copy | MATCH — `ProfileError` / fixed strings; `ensureOwnProfile` → “Could not prepare your profile” |
| Create-run: verified null nick → request copy; nickname/`ensureOwnProfile` non-leak | MATCH on contracted nick path |
| `/profile` in `PROTECTED_ROUTES`; Topbar nick or “Set nickname” → `/profile`; never `user.email` | MATCH |
| Inline first-nickname: verified empty → `/profile`; unverified keeps POST `/api/profile/nickname` | MATCH |
| AGENTS.md `/profile` gate + `/players/{id}` public; README Profile section | MATCH |
| `/players/{uuid}` from `public_profiles`; 404 on invalid/missing; no email/role/ban | MATCH |
| `playerProfileHref` + Astro/React `NicknameLink`; pending/denied pass `userId` | MATCH |
| Organizer links on index, history, dashboard, landing, run detail, admin archive cards | MATCH — dashboard included (plan-review F1) |
| Card split: no wrapping card `<a>`; title is run link; NicknameLink sibling | MATCH |
| `/admin` index nick cells still `/admin/users/{id}` | MATCH — file not in the four commits |
| Do not parse organizer from `displayTitle` | MATCH — `resolveRunTitle` untouched |
| Out of scope: friends, admin nick/points UI, labels, Auth/SMTP flags, public archive, Vitest, `src/types.ts` | MATCH — not shipped |

Benign extras: non-unique `nickname_change_requests_user_id_idx` (p1); `runs/new.astro` `isVerified` wiring (p2); public-page “← Active runs” back link (p3). Expected 10x artifacts under `context/changes/user-profile/`.

### Safety, architecture, patterns

- View stays guest-safe (`security_invoker = false`). Public page reads `getPublicProfile` only. Nickname text is default interpolation (no `set:html` / `dangerouslySetInnerHTML`).
- Uniqueness lookup is fail-closed on `maybeSingle()` errors. Writes still go to `profiles`. `23505` remains a backstop. Members cannot self-accept nickname requests (RLS WITH CHECK stays `pending`).
- Password re-auth uses session `user.email`. Email `emailRedirectTo` is absolute `new URL("/profile", context.url.origin).href` (plan-review F5 note).
- Banned POST `/api/profile/*` still hits the existing `/api/` gate. `/profile` is prefix-gated; `/players` is not.
- No N+1: lists reuse `organizerId` / `userId`. Public page is one PK lookup.
- `ProfileError` matches `AdminError` / `ParticipantError`. Profile APIs match `apply.ts`. Public 404/500 copy matches admin/run missing pages.
- Nested whole-card anchors are gone on the five list surfaces.

### Cross-phase (p3 did not break p2)

| Check | Status |
|-------|--------|
| Topbar nick → `/profile` | `Topbar.astro:20-25` |
| `getPublicProfile` → `public_profiles` | `profile.ts:122` |
| `PROTECTED_ROUTES` includes `/profile` | `middleware.ts:4` |
| Uniqueness via `public_profiles` | `profile.ts:75` |

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 1.1 Migration file exists with RLS and view columns excluding email/role/ban | PASS — 5 policies; view is the five identity columns |
| 1.2 `npx supabase db reset` | PASS — not re-run (destructive). Phase 1 review applied schema + `migration list` locally. Hosted still awaits `/gh-release` |
| 1.3 Types include `kog_points`, `kog_points_verified`, `nickname_change_requests` | PASS — present in `src/types/database.ts` |
| 1.4 / 2.4 / 3.4 `npm run lint` | PASS — exit 0; 0 errors; 44 `no-console` warnings (required `console.error` + pre-existing) |
| 1.5 / 2.5 / 3.5 `npm run build` | PASS — `astro build` complete |
| 2.1 `profile.astro` exists; `/profile` in `PROTECTED_ROUTES` | PASS |
| 2.2 Profile API routes exist | PASS — `nickname-request`, `points`, `email`, `password` plus extended `nickname.ts` |
| 2.3 Topbar does not render `user.email` | PASS — grep empty in `Topbar.astro` |
| 3.1 `src/pages/players/[id].astro` exists | PASS |
| 3.2 `playerProfileHref` / NicknameLink; pending/denied mapping includes `userId` | PASS — `runs/[id].astro:257-258` |
| 3.3 `/admin` index still links nicks to `/admin/users/{id}` | PASS — `admin/index.astro:83` |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 1.6–1.9 SQL/RLS smoke | `[x]` | Done in p1 review (rolled-back txn). Not re-run this sweep |
| 2.6–2.13 Own-profile UI | `[ ]` | Pending — YOLO skipped (human-action). Code paths match; not UI-smoked |
| 3.6–3.12 Public page + click targets | `[ ]` | Pending — YOLO skipped (human-action). Markup/status assignment match; not UI-smoked |

Progress rows 2.6–2.13 and 3.6–3.12 are still unchecked — not rubber-stamped. Per crew override, unchecked YOLO-skipped manual rows do not block APPROVED.

## Findings

None.

Phase 2 F1 (uniqueness blinded by own-row RLS) was FIXED in `4eaef03` and remains fixed. It is not re-opened.

Phase 2 F2 (create-run map/insert still interpolates PostgREST into `?error=` at `src/pages/api/runs/index.ts:80,129`; `runs/new.astro:28` load `err.message`) remains present, unchanged, not CRITICAL. Crew Lead already SKIPPED it. Not re-opened as a finding.

## Residual risk

- Manual 2.6–2.13 and 3.6–3.12 were not executed (YOLO human-action skip). Nested-anchor click targets, guest 404 HTTP status, email pending-vs-applied copy, and password sign-in were verified in code only.
- Create-run map/insert `?error=` leaks remain pre-existing (p2 F2 SKIPPED). Nickname/`ensureOwnProfile` paths on that route are fixed.
- Hosted Auth email confirmation vs local autocconfirm is still an implementer note (plan-review F5). Copy covers both; `emailRedirectTo` is origin-absolute.
- Hosted Supabase does not yet have migration `20260820071325` until a tagged `/gh-release`.
- Banned public profiles still depend on the view not filtering `is_banned` (plan-review F6); Phase 3 manual list never opens a banned player URL.

## Proceed

YOLO Done path: report saved; no interactive triage (zero PENDING findings). `change.md` stamped `impl_reviewed`. Next: `/10x-archive`. Do not archive from this specialist.
