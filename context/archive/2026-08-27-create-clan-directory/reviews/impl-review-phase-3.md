<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create clan directory — Implementation Plan

- **Plan**: context/changes/create-clan-directory/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: 7eb291b (`feat(create-clan-directory): Public directory, details, and nav (p3)`)
- **Files**: `src/pages/clans/index.astro`; `src/pages/clans/[id].astro`; `src/components/clans/ClanCard.astro`; `src/components/Topbar.astro`; `src/components/Footer.astro`; `src/components/Welcome.astro`; `src/lib/safe-return-to.ts`; `AGENTS.md`; `context/changes/create-clan-directory/plan.md` (Progress 3.1–3.3)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

Phase 3 Changes Required vs `7eb291b`:

| Planned item | Actual | Verdict |
|--------------|--------|---------|
| Ranked `/clans`: `Layout` + `PageChrome` + SSR `listClans()`; cards name/tag/points/picture or tag-initials placeholder; link `/clans/{id}`; empty + load-error; CTA guest → `/auth/signin` “Sign in to create”; signed-in unverified → verify-copy, no Create; verified no membership → `/clans/new`; already-member → no Create, optional link to their clan; `?error=` / `?notice=` like `/runs`; no pagination; no visibility sections | `index.astro` calls `listClans` (points DESC, name ASC, id ASC from Phase 2); `ClanCard` renders name/tag/points + `img` or two-letter tag initials; overlay link to `/clans/{id}`; empty “No clans yet”; load-error banner; guest CTA `/auth/signin` (no `returnTo`); verified+!membership Create; membership “View your clan”; unverified `{CLAN_VERIFIED_ONLY}`; Banner for notice/error | MATCH |
| Detail `/clans/{id}`: 404 not 403; `← Clans`; name, tag, picture or placeholder, points; members as `NicknameLink` → `/players/{uuid}` from `public_profiles.nickname` only; no email / no `profiles` select; owner in same roster | `[id].astro`: missing/invalid id (`!isUuid` → `getClanById` null) sets `Astro.response.status = 404` and “Clan not found”; never 403; back link `← Clans`; header picture/placeholder + name; `dl` name/tag/points; roster from `clan.members` (`id`, `nickname`); `NicknameLink`; no `email` in clan pages | MATCH |
| Topbar **Clans** → `/clans` guest and signed-in; no New clan | Both nav branches; no New clan / Create a Clan | MATCH |
| Footer **Browse Clans** → `/clans`; no Create a Clan | Added next to Browse Runs; Create a Run unchanged | MATCH |
| Welcome secondary **Browse clans** → `/clans`; keep Create a Run primary | Third button after Create a Run / Browse Runs | MATCH |
| `safeAuthReturnTo` allow `/clans/{uuid}` (same uuid regex); exact `/clans` optional | `CLAN_PATH_RE` + return `/clans/${clan[1]}`; exact `/clans` omitted (allowed) | MATCH |
| AGENTS.md: `/clans/new` among protected; do not prefix-protect `/clans`; members from `public_profiles` (no email) | All three sentences in Hard Rules | MATCH |
| Roadmap `## Baseline` Data line if still “Absent: clan tables” | `7eb291b` does not touch `roadmap.md`. Committed Baseline Data never used that exact sentence (lists pre-F-02 tables only). Working-tree v3 regen already says “clan tables (F-02)” / absent screenshots | MATCH (conditional; see Residual) |

Git scope of `7eb291b` is the eight product files plus Progress checkboxes on `plan.md`. No `GRANT UPDATE`, no `/clans` in `PROTECTED_ROUTES`, no New clan chrome, no pagination, no `runs` join. Extra vs plan: none. Working-tree dirt (`roadmap.md` v3 regen, `shape-notes.md`, untracked foundation files, this review) is not part of the commit.

Phase 2 `createClan` success redirect `/clans/{id}` now resolves to the new detail page (the plan’s noted 404 window is closed). `/clans/new` remains a static route; `[id].astro` does not capture `"new"` (`isUuid` would 404 anyway).

## Success criteria (Phase 3)

| ID | Check | Result |
|----|--------|--------|
| 3.1 | `npm run lint` exits 0 | PASS — this review: 0 errors, 141 warnings (pre-existing `no-console` / parser notes; new pages use `console.error` like `players/[id].astro`) |
| 3.2 | `npm run build` exits 0 | PASS — this review: `astro build` Complete (Cloudflare server) |
| 3.3 | `AGENTS.md` states not to prefix-protect `/clans`; `PROTECTED_ROUTES` has `/clans/new` and not `/clans` | PASS — AGENTS.md Hard Rules; middleware `["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile", "/clans/new"]`; no `"/clans"` literal |
| 3.4–3.9 | Manual guest directory/detail/404, unverified CTA, verified create→detail, restricted runs still 404 | YOLO skip — not a defect. Residual: browser click-through. Code paths for ranking, 404, CTAs, nickname-only roster, and no `runs` select are present |

## Findings

None.

## Residual (not findings)

- **3.4–3.9 browser** skipped under YOLO (human-action). Implementer left those Progress rows unchecked — not rubber-stamping.
- **Committed `roadmap.md` Baseline Data** still omits F-02 clan tables. The plan’s trigger phrase (“Absent: clan tables”) is not in `7eb291b`’s file. Uncommitted working-tree v3 already rewrites Baseline to “clan tables (F-02)” / absent screenshots — do not patch the old v2 file on top of that regen.
- **`/clans/new` back link** remains `← Home` (Phase 2). Not in Phase 3 Changes Required.

## Dimension notes

- **Plan Adherence**: Directory, detail, chrome, `safe-return-to`, and AGENTS.md all MATCH. `listClans` / `getClanById` from Phase 2 are used as specified. Conditional roadmap Baseline rewrite is Residual, not drift.
- **Scope Discipline**: “What We're NOT Doing” held — no prefix-protect `/clans`, no New clan in Topbar/Footer, no pagination, no tag-slug URLs, no clan↔runs join, no `GRANT UPDATE`, no R2. CTA Create lives only on `/clans` for verified non-members (and the protected `/clans/new` page).
- **Safety & Quality**: Invalid/missing id → 404 copy + status 404, never 403. Members from `public_profiles` `id, nickname` only; clan pages contain no `email`. Picture URLs via `getPublicUrl` on a CHECK-constrained object key, not a stored URL. `safeAuthReturnTo` still uuid-only (no open redirect). `?error=` / `?notice=` match `/runs` and Astro-escape. Guest `/clans` and `/clans/{id}` stay off `PROTECTED_ROUTES`. Restricted-run ACL is untouched (no `from("runs")` in clan pages/service readers). Viewer-profile lookup failure fail-closes the CTA (`viewerKnown` stays false) instead of showing Create.
- **Architecture**: Pages stay thin; ranking, member join, and DTOs remain in `src/lib/services/clans.ts`. Public URLs go through the Phase 2 bucket-parameterized helper. S-20 still must not reuse `clan-pictures`.
- **Pattern Consistency**: `/clans` copies `/runs` header/CTA/Banner/empty/error. `/clans/{id}` copies `/players/{id}` 404/500/`PageChrome`/`dl`/`NicknameLink`. Topbar/Footer/Welcome links copy the Runs pattern without adding a global Create.
- **Success Criteria**: 3.1–3.3 re-executed this review. 3.4–3.9 are YOLO residual, not rubber-stamping.

## Proceed

Crew override: no triage (YOLO informational / Done). Report saved; `change.md` stays `implementing` so this phase review does not stamp `impl_reviewed` (same as Phase 1–2). This is the last phase. Next: Crew Lead `/10x-archive` (YOLO: remaining Progress rows are human-action manuals). Do not hire a full-plan impl-review from this specialist invocation.
