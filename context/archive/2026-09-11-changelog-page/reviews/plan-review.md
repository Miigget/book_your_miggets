<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Changelog page Implementation Plan

- **Plan**: context/changes/changelog-page/plan.md
- **Mode**: Deep
- **Date**: 2026-09-11
- **Verdict**: SOUND
- **Findings**: 0 critical 2 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 8/8 existing paths ✓ (`src/components/Footer.astro`, `src/middleware.ts`, `src/pages/clans/index.astro`, `src/layouts/Layout.astro`, `src/components/PageChrome.astro`, `AGENTS.md`, `.github/agent-workflow.yml`, `src/lib/services/`); new files `src/pages/changelog.astro` / `src/lib/services/releases.ts` / optional `src/components/changelog/ReleaseEntry.astro` absent as expected; 5/5 symbols ✓ (`PROTECTED_ROUTES` prefix-match, `PageChrome` default `max-w-3xl`, `Layout` `time[datetime]` localizer, Footer Quick Links after Browse Clans, no marked/MDX/octokit in `package.json`); brief↔plan ✓ (Crew locks: public guest page, request-time GitHub + Cache-Control on success, structured For-users parse, always 200 empty-vs-error, `per_page=30`, two LOW phases).

Code verification (no nested sub-agent; specialist checked in-repo):

- No `/changelog` route today (`src/pages/` has no changelog file). Guests would 404. `PROTECTED_ROUTES` is `["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile", "/clans/new"]` plus `EDIT_RUN_PATH`; `/changelog` is not a prefix of any of them (`middleware.ts:6-7, 59-62`).
- Public shell matches the plan: `clans/index.astro:57-120` uses `Layout title="Clans — Book Your Miggets"` + `PageChrome`, gradient `h1`, muted subtitle, frosted empty card, in-page load error (ClanError message or `"Could not load clans"`), `console.error` on catch. `PageChrome.astro:10` defaults `contentClass` to `max-w-3xl`. Footer is only imported from `PageChrome.astro:2,32`.
- Footer Quick Links (`Footer.astro:20-26`) are Browse Runs → Browse Clans → Create a Run; inserting Changelog after Browse Clans is unambiguous. Same `text-sm text-blue-100/60` / hover classes.
- `Layout.astro:41-47` rewrites `time[datetime]` with `toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })`. No existing `Astro.response.headers` or `set:html` in `src/`.
- Repo / notes SoT: `.github/agent-workflow.yml` `repo: Miigget/book_your_miggets`, `release_notes.languages: [en]`. Live `GET /repos/Miigget/book_your_miggets/releases?per_page=5` bodies already have `## For users (EN)` + `### New`/`### Improved`/`### Fixed` + `## For developers`; LF newlines (not CRLF) on the latest tag. Unauthenticated list is published-only; drafts not present. `Link: rel="next"` exists (more than 30 releases) — Crew lock is first page only; do not add pagination.
- Astro 7 + `@astrojs/cloudflare` 14.1.4: `Astro.response.headers.set('Cache-Control', …)` is documented for on-demand pages. `cacheCloudflare()` exists on this adapter major and is correctly out of scope. `output: "server"` so no `prerender` export is required. First server-side outbound `fetch` in the app (only other `fetch` is client `src/lib/fetch-form-json.ts`). `AbortSignal.timeout` is fine at `wrangler.jsonc` `compatibility_date` `2026-05-08`.
- AGENTS.md Hard Rules already say “Do not prefix-protect `/runs`” / “Do not prefix-protect `/clans`” (same bullet as `PROTECTED_ROUTES`). Phase 2 sentence belongs next to those, not a new ACL essay.
- Progress mechanical contract: one `## Progress`; Phase 1/2 headings match; every success-criteria bullet has a Progress checkbox; no `- [ ]` outside Progress. `docs/reference/contract-surfaces.md` absent — skipped.
- Blast radius: Footer change is site-wide by design (every `PageChrome` page). No other Footer callers. Loader is new; no existing GitHub client to proliferate against. Do not touch `PROTECTED_ROUTES`.

## Findings

### F1 — “Escaped-ready” loader strings will double-escape in Astro

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Releases loader + Changelog page; Critical Implementation Details
- **Detail**: Critical Implementation Details say “HTML-escape every user-authored string”. The loader contract stores `fallbackText` as “escaped-ready plain lines”, and the page says “Escape all note text.” Astro `{value}` already HTML-escapes (`set:html` is unused in this repo). Pre-escaping in `releases.ts` plus template interpolation shows `&amp;` / `&lt;` to guests. Using `set:html` to avoid that would be a new XSS-shaped pattern this codebase does not have.
- **Fix**: Keep raw (unescaped) strings in `ChangelogRelease` / `fallbackText`. Render only with Astro text interpolation `{…}` — never `set:html`. Strip `## For developers` and everything after it before fallback, as already planned.
- **Decision**: ACCEPTED — Crew Lead (YOLO, obvious one-liner); plan.md patched 2026-09-11

### F2 — Loader failure list omits parse/throw, which would 500 instead of HTTP 200

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Releases loader contract
- **Detail**: Desired end state and Phase 1 require always HTTP 200 with distinct empty vs error copy. The loader’s `{ ok: false }` cases are only “non-OK HTTP, network/timeout, or invalid JSON.” A `null` `body`, a 200 JSON value that is not an array, or a throw during heading/bullet parse is unspecified. `clans/index.astro:32-37` wraps the list call in try/catch so a loader throw cannot 500 the page; the changelog page contract does not. An uncaught throw becomes Astro/Worker 500 and breaks 1.8 / FR-013 failure UX.
- **Fix**: One try/catch around fetch + JSON + parse. `null`/empty body → empty sections (or fallbackText `""`). Non-array JSON, abort, network, non-OK HTTP, and parse throws → `console.error` + `{ ok: false }`. Page renders `{ ok: false }` as the fixed error copy and never rethrows.
- **Decision**: ACCEPTED — Crew Lead (YOLO, obvious one-liner); plan.md patched 2026-09-11

## Notes for implement

- Do not reopen Crew locks: public `/changelog` (not in `PROTECTED_ROUTES`); request-time GitHub fetch; Cache-Control only on `{ ok: true }` (including empty list); structured `## For users (EN)` New/Improved/Fixed; always 200; `per_page=30` (newest 30 only — page 2 already exists on GitHub); two phases.
- Success Cache-Control: `public, max-age=60, s-maxage=3600` is enough (“~1h s-maxage plus a short browser max-age”). Edge HTML cache without `cacheCloudflare()` remains residual, as the brief already states.
- GitHub request: `User-Agent` (app name) + `Accept: application/vnd.github+json`. Optional `X-GitHub-Api-Version: 2022-11-28`. Skip `draft` / `prerelease` even though unauthenticated list omits drafts.
- Live notes already match the gh-release template; developers section is always after For-users on recent tags. Hide empty New/Improved/Fixed headings if a section array is empty (template already drops empty subsections).
- Phase 2 AGENTS.md: one sentence beside the existing “Do not prefix-protect `/runs` / `/clans`” lines. Footer item is same-origin `/changelog`, not the GitHub Releases URL.
- YOLO: Phase Implementation Notes that pause for human manual confirmation are human-action — skip and log residual if the implement skill is in YOLO.
