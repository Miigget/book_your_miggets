<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Changelog page Implementation Plan

- **Plan**: context/changes/changelog-page/plan.md
- **Scope**: Phase 1 of 2
- **Date**: 2026-09-11
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 0 observations
- **Commit**: c9e7e60 (`feat(changelog-page): Public /changelog page (p1)`)

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

Planned Phase 1 files vs `c9e7e60` (product only):

| Plan file | Diff | Verdict |
|-----------|------|---------|
| `src/lib/services/releases.ts` | present | MATCH |
| `src/pages/changelog.astro` | present | MATCH |
| `src/components/changelog/ReleaseEntry.astro` | present (plan allowed extract) | MATCH |
| `src/middleware.ts` | not in diff | MATCH — `/changelog` still absent from `PROTECTED_ROUTES` |
| `src/components/Footer.astro` | not in diff | MATCH — Phase 2 |
| `AGENTS.md` | not in diff | MATCH — Phase 2 |

Extra in the commit: `context/changes/changelog-page/*` from earlier 10x stages (not product-scope creep). Missing vs Phase 1: none. Working tree `src/` is clean vs `c9e7e60`.

Crew locks verified in product code:

- Public page: no `user` gate; `PROTECTED_ROUTES` is still `["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile", "/clans/new"]` plus `EDIT_RUN_PATH`. `/changelog` is not a prefix of any of them (`middleware.ts:6-7, 59-62`).
- Request-time GitHub: hardcoded `GET https://api.github.com/repos/Miigget/book_your_miggets/releases?per_page=30`. `User-Agent: Book Your Miggets`, `Accept: application/vnd.github+json`, optional `X-GitHub-Api-Version: 2022-11-28`, `AbortSignal.timeout(8000)`. No `GITHUB_TOKEN`, no `astro.config.mjs` env field.
- Cache-Control on success only: `Astro.response.headers.set("Cache-Control", "public, max-age=60, s-maxage=3600")` inside `if (result.ok)` — includes empty published list; skipped on `{ ok: false }`.
- For-users parse: take `## For users (EN)` until next line-start `## `; map `### New` / `### Improved` / `### Fixed` `- ` bullets; leftover → `fallbackText`; missing heading → body with `## For developers` and after stripped. Skip `draft` / `prerelease`. Live `per_page=30` sample (2026-09-11): 0 developer leaks, 0 leftover fallbacks, 0 empty user sections.
- Raw strings + Astro `{…}`: loader does not HTML-escape; `ReleaseEntry.astro` interpolates `{item}` / `{release.fallbackText}` / `{release.title}`; no `set:html` in `src/`.
- try/catch never 500 / always 200: `loadChangelogReleases` wraps fetch + JSON + parse; page wraps the loader call and treats a throw as `{ ok: false }`. No `Astro.response.status` override (default 200). `{ ok: false }` copy is the fixed string “Could not load release notes. Try again later.” plus optional GitHub Releases link (`target="_blank"`, `rel="noopener noreferrer"`). `console.error` the cause (lessons.md).
- `per_page=30`; newest-first is API order (no client re-sort).

`change.md` stays `implementing` — this is a phase-scoped review; Phase 2 is not done. Do not stamp `impl_reviewed` until the full-plan review.

## Automated verification

| Command | Result |
|---------|--------|
| `src/pages/changelog.astro` and `src/lib/services/releases.ts` exist | PASS |
| `src/middleware.ts` `PROTECTED_ROUTES` still does not include `/changelog` | PASS |
| `npm run lint` | PASS — 0 errors (210 pre-existing warnings; new `no-console` on `releases.ts:141,147,158` and `changelog.astro:13` match the plan/`lessons.md` `console.error` pattern used on `/clans`) |
| `npm run build` | PASS — `astro build` complete (Cloudflare adapter) |

## Manual verification

Progress rows 1.5–1.8 remain `- [ ]`. YOLO skips browser click-through (Crew lock). Not a reject reason.

Static / curl substitutes (not a replacement for 1.5–1.7 signed-in chrome or 1.8 forced failure):

- Implementer curl: HTTP 200, For-users shown, no developers (logged in `crew-decisions.md`).
- This review: live GitHub list parse of 30 published releases — 0 `## For developers` / `### Technical` leaks into sections or `fallbackText`.
- Forced loader failure (temporary bad URL) was not re-exercised here.

Residual risk: signed-in Topbar on `/changelog`, and a live `{ ok: false }` HTML 200, were not opened in a browser this review.

## Findings

None.

## Notes

- Plan-review F1/F2 are implemented: raw strings, no `set:html`, one try/catch around fetch+JSON+parse, page never rethrows.
- `ReleaseEntry.astro` uses `formatStart` + `<time datetime>` — same pattern as `src/pages/runs/[id].astro`. Layout’s `time[datetime]` rewriter still runs. Not drift.
- `Cache-Control: public` is on the full HTML shell (`PageChrome` / `Topbar` is session-personalized: nickname, profile href, admin). Safe today because `cacheCloudflare()` is out of slice and this adapter does not edge-cache HTML from that header alone (plan-review residual). Do not add shared HTML caching later without `Vary` / cookie partitioning.
- Phase 2 (footer Changelog link, AGENTS.md public-route sentence) is not in this review.
