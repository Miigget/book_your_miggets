<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Own profile, public profile, and clickable nicknames

- **Plan**: context/changes/user-profile/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: c03c802

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

Phase 3 product change is the public `/players/{uuid}` page, shared `playerProfileHref` / `NicknameLink` (Astro + React), `userId` passed through pending/denied applicants, and the nested-anchor card split. Commit `c03c802` also stamped Phase 3 automated Progress rows (and Phase 2 automated SHAs) in `plan.md` — expected 10x artifact, not product scope creep.

`change.md` stays `implementing` (phase-scoped review; full-plan `impl_reviewed` is after all phases). Do not archive from this review.

Phase 2 assumptions were not broken: Topbar nick still goes to `/profile`; `getPublicProfile` still SELECTs `public_profiles` only; `/profile` remains in `PROTECTED_ROUTES`; `/players` is not gated.

### Plan vs actual (Phase 3)

| Planned item | Verdict |
|--------------|---------|
| `src/pages/players/[id].astro` guest-readable identity; not in `PROTECTED_ROUTES` | MATCH — middleware list unchanged; `/players` does not prefix-match any protected route |
| Invalid UUID or `getPublicProfile` null → same 404 as run/admin missing pages; do not distinguish banned vs missing | MATCH — `isUuid` miss and missing row both `pageError = "missing"` → HTTP 404, copy “Player not found” / “This player is missing.” Banned rows still 200 because `public_profiles` has no ban filter |
| Nickname `"—"` if null; verified vs not; KoG points `"—"` if null; points-checked vs self-reported | MATCH — `"Checked in-game"` / `"Self-reported"`; no email/role/ban/archive/friends/labels |
| Optional own-profile “Edit your profile” → `/profile` | MATCH — only when `user.id === profile.id` |
| `playerProfileHref(userId)` → `/players/{userId}` | MATCH — `src/lib/profile-href.ts` |
| Astro + React `NicknameLink`; wrap nick or “Unknown player” when `userId` present | MATCH |
| Run detail: organizer + confirmed roster | MATCH — `runs/[id].astro` |
| Pending/denied pass `userId`; stop stripping in `[id].astro` | MATCH — map includes `userId`; `PendingApplicant.userId` required; island uses `NicknameLink` |
| Organizer on runs index, history, dashboard, landing | MATCH — dashboard gained an organizer line (listed call site) |
| Admin archive-card organizer only | MATCH — `admin/users/[id].astro` |
| Do **not** change `/admin` index nick cells | MATCH — still `href={/admin/users/${profile.id}}`; file not in the commit |
| Do **not** parse organizer names out of `displayTitle` | MATCH — `resolveRunTitle` untouched; organizer via `organizerId` |
| Card root is not a wrapping `<a>`; title remains run nav; NicknameLink is a sibling | MATCH — five list surfaces use `<div>` card + title `<a href=/runs/{id}>` |

Supporting extra inside the planned public page (not scored as scope creep): “← Active runs” back link (`players/[id].astro:44-47`) mirrors admin “← Users”. Config/load HTTP 500 branches copy the admin/run missing-page pattern the contract required.

### Safety & patterns

- Public page reads `getPublicProfile` → `public_profiles` (`id, nickname, is_verified, kog_points, kog_points_verified` only). No email/role/ban in the template (grep empty under `src/pages/players/`).
- Invalid UUID and missing row share one 404. Banned players are not filtered out of the view, so they still render — matches plan + Phase 1 F6.
- Nickname text is default Astro/React interpolation (no `set:html` / `dangerouslySetInnerHTML`). `href` is always `/players/${userId}`.
- No N+1: lists pass existing `organizerId` / `userId` DTOs; public page is one PK lookup.
- Load failures `console.error` then fixed copy (“Please try again later.” / “Supabase is not configured.”). No PostgREST in the body. No new `?error=` routes this phase (`lessons.md` N/A).
- Dual `NicknameLink` is the planned Astro-list vs React-island split. Tailwind merged with `cn()`. No `"use client"`.
- Nested anchors removed: no remaining `block rounded-xl` wrapping-card `<a>`.

### Automated verification (re-run this review)

| Check | Result |
|-------|--------|
| 3.1 `src/pages/players/[id].astro` exists | PASS |
| 3.2 `playerProfileHref` / NicknameLink exist; `[id].astro` pending/denied mapping includes `userId` | PASS — helper + both components; `runs/[id].astro:257-258` map `{ id, userId, nickname }` |
| 3.3 `/admin` index still links nicknames to `/admin/users/{id}` (grep) | PASS — `admin/index.astro:82-86`; not in `c03c802` |
| 3.4 `npm run lint` | PASS — exit 0; 0 errors; 44 pre-existing `no-console` warnings; new `players/[id].astro:25` is the required load log |
| 3.5 `npm run build` | PASS — `astro build` complete |

### Manual verification

| Check | Progress | This review |
|-------|----------|-------------|
| 3.6 Guest `/players/{uuid}`: nick, verification, points, checked/self-reported; no email | `[ ]` | Pending — YOLO skipped (human-action). Code path matches; template has no email |
| 3.7 Unknown / non-UUID id: HTTP 404 | `[ ]` | Pending — `!isUuid` and null row both set 404; not HTTP-smoked |
| 3.8 Click organizer/roster nicks on runs, detail, history, dashboard, landing, pending/denied | `[ ]` | Pending — all listed call sites wired; not UI-smoked |
| 3.9 Nested-link cards: nick → `/players/{id}`; title → run | `[ ]` | Pending — card split is in the markup; click not smoked |
| 3.10 `/admin` table nick → archive; archive-card organizer → public profile | `[ ]` | Pending — grep + archive `NicknameLink` match; not UI-smoked |
| 3.11 Own topbar nick still `/profile`, not `/players/{self}` | `[ ]` | Pending — `Topbar.astro:20-25` still `href="/profile"`; file not in this commit |
| 3.12 http://localhost:4321/runs and a known `/players/{uuid}` | `[ ]` | Pending |

Progress rows 3.6–3.12 are still unchecked — not rubber-stamped. Per crew override, unchecked YOLO-skipped manual rows do not block APPROVED.

## Findings

None.

## Residual risk

Manual 3.6–3.12 were not executed (YOLO human-action skip). Nested-anchor click targets and guest 404 status were verified in markup/status assignment only. Card click target shrank from whole-card to title text by plan. Phase 2 manual 2.6–2.13 remain unchecked from the prior review. Create-run map/insert `?error=` leaks remain pre-existing (Phase 2 F2 SKIPPED).

## Proceed

YOLO Done path: report saved; no interactive triage (zero findings). `change.md` stays `implementing`. Phase 3 APPROVED. Next: stamp `implemented` (all phases landed) then `/10x-archive`. Do not archive from this specialist.
